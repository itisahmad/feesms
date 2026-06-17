"""
REST API Views for School Fee Management
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Sum, Q
from django.utils import timezone
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth import get_user_model
from datetime import datetime
from decimal import Decimal
from django.utils.encoding import force_bytes, force_str

from ..models import (User, School, SchoolClass, Section, ClassSubject, Student, FeeType, FeeStructure,
                     StudentFeeStructureChoice, StudentFee, FeePayment,
                     ExpenseCategory, Vendor, Expense, Budget)
from ..messaging import send_sms_message, send_whatsapp_message
from ..serializers import (
    UserSerializer, RegisterSerializer, SchoolSerializer, SchoolClassSerializer, SectionSerializer,
    ClassSubjectSerializer,
    StaffUserCreateSerializer, StaffUserUpdateSerializer, ForgotPasswordSerializer, ResetPasswordSerializer,
    StudentSerializer, FeeTypeSerializer, FeeStructureSerializer,
    StudentFeeSerializer, StudentFeeCreateSerializer, FeePaymentSerializer,
    ExpenseCategorySerializer, VendorSerializer, ExpenseSerializer, BudgetSerializer, ExpenseReportSerializer
)
from ..default_fee_types import ensure_default_fee_types_for_school
from ..fee_periods import is_struct_billable_for_period
from ..bulk_fee_collection import pay_all_pending_operation, pay_all_year_operation
from ..mixins import SchoolNestedMixin, SchoolScopedMixin
from ..permissions import HasModulePermission, IsSchoolOwner
from payments.subscription_service import can_fit_plan, plan_change_requires_payment, sync_school_subscription
from ..services.fee_collection import (
    build_collection_summary,
    build_dashboard_stats,
    build_student_fee_history,
)


class SchoolViewSet(viewsets.ModelViewSet):
    serializer_class = SchoolSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    module_key = "settings"
    action_module_map = {
        "verify_parent_phone_send": "students",
        "verify_parent_phone_confirm": "students",
    }

    def get_queryset(self):
        if self.request.user.school:
            return School.objects.filter(id=self.request.user.school_id)
        return School.objects.none()

    @action(detail=True, methods=['post'])
    def upgrade_plan(self, request, pk=None):
        school = self.get_object()
        user = request.user
        if user.role != 'owner':
            return Response({'error': 'Only school owner can change plan.'}, status=403)

        plan = (request.data.get('plan') or '').strip().lower()
        if plan not in ('basic', 'standard', 'premium'):
            return Response({'error': 'Invalid plan. Use basic, standard, or premium.'}, status=400)

        if plan_change_requires_payment(school.plan, plan):
            return Response(
                {
                    'error': 'Upgrades and renewals require online payment in Settings → Subscription.',
                    'requires_payment': True,
                },
                status=402,
            )

        if not can_fit_plan(school, plan):
            from payments.subscription_service import school_usage
            usage = school_usage(school)
            limits = School.PLAN_LIMITS[plan]
            return Response(
                {
                    'error': (
                        f'Cannot switch to {plan}: you have {usage["students"]} students (max {limits["max_students"]}) '
                        f'and {usage["staff"]} staff logins (max {limits["max_staff_logins"]}). '
                        'Remove students or staff first.'
                    ),
                },
                status=400,
            )

        school.apply_plan(plan)
        return Response({
            'message': f'Plan downgraded to {plan}.',
            'plan': school.plan,
            'max_students': school.max_students,
            'max_staff_logins': school.max_staff_logins,
        })

    @action(detail=False, methods=['post'], url_path='verify-parent-phone/send')
    def verify_parent_phone_send(self, request):
        school = request.user.school
        if not school:
            return Response({'error': 'No school associated with this account.'}, status=status.HTTP_400_BAD_REQUEST)
        phone = request.data.get('phone', '')
        from ..phone_otp import PhoneOTPError, send_enrollment_otp
        try:
            result = send_enrollment_otp(school, phone)
            return Response(result)
        except PhoneOTPError as exc:
            return Response({'error': exc.message}, status=exc.status_code)

    @action(detail=False, methods=['post'], url_path='verify-parent-phone/confirm')
    def verify_parent_phone_confirm(self, request):
        school = request.user.school
        if not school:
            return Response({'error': 'No school associated with this account.'}, status=status.HTTP_400_BAD_REQUEST)
        phone = request.data.get('phone', '')
        otp = request.data.get('otp', '')
        from ..phone_otp import PhoneOTPError, confirm_enrollment_otp
        try:
            result = confirm_enrollment_otp(school, phone, otp)
            return Response(result)
        except PhoneOTPError as exc:
            return Response({'error': exc.message}, status=exc.status_code)


class SchoolClassViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    serializer_class = SchoolClassSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    module_key = "classes"

    def get_queryset(self):
        school = self.get_user_school()
        if not school:
            return SchoolClass.objects.none()
        return (
            SchoolClass.objects.filter(school=school)
            .prefetch_related('sections', 'subjects')
            .order_by('display_order', 'name')
        )

    @action(detail=True, methods=['post'])
    def add_section(self, request, pk=None):
        school_class = self.get_object()
        name = request.data.get('name', '').strip()
        if not name:
            return Response({'error': 'Section name required'}, status=status.HTTP_400_BAD_REQUEST)
        if Section.objects.filter(school_class=school_class, name=name).exists():
            return Response({'error': f'Section "{name}" already exists'}, status=status.HTTP_400_BAD_REQUEST)
        order = school_class.sections.count()
        section = Section.objects.create(school_class=school_class, name=name, display_order=order)
        return Response(SectionSerializer(section).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post', 'patch'])
    def update_section(self, request, pk=None):
        school_class = self.get_object()
        section_id = request.data.get('section_id')
        name = request.data.get('name', '').strip()
        if not section_id:
            return Response({'error': 'section_id required'}, status=status.HTTP_400_BAD_REQUEST)
        if not name:
            return Response({'error': 'Section name required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            section = Section.objects.get(pk=section_id, school_class=school_class)
        except Section.DoesNotExist:
            return Response({'error': 'Section not found'}, status=status.HTTP_404_NOT_FOUND)
        if Section.objects.filter(school_class=school_class, name=name).exclude(pk=section_id).exists():
            return Response({'error': f'Section "{name}" already exists'}, status=status.HTTP_400_BAD_REQUEST)
        section.name = name
        section.save(update_fields=['name'])
        return Response(SectionSerializer(section).data)

    @action(detail=True, methods=['post'])
    def remove_section(self, request, pk=None):
        school_class = self.get_object()
        school = request.user.school
        section_id = request.data.get('section_id')
        if not section_id:
            return Response({'error': 'section_id required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            section = Section.objects.get(pk=section_id, school_class=school_class)
        except Section.DoesNotExist:
            return Response({'error': 'Section not found'}, status=status.HTTP_404_NOT_FOUND)
        students_in_section = Student.objects.filter(school=school, section=section).count()
        if students_in_section:
            return Response(
                {
                    'error': (
                        f'Cannot delete section "{section.name}": {students_in_section} student(s) '
                        'are assigned to it. Reassign them to another section first.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        section.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def add_subject(self, request, pk=None):
        school_class = self.get_object()
        name = request.data.get('name', '').strip()
        if not name:
            return Response({'error': 'Subject name required'}, status=status.HTTP_400_BAD_REQUEST)
        if ClassSubject.objects.filter(school_class=school_class, name=name).exists():
            return Response({'error': f'Subject "{name}" already exists in this class'}, status=status.HTTP_400_BAD_REQUEST)
        order = school_class.subjects.count()
        subject = ClassSubject.objects.create(school_class=school_class, name=name, display_order=order)
        return Response(ClassSubjectSerializer(subject).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def remove_subject(self, request, pk=None):
        school_class = self.get_object()
        subject_id = request.data.get('subject_id')
        if not subject_id:
            return Response({'error': 'subject_id required'}, status=status.HTTP_400_BAD_REQUEST)
        deleted, _ = ClassSubject.objects.filter(school_class=school_class, pk=subject_id).delete()
        if not deleted:
            return Response({'error': 'Subject not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def apply_fee(self, request, pk=None):
        """Apply a fee structure to all students in this class. Central/class-wise fee assignment."""
        from datetime import datetime
        school_class = self.get_object()
        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)
        fee_structure_id = request.data.get('fee_structure_id')
        if not fee_structure_id:
            return Response({'error': 'fee_structure_id required'}, status=400)
        try:
            fs = FeeStructure.objects.get(id=fee_structure_id, school=school, school_class=school_class)
        except FeeStructure.DoesNotExist:
            return Response({'error': 'Fee structure not found or does not belong to this class'}, status=400)
        effective_from = request.data.get('effective_from')
        eff_date = None
        if effective_from:
            try:
                eff_date = datetime.strptime(effective_from, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass
        students = Student.objects.filter(school=school, school_class=school_class, is_active=True)
        created = 0
        for student in students:
            _, was_created = StudentFeeStructureChoice.objects.update_or_create(
                student=student,
                fee_structure=fs,
                defaults={'effective_from': eff_date}
            )
            if was_created:
                created += 1
        return Response({
            'message': f'Applied {fs.fee_type.name} to {students.count()} students in {school_class.name}',
            'students_updated': students.count(),
            'newly_added': created,
        })
