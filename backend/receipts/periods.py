"""Academic year helpers for receipt periods."""
from __future__ import annotations


def academic_year_start_year(school, month: int, year: int) -> int:
    """Calendar year when the academic year containing (month, year) began."""
    start_month = getattr(school, 'academic_year_start_month', None) or 4
    return year if month >= start_month else year - 1


def academic_year_label(school, month: int, year: int) -> str:
    start = academic_year_start_year(school, month, year)
    return f'{start}-{str(start + 1)[-2:]}'


def months_in_academic_year(school, start_year: int) -> list[tuple[int, int]]:
    """List of (month, calendar_year) for 12 months of academic year starting start_year."""
    start_month = getattr(school, 'academic_year_start_month', None) or 4
    out: list[tuple[int, int]] = []
    for i in range(12):
        m = ((start_month - 1 + i) % 12) + 1
        y = start_year if m >= start_month else start_year + 1
        out.append((m, y))
    return out
