"""
Bulk fee collection (pay all pending / pay full year) — shared by REST views and Razorpay checkout.
"""
from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from .fee_periods import is_struct_billable_for_period
from .late_fine import unpaid_balance
from .models import FeePayment, FeeStructure, Student, StudentFee, StudentFeeStructureChoice


def _student_fee_balance(sf: StudentFee, as_of: date | None = None) -> float:
    return unpaid_balance(sf, as_of)


def parse_payment_adjustment(data):
    """
    Returns (adjustment_type, adjustment_amount, adjustment_notes, error_response).
    adjustment_type is None when no adjustment is applied.
    """
    adj_type = (data.get("adjustment_type") or "").strip().lower()
    raw_amount = data.get("adjustment_amount")
    adj_notes = (data.get("adjustment_notes") or "").strip()

    if not adj_type and (raw_amount is None or str(raw_amount).strip() == ""):
        return None, Decimal("0"), "", None

    try:
        amount = Decimal(str(raw_amount or 0))
    except Exception:
        return None, Decimal("0"), "", Response({"error": "Invalid adjustment_amount"}, status=400)

    if amount <= 0:
        return None, Decimal("0"), "", None

    if adj_type not in ("add", "subtract"):
        return None, Decimal("0"), "", Response({"error": "adjustment_type must be add or subtract"}, status=400)

    if not adj_notes:
        return None, Decimal("0"), "", Response(
            {"error": "adjustment_notes is required when using a payment adjustment"},
            status=400,
        )

    return adj_type, amount, adj_notes, None


def compute_total_with_adjustment(base: Decimal, adj_type, adj_amount: Decimal) -> Decimal:
    if not adj_type or adj_amount <= 0:
        return base
    if adj_type == "subtract":
        result = base - adj_amount
        return result if result > 0 else Decimal("0")
    return base + adj_amount


def append_adjustment_to_notes(notes: str, adj_type: str, adj_amount: Decimal, adj_notes: str) -> str:
    sign = "+" if adj_type == "add" else "-"
    fragment = f"Adjustment {sign}₹{adj_amount}: {adj_notes}"
    base = (notes or "").strip()
    return f"{base} | {fragment}" if base else fragment


def fee_structure_selectable_for_monthly_payment(student, fee_structure, month: int, year: int) -> bool:
    """
    Whether a fee type should appear in the monthly payment picker for (month, year).
    One-time fees already paid in a prior month are hidden for the current month.
    """
    billing = fee_structure.fee_type.billing_period
    fees = StudentFee.objects.filter(
        student_id=student.id,
        fee_structure_id=fee_structure.id,
    ).prefetch_related("payments")

    if billing == "one_time":
        for sf in fees:
            if _student_fee_balance(sf) > 0.01:
                sf_curr = fees.filter(month=month, year=year).first()
                if sf_curr and _student_fee_balance(sf_curr) > 0.01:
                    return True
                return False
        return False

    sf_curr = fees.filter(month=month, year=year).first()
    if not sf_curr:
        return False
    return _student_fee_balance(sf_curr) > 0.01


def fee_structure_is_paid_for_monthly_display(student, fee_structure, month: int, year: int) -> bool:
    """Fully paid fee types shown checked+disabled in the monthly payment picker."""
    fees = StudentFee.objects.filter(
        student_id=student.id,
        fee_structure_id=fee_structure.id,
    ).prefetch_related("payments")
    billing = fee_structure.fee_type.billing_period

    if billing == "one_time":
        for sf in fees:
            paid_amt = sum(float(p.amount) for p in sf.payments.all())
            if paid_amt > 0 and _student_fee_balance(sf) <= 0.01:
                return True
        return False

    sf_curr = fees.filter(month=month, year=year).first()
    if not sf_curr:
        return False
    paid_amt = sum(float(p.amount) for p in sf_curr.payments.all())
    return paid_amt > 0 and _student_fee_balance(sf_curr) <= 0.01


def get_payable_fee_structure_ids_for_monthly(student, school, month: int, year: int, structures) -> list[int]:
    return [s.id for s in structures if fee_structure_selectable_for_monthly_payment(student, s, month, year)]


def get_paid_fee_structure_ids_for_monthly(student, school, month: int, year: int, structures) -> list[int]:
    return [s.id for s in structures if fee_structure_is_paid_for_monthly_display(student, s, month, year)]


