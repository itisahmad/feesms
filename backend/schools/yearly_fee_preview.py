"""Read-only full academic year fee breakdown (matches pay_all_year logic, no DB writes)."""
from __future__ import annotations

import calendar
from datetime import date

from .fee_periods import is_struct_billable_for_period
from .late_fine import compute_late_fine_for_structure, refresh_student_fee_late_fine, unpaid_balance
from .models import FeeStructure, StudentFee


def period_balance(
    student_fee: StudentFee | None,
    fee_structure: FeeStructure,
    month: int,
    year: int,
    as_of: date | None = None,
) -> float:
    """Unpaid balance for one billable period; includes late fine as of as_of."""
    as_of = as_of or date.today()
    if student_fee:
        return unpaid_balance(student_fee, as_of)
    base = float(fee_structure.amount)
    late = float(compute_late_fine_for_structure(fee_structure, month, year, as_of))
    return base + late


def should_include_period(student, struct, choice, m: int, y: int) -> bool:
    if not is_struct_billable_for_period(struct, m, y, student, choice):
        return False
    if choice and choice.effective_from:
        eff_y, eff_m = choice.effective_from.year, choice.effective_from.month
        if y < eff_y or (y == eff_y and m < eff_m):
            return False
    eff_from = getattr(student, 'charges_effective_from', None) or student.admission_date
    if eff_from:
        try:
            _, last_day = calendar.monthrange(y, m)
            if eff_from > date(y, m, last_day):
                return False
        except (ValueError, TypeError):
            pass
    return True


def build_yearly_preview_breakdown(
    student,
    student_id: int,
    structs_to_use,
    months_years: list[tuple[int, int]],
    choices: dict,
    as_of: date | None = None,
) -> tuple[list[dict], float, float]:
    """
    Returns (breakdown_items, total_after_discount, total_before_discount).
    Includes every billable unpaid period in the academic year, even if StudentFee rows
    have not been generated yet.
    """
    struct_ids = [s.id for s in structs_to_use]
    fee_by_key: dict[tuple[int, int, int], StudentFee] = {}
    if struct_ids:
        for sf in StudentFee.objects.filter(
            student_id=student_id,
            fee_structure_id__in=struct_ids,
        ).prefetch_related('payments'):
            fee_by_key[(sf.fee_structure_id, sf.month, sf.year)] = sf

    yearly_breakdown = []
    yearly_total = 0.0
    yearly_total_before_discount = 0.0

    for struct in structs_to_use:
        choice = choices.get(struct.id)
        discount_pct = (
            float(struct.yearly_discount_percent or 0) / 100 if struct.allow_yearly_payment else 0
        )
        discount_pct_display = float(struct.yearly_discount_percent or 0)

        for m, y in months_years:
            if not should_include_period(student, struct, choice, m, y):
                continue
            sf = fee_by_key.get((struct.id, m, y))
            balance = period_balance(sf, struct, m, y, as_of)
            if balance <= 0:
                continue
            after_discount = balance * (1 - discount_pct)
            late_fine = 0.0
            base_amount = float(struct.amount)
            if sf:
                refresh_student_fee_late_fine(sf, as_of)
                late_fine = float(sf.late_fine)
                base_amount = float(sf.amount)
            else:
                late_fine = float(compute_late_fine_for_structure(struct, m, y, as_of))
            yearly_breakdown.append({
                'fee_type': struct.fee_type.name,
                'fee_structure_id': struct.id,
                'month': m,
                'year': y,
                'balance': round(balance, 2),
                'amount': round(base_amount, 2),
                'late_fine': round(late_fine, 2),
                'after_discount': round(after_discount, 2),
                'discount_percent': round(discount_pct_display, 2),
            })
            yearly_total += after_discount
            yearly_total_before_discount += balance

    return yearly_breakdown, yearly_total, yearly_total_before_discount
