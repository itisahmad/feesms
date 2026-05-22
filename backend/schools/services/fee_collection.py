"""Fee collection summaries, dashboard stats, and student fee history."""
from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal

from schools.fee_periods import is_struct_billable_for_period
from schools.late_fine import unpaid_balance
from schools.models import Student, StudentFee, StudentFeeStructureChoice


def _paid_amount(student_fee: StudentFee) -> float:
    if hasattr(student_fee, "paid_total"):
        return float(student_fee.paid_total)
    return float(sum(p.amount for p in student_fee.payments.all()))


def _fee_status(total: float, paid: float) -> str:
    balance = total - paid
    if balance <= 0:
        return "paid"
    if paid > 0:
        return "partial"
    return "unpaid"


def _overall_status(pending: float, paid: float) -> str:
    if pending <= 0:
        return "fully_paid"
    if paid > 0:
        return "partial"
    return "unpaid"


def _choice_maps(student_ids: list[int]) -> tuple[dict, dict]:
    choice_ids_map: dict[int, list[int]] = {}
    choice_map: dict[tuple[int, int], StudentFeeStructureChoice] = {}
    if not student_ids:
        return choice_ids_map, choice_map
    for choice in StudentFeeStructureChoice.objects.filter(student_id__in=student_ids):
        choice_ids_map.setdefault(choice.student_id, []).append(choice.fee_structure_id)
        choice_map[(choice.student_id, choice.fee_structure_id)] = choice
    return choice_ids_map, choice_map


def _should_include_fee(sf: StudentFee, choice_ids_map, choice_map, month=None, year=None) -> bool:
    if sf.fee_structure_id not in choice_ids_map.get(sf.student_id, []):
        return False
    choice = choice_map.get((sf.student_id, sf.fee_structure_id))
    if not is_struct_billable_for_period(sf.fee_structure, sf.month, sf.year, sf.student, choice):
        return False
    eff_from = (
        (choice.effective_from if choice and choice.effective_from else None)
        or getattr(sf.student, "charges_effective_from", None)
        or sf.student.admission_date
    )
    if not eff_from:
        return True
    try:
        _, last_day = calendar.monthrange(sf.year, sf.month)
        return eff_from <= date(sf.year, sf.month, last_day)
    except (ValueError, TypeError):
        return True


