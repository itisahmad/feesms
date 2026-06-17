"""ReportLab PDF rendering for receipt templates."""
from __future__ import annotations

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .models import SchoolReceiptSettings
from .templates_registry import DEFAULT_TEMPLATE_KEY, TEMPLATE_KEYS

THERMAL_PAGE = (80 * mm, 280 * mm)


def _hex_color(hex_str: str, fallback='#0d9488'):
    try:
        h = (hex_str or fallback).lstrip('#')
        if len(h) == 6:
            return colors.HexColor(f'#{h}')
    except Exception:
        pass
    return colors.HexColor(fallback)


def _page_size(print_format: str):
    if print_format == SchoolReceiptSettings.PRINT_THERMAL:
        return THERMAL_PAGE
    return A4


def _margins(print_format: str):
    if print_format == SchoolReceiptSettings.PRINT_THERMAL:
        return 8, 8, 12, 12
    return 40, 40, 48, 48


def _pdf_currency(value: str) -> str:
    """Helvetica cannot render ₹; use Rs. in PDF output."""
    s = str(value or '').strip()
    return s.replace('₹', 'Rs.').replace('\u20b9', 'Rs.')


def _content_width(print_format: str) -> float:
    """Usable story width in points (page width minus horizontal margins)."""
    page_w = _page_size(print_format)[0]
    left, right, _, _ = _margins(print_format)
    return page_w - left - right


def _styles(accent):
    base = getSampleStyleSheet()
    return {
        'title': ParagraphStyle(
            'RTitle',
            parent=base['Heading1'],
            fontSize=16,
            alignment=TA_CENTER,
            textColor=accent,
            spaceAfter=4,
        ),
        'subtitle': ParagraphStyle(
            'RSub',
            parent=base['Normal'],
            fontSize=9,
            alignment=TA_CENTER,
            textColor=colors.grey,
        ),
        'h2': ParagraphStyle(
            'RH2',
            parent=base['Heading2'],
            fontSize=12,
            alignment=TA_CENTER,
            spaceBefore=6,
            spaceAfter=8,
        ),
        'normal': ParagraphStyle('RNorm', parent=base['Normal'], fontSize=9),
        'bold': ParagraphStyle('RBold', parent=base['Normal'], fontSize=9, fontName='Helvetica-Bold'),
        'footer': ParagraphStyle(
            'RFoot',
            parent=base['Normal'],
            fontSize=7,
            alignment=TA_CENTER,
            textColor=colors.grey,
        ),
        'right': ParagraphStyle('RRight', parent=base['Normal'], fontSize=9, alignment=TA_RIGHT),
    }


def _logo_image(ctx: dict, max_w=1.0 * inch, max_h=0.55 * inch):
    path = ctx.get('logo_path')
    if not path:
        return None
    try:
        return Image(path, width=max_w, height=max_h, kind='proportional')
    except Exception:
        return None


def _signature_image(ctx: dict, max_w=1.4 * inch, max_h=0.55 * inch):
    path = ctx.get('signature_image_path')
    if not path:
        return None
    try:
        return Image(path, width=max_w, height=max_h, kind='proportional')
    except Exception:
        return None


def _contact_lines(ctx: dict) -> str:
    parts = []
    if ctx.get('phone'):
        parts.append(f"Phone: {ctx['phone']}")
    if ctx.get('email'):
        parts.append(f"Email: {ctx['email']}")
    return ' · '.join(parts)


def _has_logo(ctx: dict) -> bool:
    return bool(ctx.get('logo_path') and ctx.get('show_logo', True))


def _centered_logo_flowable(ctx: dict, print_format: str, thermal: bool):
    """Return a table flowable that centers the school logo within the content width."""
    content_w = _content_width(print_format)
    max_w = content_w * (0.45 if not thermal else 0.55)
    max_h = 0.85 * inch if not thermal else 0.55 * inch
    logo = _logo_image(ctx, max_w=max_w, max_h=max_h)
    if not logo:
        return None
    t = Table([[logo]], colWidths=[content_w])
    t.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    return t


