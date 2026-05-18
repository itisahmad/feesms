from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from schools.models import Student, StudentFee

from schools.permissions import IsSchoolMember

from .context import RECEIPT_MONTHLY, RECEIPT_YEARLY, get_or_create_settings
from .permissions import (
    assert_can_edit_template_settings,
    assert_can_manage_receipt_designer,
    assert_can_print_receipt,
    assert_can_view_templates,
)
from .serializers import SchoolReceiptSettingsSerializer, catalog_serializer_data
from .services import (
    generate_preview_pdf,
    generate_receipt_pdf_for_period,
    generate_receipt_pdf_for_student_fee,
)
from .templates_registry import TEMPLATE_KEYS, get_template_meta


class ReceiptTemplateListView(APIView):
    permission_classes = [IsSchoolMember]

    def get(self, request):
        assert_can_view_templates(request.user)
        return Response(catalog_serializer_data())


class SchoolReceiptSettingsView(APIView):
    permission_classes = [IsSchoolMember]

    def get(self, request):
        assert_can_view_templates(request.user)
        school = request.user.school
        settings = get_or_create_settings(school)
        return Response(SchoolReceiptSettingsSerializer(settings).data)

    def patch(self, request):
        assert_can_edit_template_settings(request.user)
        school = request.user.school
        settings = get_or_create_settings(school)
        serializer = SchoolReceiptSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        template_key = serializer.validated_data.get('template_key', settings.template_key)
        print_format = serializer.validated_data.get('print_format', settings.print_format)
        meta = get_template_meta(template_key)
        if meta:
            if print_format == 'thermal' and not meta.get('supports_thermal'):
                return Response(
                    {'print_format': 'This template does not support thermal format.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if print_format == 'a4' and not meta.get('supports_a4'):
                return Response(
                    {'print_format': 'This template is thermal-only. Choose thermal format.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        serializer.save()
        return Response(serializer.data)


class ReceiptPreviewView(APIView):
    permission_classes = [IsSchoolMember]

    def post(self, request):
        assert_can_manage_receipt_designer(request.user, 'view')
        school = request.user.school
        settings = get_or_create_settings(school)
        overrides = request.data or {}
        for field in SchoolReceiptSettingsSerializer.Meta.fields:
            if field in overrides and field != 'updated_at':
                setattr(settings, field, overrides[field])
        receipt_type = overrides.get('receipt_type') or RECEIPT_MONTHLY
        if receipt_type not in (RECEIPT_MONTHLY, RECEIPT_YEARLY):
            receipt_type = RECEIPT_MONTHLY
        pdf = generate_preview_pdf(school, settings, receipt_type=receipt_type)
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = 'inline; filename="receipt-preview.pdf"'
        return response


class ReceiptGenerateView(APIView):
    """Generate a consolidated monthly or yearly receipt PDF for a student."""

    permission_classes = [IsSchoolMember]

    def post(self, request):
        assert_can_print_receipt(request.user)
        school = request.user.school
        data = request.data or {}

        template_key = data.get('template_key') or None
        print_format = data.get('print_format') or None
        if template_key and template_key not in TEMPLATE_KEYS:
            return Response({'template_key': 'Invalid template.'}, status=status.HTTP_400_BAD_REQUEST)

        meta = get_template_meta(template_key) if template_key else None
        if meta and print_format == 'thermal' and not meta.get('supports_thermal'):
            return Response({'print_format': 'Template does not support thermal.'}, status=status.HTTP_400_BAD_REQUEST)
        if meta and print_format == 'a4' and not meta.get('supports_a4'):
            return Response({'print_format': 'Template is thermal-only.'}, status=status.HTTP_400_BAD_REQUEST)

        student_id = data.get('student_id')
        receipt_type = data.get('receipt_type') or RECEIPT_MONTHLY
        month = data.get('month')
        year = data.get('year')
        student_fee_id = data.get('student_fee_id')

        try:
            if student_id:
                if receipt_type not in (RECEIPT_MONTHLY, RECEIPT_YEARLY):
                    return Response(
                        {'receipt_type': 'Must be monthly or yearly.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if month is None or year is None:
                    return Response(
                        {'month': 'Required.', 'year': 'Required.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                student = get_object_or_404(Student, pk=student_id, school=school)
                pdf = generate_receipt_pdf_for_period(
                    student,
                    receipt_type=receipt_type,
                    month=int(month),
                    year=int(year),
                    template_key=template_key,
                    print_format=print_format,
                )
                period_slug = f'{year}-{int(month):02d}' if receipt_type == RECEIPT_MONTHLY else f'year-{year}'
            elif student_fee_id:
                student_fee = get_object_or_404(
                    StudentFee.objects.select_related(
                        'student__school',
                        'fee_structure__fee_type',
                    ).prefetch_related('payments'),
                    pk=student_fee_id,
                    student__school=school,
                )
                from decimal import Decimal

                paid = sum((p.amount for p in student_fee.payments.all()), Decimal('0'))
                if paid <= 0:
                    return Response(
                        {'error': 'No payment recorded for this fee yet. Record a payment before printing a receipt.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                rtype = receipt_type if receipt_type in (RECEIPT_MONTHLY, RECEIPT_YEARLY) else RECEIPT_MONTHLY
                pdf = generate_receipt_pdf_for_student_fee(
                    student_fee,
                    template_key=template_key,
                    print_format=print_format,
                    receipt_type=rtype,
                )
                student = student_fee.student
                period_slug = f'{student_fee.year}-{student_fee.month:02d}'
            else:
                return Response(
                    {'student_id': 'Provide student_id (with month, year) or student_fee_id.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        name = student.name.replace(' ', '-')
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="receipt-{name}-{period_slug}.pdf"'
        return response