def build_collection_summary(school, month: int, year: int) -> dict:
    student_fees = (
        StudentFee.objects.for_school(school)
        .up_to_month(month, year)
        .select_related("student", "student__school_class", "fee_structure__fee_type")
        .prefetch_related("payments")
        .order_by("year", "month")
    )
    student_ids = list(student_fees.values_list("student_id", flat=True).distinct())
    choice_ids_map, choice_map = _choice_maps(student_ids)

    class_data: dict = {}
    student_data: dict = {}

    for sf in student_fees:
        if not _should_include_fee(sf, choice_ids_map, choice_map):
            continue
        paid = _paid_amount(sf)
        balance = unpaid_balance(sf)
        total = balance + paid
        class_name = (
            sf.student.school_class.name
            if sf.student.school_class
            else sf.student.get_class_display()
        )
        if class_name not in class_data:
            class_data[class_name] = {
                "total_due": 0,
                "total_paid": 0,
                "total_pending": 0,
                "students": set(),
            }
        bucket = class_data[class_name]
        bucket["total_due"] += total
        bucket["total_paid"] += paid
        bucket["total_pending"] += balance
        bucket["students"].add(sf.student_id)

        sid = sf.student_id
        if sid not in student_data:
            student_data[sid] = {
                "student_id": sid,
                "student_name": sf.student.name,
                "class_name": class_name,
                "school_class_id": sf.student.school_class_id,
                "assigned_fee_structure_ids": choice_ids_map.get(sid, []),
                "parent_phone": sf.student.parent_phone,
                "fees": [],
                "total_due": 0,
                "total_paid": 0,
                "total_pending": 0,
            }
        row = student_data[sid]
        row["fees"].append({
            "student_fee_id": sf.id,
            "fee_structure_id": sf.fee_structure_id,
            "fee_type": sf.fee_structure.fee_type.name,
            "month": sf.month,
            "year": sf.year,
            "total": total,
            "amount": float(sf.amount),
            "late_fine": float(sf.late_fine),
            "paid": paid,
            "balance": balance,
            "status": _fee_status(total, paid),
            "allow_yearly_payment": sf.fee_structure.allow_yearly_payment,
            "yearly_discount_percent": float(sf.fee_structure.yearly_discount_percent or 0),
            "academic_year": sf.fee_structure.academic_year,
            "billing_period": sf.fee_structure.fee_type.billing_period,
            "amount_per_period": float(sf.fee_structure.amount),
        })
        row["total_due"] += total
        row["total_paid"] += paid
        row["total_pending"] += balance

    class_wise = [
        {
            "class_name": name,
            "total_due": round(values["total_due"], 2),
            "total_paid": round(values["total_paid"], 2),
            "total_pending": round(values["total_pending"], 2),
            "student_count": len(values["students"]),
        }
        for name, values in sorted(class_data.items())
    ]

    student_wise = []
    defaulters = []
    for row in student_data.values():
        current_month_fees = [f for f in row["fees"] if f["month"] == month and f["year"] == year]
        academic_year_complete = True
        if row["fees"]:
            by_structure: dict = {}
            for fee in row["fees"]:
                by_structure.setdefault(fee["fee_structure_id"], []).append(fee)
            academic_year_complete = all(
                all(f["balance"] <= 0 for f in fees) for fees in by_structure.values()
            )
        status = _overall_status(row["total_pending"], row["total_paid"])
        row["status"] = status
        row["detailed_status"] = {
            "academic_year_complete": academic_year_complete,
            "current_month_paid": all(f["balance"] <= 0 for f in current_month_fees) if current_month_fees else True,
            "current_month": month,
            "current_year": year,
            "has_current_month_fees": bool(current_month_fees),
        }
        row["total_due"] = round(row["total_due"], 2)
        row["total_paid"] = round(row["total_paid"], 2)
        row["total_pending"] = round(row["total_pending"], 2)
        student_wise.append(row)
        if status != "fully_paid":
            defaulters.append(row)

    return {
        "month": month,
        "year": year,
        "academic_year_start_month": school.academic_year_start_month or 4,
        "class_wise": class_wise,
        "student_wise": sorted(student_wise, key=lambda x: (x["class_name"], x["student_name"])),
        "defaulters": defaulters,
    }


def build_dashboard_stats(school, month: int, year: int) -> dict:
    student_fees = (
        StudentFee.objects.for_school(school)
        .up_to_month(month, year)
        .prefetch_related("payments")
    )
    total_due = sum(float(sf.total_amount) for sf in student_fees)
    total_paid = sum(_paid_amount(sf) for sf in student_fees)
    total_pending = total_due - total_paid

    students_count = Student.objects.filter(school=school, is_active=True).count()
    class_wise: dict = {}
    class_students: dict = {}
    student_pending: dict = {}
    unpaid_count = 0

    for sf in student_fees.select_related("student", "student__school_class"):
        paid = _paid_amount(sf)
        balance = unpaid_balance(sf)
        total = balance + paid
        class_name = (
            sf.student.school_class.name
            if sf.student.school_class
            else (sf.student.class_name or "Unassigned")
        )
        if class_name not in class_wise:
            class_wise[class_name] = {"total_due": 0, "total_paid": 0, "total_pending": 0}
            class_students[class_name] = set()
        class_wise[class_name]["total_due"] += total
        class_wise[class_name]["total_paid"] += paid
        class_wise[class_name]["total_pending"] += balance
        class_students[class_name].add(sf.student_id)
        if paid < total:
            unpaid_count += 1
            sid = sf.student_id
            if sid not in student_pending:
                student_pending[sid] = {
                    "student_name": sf.student.name,
                    "class_name": class_name,
                    "pending": 0,
                }
            student_pending[sid]["pending"] += balance

    class_wise_list = []
    for name, values in sorted(class_wise.items()):
        class_wise_list.append({
            "class_name": name,
            "total_due": round(values["total_due"], 2),
            "total_paid": round(values["total_paid"], 2),
            "total_pending": round(values["total_pending"], 2),
            "student_count": len(class_students.get(name, set())),
        })

    defaulters_list = sorted(
        [{"student_id": sid, **values, "pending": round(values["pending"], 2)} for sid, values in student_pending.items()],
        key=lambda item: -item["pending"],
    )[:10]

    collection_rate = round((total_paid / total_due * 100) if total_due > 0 else 100, 1)
    return {
        "total_due": total_due,
        "total_collected": total_paid,
        "total_pending": total_pending,
        "students_count": students_count,
        "unpaid_count": unpaid_count,
        "collection_rate": collection_rate,
        "class_wise": class_wise_list,
        "top_defaulters": defaulters_list,
        "current_month": month,
        "current_year": year,
    }