def _append_school_contact(story, ctx, st, centered: bool = True):
    align = TA_CENTER if centered else TA_LEFT
    sub_style = ParagraphStyle('HdrSub', parent=st['subtitle'], alignment=align)
    if ctx.get('address'):
        story.append(Paragraph(ctx['address'], sub_style))
    if ctx.get('city_state'):
        story.append(Paragraph(ctx['city_state'], sub_style))
    contact = _contact_lines(ctx)
    if contact:
        story.append(Paragraph(contact, sub_style))


def _school_header_block(story, ctx, st, accent, thermal: bool, print_format: str = SchoolReceiptSettings.PRINT_A4, centered: bool = True):
    """Logo replaces school name when available; address and contact always below."""
    align = TA_CENTER if centered else TA_LEFT
    title_style = ParagraphStyle('HdrTitle', parent=st['title'], alignment=align)

    if _has_logo(ctx):
        logo_block = _centered_logo_flowable(ctx, print_format, thermal)
        if logo_block:
            story.append(logo_block)
            story.append(Spacer(1, 0.1 * inch))
        else:
            story.append(Paragraph(ctx['school_name'], title_style))
    else:
        story.append(Paragraph(ctx['school_name'], title_style))

    _append_school_contact(story, ctx, st, centered=centered)


def _school_header_row(story, ctx, st, accent, thermal: bool, print_format: str = SchoolReceiptSettings.PRINT_A4):
    """Premium header — logo as primary branding; falls back to name + details row."""
    if _has_logo(ctx):
        logo_block = _centered_logo_flowable(ctx, print_format, thermal)
        if logo_block:
            story.append(logo_block)
            story.append(Spacer(1, 0.08 * inch))
            _append_school_contact(story, ctx, st, centered=True)
            content_w = _content_width(print_format)
            line = Table([['']], colWidths=[content_w])
            line.setStyle(TableStyle([
                ('LINEBELOW', (0, 0), (-1, -1), 2, accent),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(line)
            return

    logo = _logo_image(ctx, max_w=0.85 * inch, max_h=0.5 * inch)
    contact = _contact_lines(ctx)
    lines = [f"<b>{ctx['school_name']}</b>"]
    if ctx.get('address'):
        lines.append(ctx['address'])
    if ctx.get('city_state'):
        lines.append(ctx['city_state'])
    if contact:
        lines.append(contact)
    text = Paragraph(
        '<br/>'.join(lines),
        ParagraphStyle('RowHead', parent=st['normal'], fontSize=10, alignment=TA_LEFT),
    )
    content_w = _content_width(print_format)
    logo_w = content_w * 0.18 if not thermal else content_w * 0.28
    text_w = content_w - logo_w
    row = [[logo if logo else '', text]]
    t = Table(row, colWidths=[logo_w, text_w])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, -1), 2, accent),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t)


def _receipt_title_block(story, ctx, st, accent, thermal: bool):
    title = ctx.get('receipt_title') or 'FEE RECEIPT'
    story.append(Spacer(1, 0.12 * inch))
    story.append(Paragraph(title, st['h2']))
    meta = f"Receipt No: <b>{ctx['receipt_number']}</b> · Period: <b>{ctx['fee_period']}</b>"
    story.append(Paragraph(meta, st['normal']))
    story.append(Paragraph(f"Payment date: {ctx['payment_date']}", st['subtitle']))
    if ctx.get('generated_at'):
        story.append(Paragraph(
            f"Receipt generated on: <b>{ctx['generated_at']}</b>",
            st['subtitle'],
        ))