def parse_fee_structure_ids(raw_selected_ids):
    """Returns (list|None, error_response_or_None). None list means no filter (all structures)."""
    if raw_selected_ids is None:
        return None, None
    try:
        if isinstance(raw_selected_ids, list):
            return [int(x) for x in raw_selected_ids], None
        if str(raw_selected_ids).strip() == "":
            return [], None
        return [int(x) for x in str(raw_selected_ids).split(",") if str(x).strip()], None
    except (ValueError, TypeError):
        return None, Response({"error": "fee_structure_ids must be a list of integers"}, status=400)


def _assigned_fee_structure_ids(student) -> set[int]:
    return set(
        StudentFeeStructureChoice.objects.filter(student=student).values_list("fee_structure_id", flat=True)
    )


def _fee_structure_ids_with_unpaid_in_scope(student, month: int, year: int, only_this_month: bool) -> set[int]:
    if only_this_month:
        fee_filter = Q(month=month, year=year)
    else:
        fee_filter = Q(year__lt=year) | Q(year=year, month__lte=month)
    qs = StudentFee.objects.filter(student=student).filter(fee_filter).prefetch_related("payments")
    result: set[int] = set()
    for sf in qs:
        if _student_fee_balance(sf) > 0.01:
            result.add(sf.fee_structure_id)
    return result


def drop_declined_fee_assignments(
    student,
    selected_fee_structure_ids,
    *,
    month: int,
    year: int,
    only_this_month: bool = True,
    offered_fee_structure_ids=None,
) -> list[int]:
    """
    Unchecked fee types at payment time are treated as opt-outs: remove them from the
    student's assigned fee structures so status is not left as partial.
    """
    if selected_fee_structure_ids is None:
        return []

    assigned = _assigned_fee_structure_ids(student)
    if not assigned:
        return []

    selected = set(selected_fee_structure_ids)
    if offered_fee_structure_ids is not None:
        declined = assigned & set(offered_fee_structure_ids) - selected
    else:
        unpaid_in_scope = _fee_structure_ids_with_unpaid_in_scope(student, month, year, only_this_month)
        declined = assigned & unpaid_in_scope - selected

    if not declined:
        return []

    StudentFeeStructureChoice.objects.filter(student=student, fee_structure_id__in=declined).delete()
    return sorted(declined)


