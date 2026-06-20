"""Build receipt context for PDF rendering (monthly / yearly consolidated)."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db.models import Prefetch
from django.utils import timezone

from schools.models import FeePayment, Student, StudentFee

from config.media_files import local_file_path

from .models import SchoolReceiptSettings
from .periods import academic_year_label, academic_year_start_year, months_in_academic_year
from .templates_registry import DEFAULT_TEMPLATE_KEY

MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

RECEIPT_MONTHLY = 'monthly'
RECEIPT_YEARLY = 'yearly'


def _generated_at_display() -> str:
    return timezone.localtime(timezone.now()).strftime('%d-%b-%Y at %I:%M %p')


def get_or_create_settings(school) -> SchoolReceiptSettings:
    settings, _ = SchoolReceiptSettings.objects.get_or_create(
        school=school,
        defaults={'template_key': DEFAULT_TEMPLATE_KEY},
    )
    return settings


def resolve_branding(school, settings: SchoolReceiptSettings | None = None) -> dict:
    settings = settings or get_or_create_settings(school)
    phone = (settings.phone.strip() or (school.phone or '')).strip()
    email = (settings.email.strip() or (school.email or '')).strip()
    return {
        'school_name': settings.school_name.strip() or school.name,
        'address': settings.address.strip() or (school.address or ''),
        'city_state': f'{school.city}, {school.state}'.strip(', '),
        'phone': phone,
        'email': email,
        'header_color': settings.header_color or '#0d9488',
        'footer_text': settings.footer_text or 'This is a computer-generated receipt.',
        'signature_label': settings.signature_label or 'Authorized Signatory',
        'signature_image_path': local_file_path(settings.signature_image),
        'stamp_text': settings.stamp_text or '',
        'show_logo': settings.show_logo,
        'logo_path': local_file_path(school.logo) if settings.show_logo and school.logo else None,
        'template_key': settings.template_key,
        'print_format': settings.print_format,
    }


def _fmt_inr(value) -> str:
    if value is None:
        return '₹ 0.00'
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return f'₹ {value:,.2f}'


def _student_fees_queryset(student, month_year_pairs: list[tuple[int, int]]):
    q = StudentFee.objects.filter(student=student).select_related(
        'fee_structure__fee_type',
    ).prefetch_related(
        Prefetch('payments', queryset=FeePayment.objects.order_by('-payment_date', '-id')),
    )
    if not month_year_pairs:
        return StudentFee.objects.none()
    from django.db.models import Q

    cond = Q()
    for m, y in month_year_pairs:
        cond |= Q(month=m, year=y)
    return q.filter(cond).order_by('year', 'month', 'fee_structure__fee_type__name')


def _build_fee_items(student_fees) -> tuple[list[dict], Decimal, Decimal, Decimal, list[dict]]:
    fee_items: list[dict] = []
    total_due = Decimal('0')
    total_paid = Decimal('0')
    payment_lines: list[dict] = []
    seen_receipts: set[str] = set()

    for sf in student_fees:
        paid = sum((p.amount for p in sf.payments.all()), Decimal('0'))
        if paid <= 0:
            continue
        total_due += sf.total_amount
        total_paid += paid
        month_label = MONTH_NAMES[sf.month] if 1 <= sf.month <= 12 else str(sf.month)
        latest = sf.payments.all()[0] if sf.payments.all() else None
        fee_items.append({
            'fee_type': sf.fee_structure.fee_type.name,
            'period': f'{month_label} {sf.year}',
            'amount': _fmt_inr(sf.total_amount),
            'paid': _fmt_inr(paid),
            'balance': _fmt_inr(sf.total_amount - paid),
            'payment_mode': latest.payment_mode if latest else '—',
            'payment_date': latest.payment_date.strftime('%d-%b-%Y') if latest else '—',
        })
        for p in sf.payments.all():
            rn = p.receipt_number or ''
            key = rn or f'{p.id}'
            if key in seen_receipts:
                continue
            seen_receipts.add(key)
            payment_lines.append({
                'receipt_number': rn or '—',
                'payment_date': p.payment_date.strftime('%d-%b-%Y'),
                'payment_mode': p.payment_mode,
                'amount': _fmt_inr(p.amount),
                'fee_type': sf.fee_structure.fee_type.name,
            })

    return fee_items, total_due, total_paid, payment_lines


def _receipt_number(school, student_id: int, receipt_type: str, month: int, year: int) -> str:
    if receipt_type == RECEIPT_YEARLY:
        start_y = academic_year_start_year(school, month, year)
        return f'RCP-{school.id}-{student_id}-Y{start_y}'
    return f'RCP-{school.id}-{student_id}-{year}{month:02d}'


def context_from_student_period(
    student,
    *,
    receipt_type: str,
    month: int,
    year: int,
    settings: SchoolReceiptSettings | None = None,
) -> dict:
    """Consolidated receipt for all paid fee types in a month or academic year."""
    school = student.school
    branding = resolve_branding(school, settings)

    if receipt_type == RECEIPT_YEARLY:
        start_y = academic_year_start_year(school, month, year)
        pairs = months_in_academic_year(school, start_y)
        period_label = f'Academic Year {academic_year_label(school, month, year)}'
        receipt_title = 'YEARLY FEE RECEIPT'
    else:
        pairs = [(month, year)]
        period_label = f'{MONTH_NAMES[month]} {year}' if 1 <= month <= 12 else f'{month}/{year}'
        receipt_title = 'MONTHLY FEE RECEIPT'

    fees_qs = _student_fees_queryset(student, pairs)
    fee_items, total_due, total_paid, payment_lines = _build_fee_items(list(fees_qs))

    if not fee_items:
        raise ValueError('No paid fees found for this period.')

    balance = total_due - total_paid
    from django.db.models import Q

    pay_cond = Q()
    for m, y in pairs:
        pay_cond |= Q(student_fee__month=m, student_fee__year=y)
    latest_payment = (
        FeePayment.objects.filter(student_fee__student=student)
        .filter(pay_cond)
        .order_by('-payment_date', '-id')
        .first()
    )

    pay_date = latest_payment.payment_date if latest_payment else date.today()
    pay_mode = latest_payment.payment_mode if latest_payment else '—'
    primary_receipt = payment_lines[0]['receipt_number'] if payment_lines else _receipt_number(
        school, student.id, receipt_type, month, year
    )

    return {
        **branding,
        'receipt_type': receipt_type,
        'receipt_title': receipt_title,
        'student_name': student.name,
        'class': student.get_class_display(),
        'parent_name': student.parent_name,
        'parent_phone': student.parent_phone or '—',
        'admission_number': student.admission_number or '—',
        'roll_number': student.roll_number or '—',
        'receipt_number': primary_receipt,
        'payment_date': pay_date.strftime('%d-%b-%Y'),
        'payment_mode': pay_mode,
        'fee_period': period_label,
        'fee_items': fee_items,
        'fee_type': ', '.join(i['fee_type'] for i in fee_items[:3]) + ('…' if len(fee_items) > 3 else ''),
        'amount': _fmt_inr(total_paid),
        'total_amount': _fmt_inr(total_due),
        'amount_paid': _fmt_inr(total_paid),
        'balance': _fmt_inr(balance),
        'is_sample': False,
        'payment_lines': payment_lines,
        'generated_at': _generated_at_display(),
    }


def sample_context(school, settings: SchoolReceiptSettings | None = None, receipt_type: str = RECEIPT_MONTHLY) -> dict:
    branding = resolve_branding(school, settings)
    today = timezone.localdate()
    receipt_title = 'MONTHLY FEE RECEIPT' if receipt_type != RECEIPT_YEARLY else 'YEARLY FEE RECEIPT'
    period = (
        f'{MONTH_NAMES[today.month]} {today.year}'
        if receipt_type != RECEIPT_YEARLY
        else academic_year_label(school, today.month, today.year)
    )
    fee_items = [
        {'fee_type': 'Tuition Fee', 'period': period, 'amount': '₹ 3,500.00', 'paid': '₹ 3,500.00', 'balance': '₹ 0.00', 'payment_mode': 'Cash', 'payment_date': today.strftime('%d-%b-%Y')},
        {'fee_type': 'Transport Fee', 'period': period, 'amount': '₹ 1,200.00', 'paid': '₹ 1,200.00', 'balance': '₹ 0.00', 'payment_mode': 'Cash', 'payment_date': today.strftime('%d-%b-%Y')},
        {'fee_type': 'Exam Fee', 'period': period, 'amount': '₹ 300.00', 'paid': '₹ 300.00', 'balance': '₹ 0.00', 'payment_mode': 'UPI', 'payment_date': today.strftime('%d-%b-%Y')},
    ]
    return {
        **branding,
        'receipt_type': receipt_type,
        'receipt_title': receipt_title,
        'student_name': 'Rahul Kumar',
        'class': 'Class 5-A',
        'parent_name': 'Mr. Rajesh Kumar',
        'parent_phone': '9876543210',
        'admission_number': 'ADM-1024',
        'roll_number': '12',
        'receipt_number': f'RCP-{school.id}-000042',
        'payment_date': today.strftime('%d-%b-%Y'),
        'payment_mode': 'Cash / UPI',
        'fee_period': period,
        'fee_items': fee_items,
        'fee_type': 'Tuition, Transport, Exam',
        'amount': '₹ 5,000.00',
        'total_amount': '₹ 5,000.00',
        'amount_paid': '₹ 5,000.00',
        'balance': '₹ 0.00',
        'is_sample': True,
        'generated_at': _generated_at_display(),
        'payment_lines': [
            {
                'receipt_number': f'RCP-{school.id}-000042',
                'payment_date': today.strftime('%d-%b-%Y'),
                'payment_mode': 'Cash',
                'amount': '₹ 5,000.00',
                'fee_type': 'Combined',
            },
        ],
    }


def context_from_student_fee(student_fee, settings: SchoolReceiptSettings | None = None) -> dict:
    """Legacy: monthly receipt for the fee's calendar month (all types paid that month)."""
    student = student_fee.student
    return context_from_student_period(
        student,
        receipt_type=RECEIPT_MONTHLY,
        month=student_fee.month,
        year=student_fee.year,
        settings=settings,
    )
