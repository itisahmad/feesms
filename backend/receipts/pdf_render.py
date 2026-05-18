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


def _contact_lines(ctx: dict) -> str:
    parts = []
    if ctx.get('phone'):
        parts.append(f"Phone: {ctx['phone']}")
    if ctx.get('email'):
        parts.append(f"Email: {ctx['email']}")
    return ' · '.join(parts)


def _school_header_block(story, ctx, st, accent, thermal: bool, centered: bool = True):
    """Logo, school name, address, phone, email."""
    logo = _logo_image(ctx, max_w=0.85 * inch if thermal else 1.05 * inch, max_h=0.5 * inch if thermal else 0.6 * inch)
    if logo and centered:
        story.append(logo)
        story.append(Spacer(1, 0.08 * inch))

    align = TA_CENTER if centered else TA_LEFT
    title_style = ParagraphStyle('HdrTitle', parent=st['title'], alignment=align)
    sub_style = ParagraphStyle('HdrSub', parent=st['subtitle'], alignment=align)

    story.append(Paragraph(ctx['school_name'], title_style))
    if ctx.get('address'):
        story.append(Paragraph(ctx['address'], sub_style))
    if ctx.get('city_state'):
        story.append(Paragraph(ctx['city_state'], sub_style))
    contact = _contact_lines(ctx)
    if contact:
        story.append(Paragraph(contact, sub_style))


def _school_header_row(story, ctx, st, accent, thermal: bool):
    """Logo left, text right (premium / modern)."""
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
    row = [[logo if logo else '', text]]
    cw = [0.95 * inch, 4.4 * inch] if not thermal else [0.65 * inch, 2.05 * inch]
    t = Table(row, colWidths=cw)
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


def _student_block(story, ctx, st, accent, thermal: bool):
    rows = [
        ['Student', ctx['student_name']],
        ['Class', ctx['class']],
        ['Parent / Guardian', ctx['parent_name']],
        ['Parent phone', ctx.get('parent_phone', '—')],
        ['Admission No.', ctx.get('admission_number', '—')],
        ['Roll No.', ctx.get('roll_number', '—')],
    ]
    cw = [1.15 * inch, 2.05 * inch] if thermal else [1.5 * inch, 3.9 * inch]
    t = Table(rows, colWidths=cw)
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


def _fee_items_table(story, ctx, st, accent, thermal: bool):
    items = ctx.get('fee_items') or []
    if not items:
        return
    story.append(Spacer(1, 0.12 * inch))
    story.append(Paragraph('Fee breakdown', ParagraphStyle(
        'FeeH', parent=st['bold'], fontSize=10, textColor=accent,
    )))
    header = ['Fee type', 'Period', 'Amount', 'Paid', 'Balance']
    rows = [header]
    for it in items:
        rows.append([
            it['fee_type'],
            it.get('period', '—'),
            it['amount'],
            it['paid'],
            it['balance'],
        ])
    if thermal:
        col_w = [0.95 * inch, 0.75 * inch, 0.7 * inch, 0.7 * inch, 0.7 * inch]
        fs = 7
    else:
        col_w = [1.35 * inch, 1.1 * inch, 0.95 * inch, 0.95 * inch, 0.95 * inch]
        fs = 8
    t = Table(rows, colWidths=col_w, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), accent),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), fs),
        ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t)


def _totals_table(story, ctx, accent, thermal: bool):
    rows = [
        ['Total due', ctx['total_amount']],
        ['Total paid', ctx['amount_paid']],
        ['Balance', ctx['balance']],
    ]
    w = 1.4 * inch if thermal else 2.0 * inch
    t = Table(rows, colWidths=[w, w])
    t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8 if thermal else 10),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#ecfdf5')),
        ('BOX', (0, 0), (-1, -1), 0.5, accent),
        ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(Spacer(1, 0.12 * inch))
    story.append(t)


def _payment_summary(story, ctx, st, accent, thermal: bool):
    lines = ctx.get('payment_lines') or []
    if len(lines) <= 1:
        story.append(Paragraph(
            f"Payment mode: <b>{ctx['payment_mode']}</b>",
            st['normal'],
        ))
        return
    story.append(Spacer(1, 0.08 * inch))
    story.append(Paragraph('Payment references', st['bold']))
    rows = [['Ref', 'Date', 'Mode', 'Amount']]
    for p in lines[:8]:
        rows.append([p['receipt_number'], p['payment_date'], p['payment_mode'], p['amount']])
    cw = [0.9 * inch, 0.75 * inch, 0.7 * inch, 0.85 * inch] if thermal else [1.2 * inch, 1.0 * inch, 1.0 * inch, 1.1 * inch]
    t = Table(rows, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 7 if thermal else 8),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t)