def pay_all_pending_operation(user, data, payment_mode=None, notes_override=None):
    """
    Record pay-all-pending (single month or all up to month).
    `data` matches request.data from StudentFeeViewSet.pay_all_pending.
    """
    school = user.school
    if not school:
        return Response({"error": "No school"}, status=400)

    student_id = data.get("student_id")
    month = data.get("month")
    year = data.get("year")
    payment_date = data.get("payment_date")
    payment_mode = payment_mode or data.get("payment_mode", "Cash")
    notes = notes_override if notes_override is not None else (data.get("notes", "") or "All pending payment")

    adj_type, adj_amount, adj_notes, adj_err = parse_payment_adjustment(data)
    if adj_err:
        return adj_err
    if adj_type:
        notes = append_adjustment_to_notes(notes, adj_type, adj_amount, adj_notes)

    selected_fee_structure_ids, perr = parse_fee_structure_ids(data.get("fee_structure_ids"))
    if perr:
        return perr

    if not student_id or month is None or not year or not payment_date:
        return Response({"error": "student_id, month, year, payment_date required"}, status=400)
    try:
        payment_date = date.fromisoformat(str(payment_date))
    except (ValueError, TypeError):
        return Response({"error": "Invalid payment_date"}, status=400)

    month, year = int(month), int(year)
    student = Student.objects.filter(school=school, id=student_id).first()
    if not student:
        return Response({"error": "Student not found"}, status=404)

    only_this_month = data.get("only_this_month", False)
    if only_this_month:
        fee_filter = Q(month=month, year=year)
    else:
        fee_filter = Q(year__lt=year) | Q(year=year, month__lte=month)

    student_fees = (
        StudentFee.objects.filter(student_id=student_id, student__school=school)
        .filter(fee_filter)
        .select_related("fee_structure__fee_type")
        .prefetch_related("payments")
    )
    if selected_fee_structure_ids is not None:
        student_fees = student_fees.filter(fee_structure_id__in=selected_fee_structure_ids)

    to_pay = []
    for sf in student_fees:
        balance = _student_fee_balance(sf, payment_date)
        if balance > 0:
            to_pay.append((sf, balance))

    if not to_pay:
        err = (
            "No unpaid fees for this student for the selected month"
            if only_this_month
            else "No unpaid fees for this student up to the selected month"
        )
        return Response({"error": err}, status=400)

    base_total = Decimal(str(sum(b for _, b in to_pay)))
    total = compute_total_with_adjustment(base_total, adj_type, adj_amount)
    delta = total - base_total
    created = 0
    transaction_id = (data.get("transaction_id") or "").strip() or None

    payment_rows = [(sf, Decimal(str(balance))) for sf, balance in to_pay]
    if delta != 0 and payment_rows:
        last_sf, last_amt = payment_rows[-1]
        payment_rows[-1] = (last_sf, last_amt + delta)

    dropped_ids: list[int] = []
    with transaction.atomic():
        for sf, pay_amount in payment_rows:
            if pay_amount <= 0:
                continue
            discount_amt = Decimal("0")
            payment = FeePayment.objects.create(
                student_fee=sf,
                amount=pay_amount,
                discount=discount_amt,
                payment_date=payment_date,
                payment_mode=payment_mode,
                transaction_id=transaction_id or "",
                notes=notes,
                created_by=user,
            )
            payment.receipt_number = f"RCP-{school.id}-{payment.id:06d}"
            payment.save()
            created += 1

        dropped_ids = drop_declined_fee_assignments(
            student,
            selected_fee_structure_ids,
            month=month,
            year=year,
            only_this_month=only_this_month,
        )

    message = f"Recorded payment for {created} fee(s), total ₹{float(total):.2f}"
    if dropped_ids:
        message += f". Removed {len(dropped_ids)} unselected fee type(s) from student assignment."

    return Response(
        {
            "message": message,
            "total_amount": float(total),
            "base_amount": float(base_total),
            "fees_cleared": created,
            "dropped_fee_structure_ids": dropped_ids,
        },
        status=status.HTTP_201_CREATED,
    )


def compute_razorpay_amount_pay_all_pending(
    school, student_id, month, year, only_this_month, selected_fee_structure_ids, adjustment_data=None
):
    """Return (amount_inr: Decimal, error: str|None)."""
    student = Student.objects.filter(school=school, id=student_id).first()
    if not student:
        return None, "Student not found"

    if only_this_month:
        fee_filter = Q(month=month, year=year)
    else:
        fee_filter = Q(year__lt=year) | Q(year=year, month__lte=month)

    student_fees = (
        StudentFee.objects.filter(student_id=student_id, student__school=school)
        .filter(fee_filter)
        .select_related("fee_structure__fee_type")
        .prefetch_related("payments")
    )
    if selected_fee_structure_ids is not None:
        student_fees = student_fees.filter(fee_structure_id__in=selected_fee_structure_ids)

    as_of = date.today()
    raw_payment_date = (adjustment_data or {}).get("payment_date") if adjustment_data else None
    if raw_payment_date:
        try:
            as_of = date.fromisoformat(str(raw_payment_date))
        except (ValueError, TypeError):
            pass

    total = Decimal("0")
    for sf in student_fees:
        balance = _student_fee_balance(sf, as_of)
        if balance > 0:
            total += Decimal(str(balance))

    if total <= 0:
        err = (
            "No unpaid fees for this student for the selected month"
            if only_this_month
            else "No unpaid fees for this student up to the selected month"
        )
        return None, err

    if adjustment_data:
        adj_type, adj_amount, _, adj_err = parse_payment_adjustment(adjustment_data)
        if adj_err:
            err_msg = adj_err.data.get("error", "Invalid adjustment") if hasattr(adj_err, "data") else "Invalid adjustment"
            return None, err_msg
        total = compute_total_with_adjustment(total, adj_type, adj_amount)

    return total, None



