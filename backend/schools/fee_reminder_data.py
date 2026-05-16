"""
Read-only aggregates for automated fee reminders (monthly + academic-year pending).

Uses existing StudentFee rows only (same basis as manual send_reminder for monthly).
"""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from django.db.models import Q

from .models import School, Student, StudentFee


def academic_month_year_pairs(school: School, ref_month: int, ref_year: int) -> list[tuple[int, int]]:
    """Calendar (month, year) tuples in the school's current academic session."""
    start_month = getattr(school, "academic_year_start_month", 4) or 4
    if ref_month >= start_month:
        start_year, end_year = ref_year, ref_year + 1
    else:
        start_year, end_year = ref_year - 1, ref_year
    end_month = start_month - 1 if start_month > 1 else 12
    months_years: list[tuple[int, int]] = []
    if start_month > 1:
        for m in range(start_month, 13):
            months_years.append((m, start_year))
        for m in range(1, end_month + 1):
            months_years.append((m, end_year))
    else:
        for m in range(1, 13):
            months_years.append((m, start_year))
    return months_years


def academic_year_label(school: School, ref_month: int, ref_year: int) -> str:
    start_month = getattr(school, "academic_year_start_month", 4) or 4
    if ref_month >= start_month:
        y0, y1 = ref_year, ref_year + 1
    else:
        y0, y1 = ref_year - 1, ref_year
    return f"{y0}-{str(y1)[-2:]}"


def monthly_pending_by_student(school: School, month: int, year: int) -> dict[int, dict]:
    """student_id -> {student: Student model row, parent_phone, pending}."""
    out: dict[int, dict] = {}
    fees = (
        StudentFee.objects.filter(student__school=school, student__is_active=True, month=month, year=year)
        .select_related("student")
        .prefetch_related("payments")
    )
    for sf in fees:
        paid = sum(Decimal(str(p.amount)) for p in sf.payments.all())
        balance = Decimal(str(sf.total_amount)) - paid
        if balance <= 0:
            continue
        sid = sf.student_id
        if sid not in out:
            out[sid] = {
                "student": sf.student,
                "parent_phone": sf.student.parent_phone,
                "pending": Decimal("0"),
            }
        out[sid]["pending"] += balance
    return out


def yearly_pending_by_student(school: School, ref_month: int, ref_year: int) -> dict[int, Decimal]:
    """Sum of positive balances on existing StudentFee rows in the academic window."""
    pairs = academic_month_year_pairs(school, ref_month, ref_year)
    if not pairs:
        return {}

    q = Q()
    for m, y in pairs:
        q |= Q(month=m, year=y)

    totals: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    fees = (
        StudentFee.objects.filter(q, student__school=school, student__is_active=True)
        .select_related("student")
        .prefetch_related("payments")
    )
    for sf in fees:
        paid = sum(Decimal(str(p.amount)) for p in sf.payments.all())
        balance = Decimal(str(sf.total_amount)) - paid
        if balance > 0:
            totals[sf.student_id] += balance
    return dict(totals)


def merged_fee_reminder_targets(
    school: School, ref_month: int, ref_year: int
) -> dict[int, dict]:
    """
    student_id -> {
      student: Student,
      parent_phone: str,
      monthly_pending: Decimal,
      yearly_pending: Decimal,
    }
    Only students with at least one positive pending (monthly and/or yearly).
    """
    monthly = monthly_pending_by_student(school, ref_month, ref_year)
    yearly = yearly_pending_by_student(school, ref_month, ref_year)
    ids = set(monthly.keys()) | set(yearly.keys())
    merged: dict[int, dict] = {}
    for sid in ids:
        m_amt = monthly.get(sid, {}).get("pending") or Decimal("0")
        y_amt = yearly.get(sid, Decimal("0"))
        if m_amt <= 0 and y_amt <= 0:
            continue
        st = monthly.get(sid, {}).get("student")
        if st is None:
            st = Student.objects.filter(id=sid, school=school, is_active=True).first()
        if not st:
            continue
        phone = (monthly.get(sid, {}).get("parent_phone") or st.parent_phone or "").strip()
        merged[sid] = {
            "student": st,
            "parent_phone": phone,
            "monthly_pending": m_amt if m_amt > 0 else Decimal("0"),
            "yearly_pending": y_amt if y_amt > 0 else Decimal("0"),
        }
    return merged
