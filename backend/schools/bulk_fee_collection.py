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
from .models import FeePayment, FeeStructure, Student, StudentFee


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
        paid = sum(float(p.amount) for p in sf.payments.all())
        balance = float(sf.total_amount) - paid
        if balance > 0:
            to_pay.append((sf, balance))

    if not to_pay:
        err = (
            "No unpaid fees for this student for the selected month"
            if only_this_month
            else "No unpaid fees for this student up to the selected month"
        )
        return Response({"error": err}, status=400)

    total = sum(b for _, b in to_pay)
    created = 0
    transaction_id = (data.get("transaction_id") or "").strip() or None

    for sf, _balance in to_pay:
        discount_amt = Decimal("0")
        payment = FeePayment.objects.create(
            student_fee=sf,
            amount=sf.total_amount,
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

    return Response(
        {
            "message": f"Recorded payment for {created} fee(s), total ₹{total:.2f}",
            "total_amount": float(total),
            "fees_cleared": created,
        },
        status=status.HTTP_201_CREATED,
    )


def compute_razorpay_amount_pay_all_pending(school, student_id, month, year, only_this_month, selected_fee_structure_ids):
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

    total = Decimal("0")
    for sf in student_fees:
        paid = sum(float(p.amount) for p in sf.payments.all())
        balance = float(sf.total_amount) - paid
        if balance > 0:
            total += Decimal(str(balance))

    if total <= 0:
        err = (
            "No unpaid fees for this student for the selected month"
            if only_this_month
            else "No unpaid fees for this student up to the selected month"
        )
        return None, err
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
                        "due_date": date(y, m, min(struct.due_day, 28)),
                    },
                )
                paid = sum(float(p.amount) for p in sf.payments.all())
                balance = float(sf.total_amount) - paid
                if balance > 0:
                    discount_pct = float(struct.yearly_discount_percent or 0) / 100 if struct.allow_yearly_payment else 0
                    to_pay.append((sf, balance, discount_pct))

        if not to_pay:
            return Response({"error": "No unpaid fees for this student in the academic year"}, status=400)

        total = sum(b for _, b, _ in to_pay)
        created = 0
        transaction_id = (data.get("transaction_id") or "").strip() or None
        for sf, balance, discount_pct in to_pay:
            discount_amt = Decimal(str(balance * discount_pct))
            payment = FeePayment.objects.create(
                student_fee=sf,
                amount=sf.total_amount,
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

    amount_after_discount = sum(float(b) * (1 - dp) for _, b, dp in to_pay) if to_pay else 0
    return Response(
        {
            "message": f"Recorded full year payment for {created} fee(s), all fee types",
            "total_amount": float(total),
            "amount_paid": float(amount_after_discount),
            "fees_cleared": created,
        },
        status=status.HTTP_201_CREATED,
    )


def compute_razorpay_amount_pay_all_year(school, student_id, month, year, selected_fee_structure_ids):
    """
    Amount the parent pays via Razorpay for full-year checkout (after discounts).
    Returns (amount_inr: Decimal, error: str|None).
    """
    student = Student.objects.filter(school=school, id=student_id).prefetch_related("fee_structure_choices").first()
    if not student:
        return None, "Student not found"

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
                        "due_date": date(y, m, min(struct.due_day, 28)),
                    },
                )
                paid = sum(float(p.amount) for p in sf.payments.all())
                balance = float(sf.total_amount) - paid
                if balance > 0:
                    discount_pct = float(struct.yearly_discount_percent or 0) / 100 if struct.allow_yearly_payment else 0
                    to_pay.append((sf, balance, discount_pct))

    if not to_pay:
        return None, "No unpaid fees for this student in the academic year"

    amount_after_discount = sum(Decimal(str(b)) * (Decimal("1") - Decimal(str(dp))) for _, b, dp in to_pay)
    return amount_after_discount, None