def pay_all_year_operation(user, data, payment_mode=None, notes_override=None):
    """Record full academic year payment for all selected fee types."""
    school = user.school
    if not school:
        return Response({"error": "No school"}, status=400)

    student_id = data.get("student_id")
    month = data.get("month")
    year = data.get("year")
    payment_date = data.get("payment_date")
    payment_mode = payment_mode or data.get("payment_mode", "Cash")
    notes = notes_override if notes_override is not None else (data.get("notes", "") or "Full year payment (all fee types)")

    adj_type, adj_amount, adj_notes, adj_err = parse_payment_adjustment(data)
    if adj_err:
        return adj_err
    if adj_type:
        notes = append_adjustment_to_notes(notes, adj_type, adj_amount, adj_notes)

    selected_fee_structure_ids, perr = parse_fee_structure_ids(data.get("fee_structure_ids"))
    if perr:
        return perr

    if not student_id or month is None or not year or not payment_date:
        return Response({"error": "student_id, month, year, payment_date required"}, status=400)
    try:
        payment_date = date.fromisoformat(str(payment_date))
    except (ValueError, TypeError):
        return Response({"error": "Invalid payment_date"}, status=400)

    month, year = int(month), int(year)
    student = Student.objects.filter(school=school, id=student_id).prefetch_related("fee_structure_choices").first()
    if not student:
        return Response({"error": "Student not found"}, status=404)

    start_month = getattr(school, "academic_year_start_month", 4) or 4
    if month >= start_month:
        start_year, end_year = year, year + 1
    else:
        start_year, end_year = year - 1, year
    end_month = start_month - 1 if start_month > 1 else 12
    months_years = []
    if start_month > 1:
        for m in range(start_month, 13):
            months_years.append((m, start_year))
        for m in range(1, end_month + 1):
            months_years.append((m, end_year))
    else:
        for m in range(1, 13):
            months_years.append((m, start_year))

    academic_year_str = f"{start_year}-{str(end_year)[-2:]}"
    structures = FeeStructure.objects.filter(school=school, academic_year=academic_year_str).select_related("fee_type")
    if student.school_class:
        structures = structures.filter(school_class=student.school_class)
    else:
        structures = structures.filter(school_class__isnull=True)

    choices = {c.fee_structure_id: c for c in student.fee_structure_choices.all()}
    if choices:
        structs_to_use = [s for s in structures if s.id in choices]
    else:
        structs_to_use = [
            s
            for s in structures
            if not s.fee_type.name.lower().startswith("transport") or getattr(student, "uses_transport", True)
        ]

    offered_struct_ids = [s.id for s in structs_to_use]

    if selected_fee_structure_ids is not None:
        selected_qs = FeeStructure.objects.filter(school=school, id__in=selected_fee_structure_ids).select_related("fee_type")
        if student.school_class:
            selected_qs = selected_qs.filter(Q(school_class=student.school_class) | Q(school_class__isnull=True))
        else:
            selected_qs = selected_qs.filter(school_class__isnull=True)
        structs_to_use = list(selected_qs)

    if not structs_to_use:
        existing_fee_struct_ids = StudentFee.objects.filter(
            student_id=student_id,
            student__school=school,
        ).values_list("fee_structure_id", flat=True).distinct()
        if existing_fee_struct_ids:
            fallback_structs = list(
                FeeStructure.objects.filter(id__in=existing_fee_struct_ids, school=school).select_related("fee_type")
            )
        else:
            fallback_structs = []
        if not fallback_structs and student.school_class:
            fallback_structs = list(
                FeeStructure.objects.filter(school=school, school_class=student.school_class)
                .select_related("fee_type")
                .order_by("-academic_year")[:20]
            )
        if not fallback_structs:
            fallback_structs = list(
                FeeStructure.objects.filter(school=school, school_class__isnull=True)
                .select_related("fee_type")
                .order_by("-academic_year")[:20]
            )
        if fallback_structs and not choices:
            fallback_structs = [
                s
                for s in fallback_structs
                if not s.fee_type.name.lower().startswith("transport") or getattr(student, "uses_transport", True)
            ]
        structs_to_use = fallback_structs

    to_pay = []
    with transaction.atomic():
        for struct in structs_to_use:
            choice = choices.get(struct.id)
            if choice and choice.effective_from:
                eff_y, eff_m = choice.effective_from.year, choice.effective_from.month
            else:
                eff_y, eff_m = None, None
            for m, y in months_years:
                if not is_struct_billable_for_period(struct, m, y, student, choice):
                    continue
                if eff_y is not None and (y < eff_y or (y == eff_y and m < eff_m)):
                    continue
                eff_from = getattr(student, "charges_effective_from", None) or student.admission_date
                if eff_from:
                    try:
                        _, last_day = calendar.monthrange(y, m)
                        if eff_from > date(y, m, last_day):
                            continue
                    except (ValueError, TypeError):
                        pass
                sf, _ = StudentFee.objects.get_or_create(
                    student_id=student_id,
                    fee_structure_id=struct.id,
                    month=m,
                    year=y,
                    defaults={
                        "amount": struct.amount,
                        "late_fine": 0,
                        "total_amount": struct.amount,
                        "due_date": struct.due_date_for(m, y),
                    },
                )
                balance = _student_fee_balance(sf, payment_date)
                if balance > 0:
                    discount_pct = float(struct.yearly_discount_percent or 0) / 100 if struct.allow_yearly_payment else 0
                    to_pay.append((sf, balance, discount_pct))

        if not to_pay:
            return Response({"error": "No unpaid fees for this student in the academic year"}, status=400)

        base_paid = Decimal(str(sum(float(b) * (1 - dp) for _, b, dp in to_pay)))
        total_paid = compute_total_with_adjustment(base_paid, adj_type, adj_amount)
        delta = total_paid - base_paid
        created = 0
        transaction_id = (data.get("transaction_id") or "").strip() or None
        payment_rows = []
        for sf, balance, discount_pct in to_pay:
            pay_amt = Decimal(str(float(balance) * (1 - discount_pct)))
            payment_rows.append((sf, pay_amt, discount_pct))
        if delta != 0 and payment_rows:
            last_sf, last_amt, last_dp = payment_rows[-1]
            payment_rows[-1] = (last_sf, last_amt + delta, last_dp)
        for sf, pay_amount, discount_pct in payment_rows:
            if pay_amount <= 0:
                continue
            discount_amt = Decimal(str(float(sf.total_amount) * discount_pct)) if discount_pct else Decimal("0")
            payment = FeePayment.objects.create(
                student_fee=sf,
                amount=pay_amount,
                discount=discount_amt,
                payment_date=payment_date,
                payment_mode=payment_mode,
                transaction_id=transaction_id or "",
                notes=notes,
                created_by=user,
            )
            payment.receipt_number = f"RCP-{school.id}-{payment.id:06d}"
            payment.save()
            created += 1

        dropped_ids = drop_declined_fee_assignments(
            student,
            selected_fee_structure_ids,
            month=month,
            year=year,
            offered_fee_structure_ids=offered_struct_ids,
        )

    message = f"Recorded full year payment for {created} fee(s), all fee types"
    if dropped_ids:
        message += f". Removed {len(dropped_ids)} unselected fee type(s) from student assignment."

    return Response(
        {
            "message": message,
            "total_amount": float(sum(b for _, b, _ in to_pay)),
            "amount_paid": float(total_paid),
            "base_amount": float(base_paid),
            "fees_cleared": created,
            "dropped_fee_structure_ids": dropped_ids,
        },
        status=status.HTTP_201_CREATED,
    )