def _student_block(story, ctx, st, accent, thermal: bool, print_format: str = SchoolReceiptSettings.PRINT_A4):
    rows = [
        ['Student', ctx['student_name']],
        ['Class', ctx['class']],
        ['Parent / Guardian', ctx['parent_name']],
        ['Parent phone', ctx.get('parent_phone', '—')],
        ['Admission No.', ctx.get('admission_number', '—')],
        ['Roll No.', ctx.get('roll_number', '—')],
    ]
    content_w = _content_width(print_format)
    label_w = content_w * 0.28 if not thermal else content_w * 0.35
    value_w = content_w - label_w
    t = Table(rows, colWidths=[label_w, value_w])
    style = [
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8 if thermal else 9),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TEXTCOLOR', (0, 0), (0, -1), accent),
    ]
    t.setStyle(TableStyle(style))
    story.append(Spacer(1, 0.1 * inch))
    story.append(t)


def _fee_table_col_widths(print_format: str) -> list[float]:
    content_w = _content_width(print_format)
    ratios = [0.28, 0.22, 0.17, 0.165, 0.165]
    return [content_w * r for r in ratios]


def _fee_items_table(story, ctx, st, accent, thermal: bool, print_format: str = SchoolReceiptSettings.PRINT_A4):
    items = ctx.get('fee_items') or []
    if not items:
        _totals_table(story, ctx, accent, thermal, print_format)
        return
    story.append(Spacer(1, 0.12 * inch))
    fs = 7 if thermal else 8
    title_style = ParagraphStyle(
        'FeeH', parent=st['bold'], fontSize=10, textColor=accent, alignment=TA_LEFT,
    )
    header = ['Fee type', 'Period', 'Amount', 'Paid', 'Balance']
    rows = [
        [Paragraph('Fee breakdown', title_style), '', '', '', ''],
        header,
    ]
    for it in items:
        rows.append([
            it['fee_type'],
            it.get('period', '—'),
            _pdf_currency(it['amount']),
            _pdf_currency(it['paid']),
            _pdf_currency(it['balance']),
        ])
    rows.append([
        'Total',
        '',
        _pdf_currency(ctx['total_amount']),
        _pdf_currency(ctx['amount_paid']),
        _pdf_currency(ctx['balance']),
    ])
    col_w = _fee_table_col_widths(print_format)
    totals_row = len(rows) - 1
    t = Table(rows, colWidths=col_w, repeatRows=2)
    t.setStyle(TableStyle([
        ('SPAN', (0, 0), (-1, 0)),
        ('LEFTPADDING', (0, 0), (-1, 0), 0),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('TOPPADDING', (0, 0), (-1, 0), 0),
        ('BACKGROUND', (0, 1), (-1, 1), accent),
        ('TEXTCOLOR', (0, 1), (-1, 1), colors.white),
        ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), fs),
        ('ALIGN', (2, 2), (-1, -1), 'RIGHT'),
        ('GRID', (0, 1), (-1, -1), 0.25, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 2), (-1, totals_row - 1), [colors.white, colors.HexColor('#f8fafc')]),
        ('FONTNAME', (0, totals_row), (-1, totals_row), 'Helvetica-Bold'),
        ('LINEABOVE', (0, totals_row), (-1, totals_row), 0.5, accent),
        ('TOPPADDING', (0, 1), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t)


def _totals_table(story, ctx, accent, thermal: bool, print_format: str = SchoolReceiptSettings.PRINT_A4):
    """Standalone totals row when there is no fee breakdown table."""
    fs = 8 if thermal else 8
    col_w = _fee_table_col_widths(print_format)
    rows = [[
        'Total',
        '',
        _pdf_currency(ctx['total_amount']),
        _pdf_currency(ctx['amount_paid']),
        _pdf_currency(ctx['balance']),
    ]]
    t = Table(rows, colWidths=col_w)
    t.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), fs),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('LINEABOVE', (0, 0), (-1, 0), 0.5, accent),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(Spacer(1, 0.12 * inch))
    story.append(t)


