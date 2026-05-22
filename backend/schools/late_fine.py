"""Late fine calculation from fee structure due date and per-day rate."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from .models import FeeStructure, StudentFee


def late_fine_days(due_date: date | None, as_of: date) -> int:
    if not due_date or as_of <= due_date:
        return 0
    return (as_of - due_date).days


def compute_late_fine_amount(
    *,
    amount: Decimal,
    due_date: date | None,
    late_fine_per_day,
    as_of: date | None = None,
) -> Decimal:
    as_of = as_of or date.today()
    per_day = Decimal(str(late_fine_per_day or 0))
    if per_day <= 0:
        return Decimal("0")
    days = late_fine_days(due_date, as_of)
    if days <= 0:
        return Decimal("0")
    return per_day * days


def compute_late_fine_for_structure(
    fee_structure: FeeStructure,
    month: int,
    year: int,
    as_of: date | None = None,
) -> Decimal:
    due = fee_structure.due_date_for(month, year)
    return compute_late_fine_amount(
        amount=fee_structure.amount,
        due_date=due,
        late_fine_per_day=fee_structure.late_fine_per_day,
        as_of=as_of,
    )


def refresh_student_fee_late_fine(
    student_fee: StudentFee,
    as_of: date | None = None,
    *,
    save: bool = True,
) -> StudentFee:
    """Recompute late_fine and total_amount (amount + late_fine) as of payment/preview date."""
    as_of = as_of or date.today()
    struct = student_fee.fee_structure
    late = compute_late_fine_amount(
        amount=student_fee.amount,
        due_date=student_fee.due_date,
        late_fine_per_day=struct.late_fine_per_day,
        as_of=as_of,
    )
    new_total = student_fee.amount + late
    if student_fee.late_fine != late or student_fee.total_amount != new_total:
        student_fee.late_fine = late
        student_fee.total_amount = new_total
        if save:
            student_fee.save(update_fields=["late_fine", "total_amount"])
    return student_fee


def unpaid_balance(student_fee: StudentFee, as_of: date | None = None, *, refresh: bool = True) -> float:
    if refresh:
        refresh_student_fee_late_fine(student_fee, as_of)
    paid = sum(float(p.amount) for p in student_fee.payments.all())
    return max(0.0, float(student_fee.total_amount) - paid)