def _signature_block(ctx, st):
    story = []
    story.append(Spacer(1, 0.3 * inch))
    if ctx.get('stamp_text'):
        story.append(Paragraph(ctx['stamp_text'], st['subtitle']))
        story.append(Spacer(1, 0.12 * inch))
    story.append(Paragraph('_' * 28, st['normal']))
    story.append(Paragraph(ctx.get('signature_label') or 'Authorized Signatory', st['subtitle']))
    return story


def _render_classic(story, ctx, st, accent, thermal: bool):
    _school_header_block(story, ctx, st, accent, thermal)
    _receipt_title_block(story, ctx, st, accent, thermal)
    _student_block(story, ctx, st, accent, thermal)
    _fee_items_table(story, ctx, st, accent, thermal)
    _totals_table(story, ctx, accent, thermal)
    _payment_summary(story, ctx, st, accent, thermal)
    story.extend(_signature_block(ctx, st))


def _render_modern(story, ctx, st, accent, thermal: bool):
    band_w = 2.6 * inch if thermal else 6.5 * inch
    band = Table([[Paragraph(ctx['school_name'], ParagraphStyle(
        'ModBand', parent=st['title'], textColor=colors.white, alignment=TA_CENTER,
    ))]], colWidths=[band_w])
    band.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), accent),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(band)
    if ctx.get('logo_path'):
        logo = _logo_image(ctx)
        if logo:
            story.append(logo)
    contact = _contact_lines(ctx)
    meta = ' · '.join(filter(None, [ctx.get('address', ''), ctx.get('city_state', ''), contact]))
    if meta:
        story.append(Paragraph(meta, st['subtitle']))
    _receipt_title_block(story, ctx, st, accent, thermal)
    _student_block(story, ctx, st, accent, thermal)
    _fee_items_table(story, ctx, st, accent, thermal)
    _totals_table(story, ctx, accent, thermal)
    _payment_summary(story, ctx, st, accent, thermal)
    story.extend(_signature_block(ctx, st))


def _render_government(story, ctx, st, accent, thermal: bool):
    story.append(Paragraph(ctx.get('receipt_title') or 'FEE PAYMENT RECEIPT', ParagraphStyle(
        'GovH', parent=st['h2'], fontSize=13, textColor=colors.black,
    )))
    _school_header_block(story, ctx, st, accent, thermal)
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
    t = Table(box_rows, colWidths=[1.1 * inch, 2.0 * inch, 0.9 * inch, 1.6 * inch])
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
    _fee_items_table(story, ctx, st, accent, thermal)
    _totals_table(story, ctx, accent, thermal)
    story.extend(_signature_block(ctx, st))


def _render_thermal(story, ctx, st, accent, thermal: bool):
    _school_header_block(story, ctx, st, accent, thermal)
    _receipt_title_block(story, ctx, st, accent, thermal)
    for label, val in [
        ('Student', ctx['student_name']),
        ('Class', ctx['class']),
        ('Parent', ctx['parent_name']),
    ]:
        story.append(Paragraph(f"<b>{label}:</b> {val}", st['normal']))
    story.append(Spacer(1, 0.06 * inch))
    items = ctx.get('fee_items') or []
    for it in items:
        story.append(Paragraph(
            f"<b>{it['fee_type']}</b> ({it.get('period', '')}) — Paid {it['paid']}",
            st['normal'],
        ))
    story.append(Spacer(1, 0.08 * inch))
    story.append(Paragraph(f"Total paid: <b>{ctx['amount_paid']}</b>", st['bold']))
    story.append(Paragraph(f"Balance: {ctx['balance']} · {ctx['payment_mode']}", st['normal']))
    if ctx.get('footer_text'):
        story.append(Spacer(1, 0.1 * inch))
        story.append(Paragraph(ctx['footer_text'], st['footer']))


def _render_premium(story, ctx, st, accent, thermal: bool):
    _school_header_row(story, ctx, st, accent, thermal)
    story.append(Spacer(1, 0.1 * inch))
    story.append(Paragraph(ctx.get('receipt_title') or 'Official Fee Receipt', ParagraphStyle(
        'PremH', parent=st['h2'], textColor=accent,
    )))
    story.append(Paragraph(
        f"Receipt {ctx['receipt_number']} · {ctx['fee_period']} · {ctx['payment_date']}",
        st['subtitle'],
    ))
    _student_block(story, ctx, st, accent, thermal)
    _fee_items_table(story, ctx, st, accent, thermal)
    _totals_table(story, ctx, accent, thermal)
    _payment_summary(story, ctx, st, accent, thermal)
    story.extend(_signature_block(ctx, st))


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
    renderer(story, ctx, st, accent, thermal)
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