def _signature_block(ctx, st, thermal: bool = False):
    story = []
    story.append(Spacer(1, 0.5 * inch if not thermal else 0.25 * inch))
    if ctx.get('payment_mode'):
        pay_style = ParagraphStyle(
            'PayMode',
            parent=st['normal'],
            fontSize=9 if thermal else 10,
            alignment=TA_LEFT,
            spaceAfter=10,
        )
        story.append(Paragraph(f"Payment mode: <b>{ctx['payment_mode']}</b>", pay_style))
        story.append(Spacer(1, 0.2 * inch if not thermal else 0.1 * inch))
    if ctx.get('stamp_text'):
        story.append(Paragraph(ctx['stamp_text'], st['subtitle']))
        story.append(Spacer(1, 0.12 * inch))
    sig_img = _signature_image(ctx)
    if sig_img:
        story.append(sig_img)
        story.append(Spacer(1, 0.06 * inch))
    else:
        story.append(Paragraph('_' * 28, st['normal']))
    story.append(Paragraph(ctx.get('signature_label') or 'Authorized Signatory', st['subtitle']))
    return story


def _render_classic(story, ctx, st, accent, thermal: bool, print_format: str):
    _school_header_block(story, ctx, st, accent, thermal, print_format)
    _receipt_title_block(story, ctx, st, accent, thermal)
    _student_block(story, ctx, st, accent, thermal, print_format)
    _fee_items_table(story, ctx, st, accent, thermal, print_format)
    story.extend(_signature_block(ctx, st, thermal))


def _render_modern(story, ctx, st, accent, thermal: bool, print_format: str):
    content_w = _content_width(print_format)
    if _has_logo(ctx):
        logo_block = _centered_logo_flowable(ctx, print_format, thermal)
        if logo_block:
            band = Table([[logo_block]], colWidths=[content_w])
            band.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.white),
                ('BOX', (0, 0), (-1, -1), 1.5, accent),
                ('TOPPADDING', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ]))
            story.append(band)
        else:
            band = Table([[Paragraph(ctx['school_name'], ParagraphStyle(
                'ModBand', parent=st['title'], textColor=colors.white, alignment=TA_CENTER,
            ))]], colWidths=[content_w])
            band.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), accent),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(band)
    else:
        band = Table([[Paragraph(ctx['school_name'], ParagraphStyle(
            'ModBand', parent=st['title'], textColor=colors.white, alignment=TA_CENTER,
        ))]], colWidths=[content_w])
        band.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), accent),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(band)
    contact = _contact_lines(ctx)
    meta = ' · '.join(filter(None, [ctx.get('address', ''), ctx.get('city_state', ''), contact]))
    if meta:
        story.append(Paragraph(meta, st['subtitle']))
    _receipt_title_block(story, ctx, st, accent, thermal)
    _student_block(story, ctx, st, accent, thermal, print_format)
    _fee_items_table(story, ctx, st, accent, thermal, print_format)
    story.extend(_signature_block(ctx, st, thermal))


def _render_government(story, ctx, st, accent, thermal: bool, print_format: str):
    story.append(Paragraph(ctx.get('receipt_title') or 'FEE PAYMENT RECEIPT', ParagraphStyle(
        'GovH', parent=st['h2'], fontSize=13, textColor=colors.black,
    )))
    _school_header_block(story, ctx, st, accent, thermal, print_format)
    story.append(Paragraph(f"Ref: {ctx['receipt_number']} · {ctx['fee_period']}", st['right']))
    story.append(Spacer(1, 0.1 * inch))
    box_rows = [
        ['Student', ctx['student_name'], 'Class', ctx['class']],
        ['Parent', ctx['parent_name'], 'Phone', ctx.get('parent_phone', '—')],
        ['Admission', ctx.get('admission_number', '—'), 'Roll', ctx.get('roll_number', '—')],
        ['Period', ctx['fee_period'], 'Payment date', ctx['payment_date']],
    ]
    if ctx.get('generated_at'):
        box_rows.append(['Receipt generated', ctx['generated_at'], '', ''])
    content_w = _content_width(print_format)
    col_w = [content_w * 0.18, content_w * 0.32, content_w * 0.16, content_w * 0.34]
    t = Table(box_rows, colWidths=col_w)
    t.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f5f9')),
        ('BACKGROUND', (2, 0), (2, -1), colors.HexColor('#f1f5f9')),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    _fee_items_table(story, ctx, st, accent, thermal, print_format)
    story.extend(_signature_block(ctx, st, thermal))


