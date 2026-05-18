"""
Utility functions for School Fee Management
"""


def generate_receipt_pdf(student_fee):
    """Generate PDF receipt for fee payment using school receipt template settings."""
    from receipts.services import generate_receipt_pdf_for_student_fee

    return generate_receipt_pdf_for_student_fee(student_fee)
