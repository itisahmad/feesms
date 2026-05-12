"""Shared rules for whether a fee structure bills in a given calendar month."""


def is_struct_billable_for_period(struct, month, year, student, choice=None):
    """Decide whether a fee structure should be billed for a month/year for a student."""
    start_date = None
    if choice and choice.effective_from:
        start_date = choice.effective_from
    if not start_date:
        start_date = getattr(student, "charges_effective_from", None) or student.admission_date

    if not start_date:
        return struct.should_bill_for_month(month)

    month_diff = (year - start_date.year) * 12 + (month - start_date.month)
    if month_diff < 0:
        return False

    billing_period = struct.fee_type.billing_period

    if billing_period == "monthly":
        return True
    if billing_period == "quarterly":
        return month_diff % 3 == 0
    if billing_period == "half_yearly":
        return month_diff % 6 == 0
    if billing_period == "yearly":
        return month_diff % 12 == 0
    if billing_period == "one_time":
        return month_diff == 0

    return True