def _render_thermal(story, ctx, st, accent, thermal: bool, print_format: str):
    _school_header_block(story, ctx, st, accent, thermal, print_format)
    _receipt_title_block(story, ctx, st, accent, thermal)
    for label, val in [
        ('Student', ctx['student_name']),
        ('Class', ctx['class']),
        ('Parent', ctx['parent_name']),
    ]:
        story.append(Paragraph(f"<b>{label}:</b> {val}", st['normal']))
    story.append(Spacer(1, 0.06 * inch))
    _fee_items_table(story, ctx, st, accent, thermal, print_format)
    story.extend(_signature_block(ctx, st, thermal))
    if ctx.get('footer_text'):
        story.append(Spacer(1, 0.1 * inch))
        story.append(Paragraph(ctx['footer_text'], st['footer']))


def _render_premium(story, ctx, st, accent, thermal: bool, print_format: str):
    _school_header_row(story, ctx, st, accent, thermal, print_format)
    story.append(Spacer(1, 0.1 * inch))
    story.append(Paragraph(ctx.get('receipt_title') or 'Official Fee Receipt', ParagraphStyle(
        'PremH', parent=st['h2'], textColor=accent,
    )))
    story.append(Paragraph(
        f"Receipt {ctx['receipt_number']} · {ctx['fee_period']} · {ctx['payment_date']}",
        st['subtitle'],
    ))
    _student_block(story, ctx, st, accent, thermal, print_format)
    _fee_items_table(story, ctx, st, accent, thermal, print_format)
    story.extend(_signature_block(ctx, st, thermal))


RENDERERS = {
    'classic': _render_classic,
    'modern_minimal': _render_modern,
    'government': _render_government,
    'thermal': _render_thermal,
    'premium': _render_premium,
}


def render_receipt_pdf(ctx: dict) -> bytes:
    """Render PDF bytes from a prepared context dict."""
    template_key = ctx.get('template_key') or DEFAULT_TEMPLATE_KEY
    if template_key not in TEMPLATE_KEYS:
        template_key = DEFAULT_TEMPLATE_KEY
    print_format = ctx.get('print_format') or SchoolReceiptSettings.PRINT_A4
    if template_key == 'thermal':
        print_format = SchoolReceiptSettings.PRINT_THERMAL

    buffer = BytesIO()
    l, r, t, b = _margins(print_format)
    doc = SimpleDocTemplate(
        buffer,
        pagesize=_page_size(print_format),
        leftMargin=l,
        rightMargin=r,
        topMargin=t,
        bottomMargin=b,
    )
    accent = _hex_color(ctx.get('header_color', '#0d9488'))
    st = _styles(accent)
    story = []
    thermal = print_format == SchoolReceiptSettings.PRINT_THERMAL
    renderer = RENDERERS.get(template_key, _render_classic)
    renderer(story, ctx, st, accent, thermal, print_format)
    story.append(Spacer(1, 0.2 * inch))
    if template_key != 'thermal':
        if ctx.get('generated_at'):
            story.append(Paragraph(
                f"Receipt generated on {ctx['generated_at']}.",
                st['footer'],
            ))
        if ctx.get('footer_text'):
            story.append(Paragraph(ctx['footer_text'], st['footer']))
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
