"""Shared rules for whether a fee structure bills in a given calendar month."""


def is_struct_billable_for_period(struct, month, year, student, choice=None):
    """Delegate to FeeStructure model — keeps imports stable for existing callers."""
    return struct.is_billable_for_period(month, year, student, choice)
