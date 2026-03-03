"""
Utility functions for School Fee Management
"""
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT


def generate_receipt_pdf(student_fee):
    """Generate PDF receipt for fee payment"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=50, leftMargin=50, topMargin=50, bottomMargin=50)
    styles = getSampleStyleSheet()
    story = []

    school = student_fee.student.school
    student = student_fee.student

    # School header
    title_style = ParagraphStyle(
        'SchoolTitle',
        parent=styles['Heading1'],
        fontSize=18,
        alignment=TA_CENTER,
    )
    story.append(Paragraph(school.name, title_style))
    story.append(Spacer(1, 0.2 * inch))
    if school.address:
        story.append(Paragraph(school.address, styles['Normal']))
    story.append(Paragraph(f"{school.city}, {school.state}", styles['Normal']))
    story.append(Spacer(1, 0.3 * inch))

    # Receipt title
    story.append(Paragraph("FEE RECEIPT", ParagraphStyle('ReceiptTitle', parent=styles['Heading2'], alignment=TA_CENTER)))
    story.append(Spacer(1, 0.3 * inch))

    # Student info
    info_data = [
        ['Student Name:', student.name],
        ['Class:', student.class_name],
        ['Parent:', student.parent_name],
        ['Fee Period:', f"{student_fee.month}/{student_fee.year}"],
        ['Fee Type:', student_fee.fee_structure.fee_type.name],
    ]
    info_table = Table(info_data, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.3 * inch))

    # Payment details
    paid_amount = sum(p.amount for p in student_fee.payments.all())
    total = float(student_fee.total_amount)
    balance = total - paid_amount

    payment_data = [
        ['Total Amount', f'₹ {student_fee.total_amount}'],
        ['Amount Paid', f'₹ {paid_amount:.2f}'],
        ['Balance Due', f'₹ {balance:.2f}'],
    ]

    payment_table = Table(payment_data, colWidths=[3*inch, 3*inch])
    payment_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, 2), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('BACKGROUND', (0, 0), (-1, 2), colors.HexColor('#f0f0f0')),
    ]))
    story.append(payment_table)
    story.append(Spacer(1, 0.5 * inch))

    # Footer
    story.append(Paragraph("Thank you for your payment!", ParagraphStyle('Thanks', parent=styles['Normal'], alignment=TA_CENTER)))
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("This is a computer-generated receipt.", ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER, textColor=colors.grey)))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