def compute_razorpay_amount_pay_all_year(
    school, student_id, month, year, selected_fee_structure_ids, adjustment_data=None
):
    """
    Amount the parent pays via Razorpay for full-year checkout (after discounts).
    Returns (amount_inr: Decimal, error: str|None).
    """
    student = Student.objects.filter(school=school, id=student_id).prefetch_related("fee_structure_choices").first()
    if not student:
        return None, "Student not found"

    as_of = date.today()
    raw_payment_date = (adjustment_data or {}).get("payment_date") if adjustment_data else None
    if raw_payment_date:
        try:
            as_of = date.fromisoformat(str(raw_payment_date))
        except (ValueError, TypeError):
            pass

    start_month = getattr(school, "academic_year_start_month", 4) or 4
    if month >= start_month:
        start_year, end_year = year, year + 1
    else:
        start_year, end_year = year - 1, year
    end_month = start_month - 1 if start_month > 1 else 12
    months_years = []
    if start_month > 1:
        for m in range(start_month, 13):
            months_years.append((m, start_year))
        for m in range(1, end_month + 1):
            months_years.append((m, end_year))
    else:
        for m in range(1, 13):
            months_years.append((m, start_year))

    academic_year_str = f"{start_year}-{str(end_year)[-2:]}"
    structures = FeeStructure.objects.filter(school=school, academic_year=academic_year_str).select_related("fee_type")
    if student.school_class:
        structures = structures.filter(school_class=student.school_class)
    else:
        structures = structures.filter(school_class__isnull=True)

    choices = {c.fee_structure_id: c for c in student.fee_structure_choices.all()}
    if choices:
        structs_to_use = [s for s in structures if s.id in choices]
    else:
        structs_to_use = [
            s
            for s in structures
            if not s.fee_type.name.lower().startswith("transport") or getattr(student, "uses_transport", True)
        ]

    if selected_fee_structure_ids is not None:
        selected_qs = FeeStructure.objects.filter(school=school, id__in=selected_fee_structure_ids).select_related("fee_type")
        if student.school_class:
            selected_qs = selected_qs.filter(Q(school_class=student.school_class) | Q(school_class__isnull=True))
        else:
            selected_qs = selected_qs.filter(school_class__isnull=True)
        structs_to_use = list(selected_qs)

    if not structs_to_use:
        existing_fee_struct_ids = StudentFee.objects.filter(
            student_id=student_id,
            student__school=school,
        ).values_list("fee_structure_id", flat=True).distinct()
        if existing_fee_struct_ids:
            fallback_structs = list(
                FeeStructure.objects.filter(id__in=existing_fee_struct_ids, school=school).select_related("fee_type")
            )
        else:
            fallback_structs = []
        if not fallback_structs and student.school_class:
            fallback_structs = list(
                FeeStructure.objects.filter(school=school, school_class=student.school_class)
                .select_related("fee_type")
                .order_by("-academic_year")[:20]
            )
        if not fallback_structs:
            fallback_structs = list(
                FeeStructure.objects.filter(school=school, school_class__isnull=True)
                .select_related("fee_type")
                .order_by("-academic_year")[:20]
            )
        if fallback_structs and not choices:
            fallback_structs = [
                s
                for s in fallback_structs
                if not s.fee_type.name.lower().startswith("transport") or getattr(student, "uses_transport", True)
            ]
        structs_to_use = fallback_structs

    to_pay = []
    with transaction.atomic():
        for struct in structs_to_use:
            choice = choices.get(struct.id)
            if choice and choice.effective_from:
                eff_y, eff_m = choice.effective_from.year, choice.effective_from.month
            else:
                eff_y, eff_m = None, None
            for m, y in months_years:
                if not is_struct_billable_for_period(struct, m, y, student, choice):
                    continue
                if eff_y is not None and (y < eff_y or (y == eff_y and m < eff_m)):
                    continue
                eff_from = getattr(student, "charges_effective_from", None) or student.admission_date
                if eff_from:
                    try:
                        _, last_day = calendar.monthrange(y, m)
                        if eff_from > date(y, m, last_day):
                            continue
                    except (ValueError, TypeError):
                        pass
                sf, _ = StudentFee.objects.get_or_create(
                    student_id=student_id,
                    fee_structure_id=struct.id,
                    month=m,
                    year=y,
                    defaults={
                        "amount": struct.amount,
                        "late_fine": 0,
                        "total_amount": struct.amount,
                        "due_date": struct.due_date_for(m, y),
                    },
                )
                balance = _student_fee_balance(sf, as_of)
                if balance > 0:
                    discount_pct = float(struct.yearly_discount_percent or 0) / 100 if struct.allow_yearly_payment else 0
                    to_pay.append((sf, balance, discount_pct))

    if not to_pay:
        return None, "No unpaid fees for this student in the academic year"

    amount_after_discount = sum(Decimal(str(b)) * (Decimal("1") - Decimal(str(dp))) for _, b, dp in to_pay)
    if adjustment_data:
        adj_type, adj_amount, _, adj_err = parse_payment_adjustment(adjustment_data)
        if adj_err:
            err_msg = adj_err.data.get("error", "Invalid adjustment") if hasattr(adj_err, "data") else "Invalid adjustment"
            return None, err_msg
        amount_after_discount = compute_total_with_adjustment(amount_after_discount, adj_type, adj_amount)
    return amount_after_discount, None