def build_student_fee_history(student: Student) -> dict:
    if student.school_class_id:
        student = Student.objects.select_related('school_class').get(pk=student.pk)

    student_fees = (
        StudentFee.objects.filter(student=student)
        .select_related("fee_structure", "fee_structure__fee_type")
        .prefetch_related("payments")
        .order_by("-year", "-month")
    )
    yearly_groups: dict = {}
    by_month: dict = {}

    for sf in student_fees:
        key = (sf.year, sf.month)
        if key not in by_month:
            by_month[key] = {"year": sf.year, "month": sf.month, "fees": [], "total_due": 0, "total_paid": 0}
        payments_list = []
        for payment in sf.payments.all():
            pmt = {
                "amount": float(payment.amount),
                "date": str(payment.payment_date),
                "mode": payment.payment_mode,
                "notes": payment.notes or "",
                "is_yearly": "Full year" in (payment.notes or ""),
            }
            payments_list.append(pmt)
            if pmt["is_yearly"]:
                group_key = (sf.fee_structure_id, str(payment.payment_date), payment.payment_mode)
                yearly_groups.setdefault(
                    group_key,
                    {
                        "fee_type": sf.fee_structure.fee_type.name,
                        "total": 0,
                        "date": str(payment.payment_date),
                        "mode": payment.payment_mode,
                    },
                )["total"] += float(payment.amount)
        paid = sum(float(p.amount) for p in sf.payments.all())
        total = float(sf.total_amount)
        by_month[key]["fees"].append({
            "id": sf.id,
            "fee_type": sf.fee_structure.fee_type.name,
            "total": total,
            "paid": paid,
            "balance": total - paid,
            "payments": payments_list,
        })
        by_month[key]["total_due"] += total
        by_month[key]["total_paid"] += paid

    yearly_payments = [
        {
            "fee_type": value["fee_type"],
            "total": round(value["total"], 2),
            "date": value["date"],
            "mode": value["mode"],
        }
        for value in yearly_groups.values()
    ]
    choices = StudentFeeStructureChoice.objects.filter(student=student).select_related("fee_structure__fee_type")
    fee_choices = [
        {
            "fee_structure_id": choice.fee_structure_id,
            "fee_type": choice.fee_structure.fee_type.name,
            "amount": float(choice.fee_structure.amount),
            "effective_from": str(choice.effective_from) if choice.effective_from else None,
        }
        for choice in choices
    ]

    school_class = student.school_class if student.school_class_id else None
    return {
        "student": {
            "id": student.id,
            "name": student.name,
            "class_name": student.get_class_display(),
            "school_class": student.school_class_id,
            "section": student.section_id,
            "class_whatsapp_group_name": (school_class.whatsapp_group_name or '') if school_class else '',
            "class_whatsapp_group_link": (school_class.whatsapp_group_link or '') if school_class else '',
            "admission_date": str(student.admission_date) if student.admission_date else None,
            "charges_effective_from": str(student.charges_effective_from) if student.charges_effective_from else None,
            "parent_name": student.parent_name,
            "parent_phone": student.parent_phone,
            "parent_email": student.parent_email or "",
            "admission_number": student.admission_number or "",
            "roll_number": student.roll_number or "",
        },
        "admission_date": str(student.admission_date) if student.admission_date else None,
        "months_with_fees": len(by_month),
        "fee_choices": fee_choices,
        "yearly_payments": yearly_payments,
        "monthly_history": sorted(by_month.values(), key=lambda item: (-item["year"], -item["month"])),
    }
