"""Public API for receipt generation."""
from __future__ import annotations

from schools.models import Student

from .context import (
    RECEIPT_MONTHLY,
    RECEIPT_YEARLY,
    context_from_student_fee,
    context_from_student_period,
    get_or_create_settings,
    sample_context,
)
from .pdf_render import render_receipt_pdf


def _apply_overrides(ctx: dict, *, template_key: str | None, print_format: str | None) -> dict:
    if template_key:
        ctx['template_key'] = template_key
    if print_format:
        ctx['print_format'] = print_format
    return ctx


def generate_receipt_pdf_for_period(
    student: Student,
    *,
    receipt_type: str,
    month: int,
    year: int,
    template_key: str | None = None,
    print_format: str | None = None,
) -> bytes:
    school = student.school
    settings = get_or_create_settings(school)
    ctx = context_from_student_period(
        student,
        receipt_type=receipt_type,
        month=month,
        year=year,
        settings=settings,
    )
    return render_receipt_pdf(_apply_overrides(ctx, template_key=template_key, print_format=print_format))


def generate_receipt_pdf_for_student_fee(
    student_fee,
    *,
    template_key: str | None = None,
    print_format: str | None = None,
    receipt_type: str | None = None,
) -> bytes:
    """Monthly consolidated receipt for the fee's calendar month (all paid types)."""
    student = student_fee.student
    settings = get_or_create_settings(student.school)
    rtype = receipt_type or RECEIPT_MONTHLY
    if rtype == RECEIPT_YEARLY:
        ctx = context_from_student_period(
            student,
            receipt_type=RECEIPT_YEARLY,
            month=student_fee.month,
            year=student_fee.year,
            settings=settings,
        )
    else:
        ctx = context_from_student_fee(student_fee, settings)
    return render_receipt_pdf(_apply_overrides(ctx, template_key=template_key, print_format=print_format))


def generate_preview_pdf(school, settings=None, receipt_type: str = RECEIPT_MONTHLY) -> bytes:
    settings = settings or get_or_create_settings(school)
    ctx = sample_context(school, settings, receipt_type=receipt_type)
    return render_receipt_pdf(ctx)
