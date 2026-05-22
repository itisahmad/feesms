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

from ..models import (User, School, SchoolClass, Section, Student, FeeType, FeeStructure, 
                     StudentFeeStructureChoice, StudentFee, FeePayment,
                     ExpenseCategory, Vendor, Expense, Budget)
from ..messaging import send_sms_message, send_whatsapp_message
from ..serializers import (
    UserSerializer, RegisterSerializer, SchoolSerializer, SchoolClassSerializer, SectionSerializer,
    StaffUserCreateSerializer, StaffUserUpdateSerializer, ForgotPasswordSerializer, ResetPasswordSerializer,
    StudentSerializer, FeeTypeSerializer, FeeStructureSerializer, FeeStructureBulkCreateSerializer,
    StudentFeeSerializer, StudentFeeCreateSerializer, FeePaymentSerializer,
    ExpenseCategorySerializer, VendorSerializer, ExpenseSerializer, BudgetSerializer, ExpenseReportSerializer
)
from ..default_fee_types import ensure_default_fee_types_for_school
from ..fee_periods import is_struct_billable_for_period
from ..bulk_fee_collection import pay_all_pending_operation, pay_all_year_operation
from ..mixins import SchoolNestedMixin, SchoolScopedMixin
from ..permissions import HasModulePermission, IsSchoolOwner
from ..services.fee_collection import (
    build_collection_summary,
    build_dashboard_stats,
    build_student_fee_history,
)


class StudentViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    module_key = "students"

    def get_queryset(self):
        school = self.get_user_school()
        if not school:
            return Student.objects.none()
        qs = Student.objects.filter(school=school, is_active=True).select_related('school_class', 'section')
        class_id = self.request.query_params.get('class')
        section_id = self.request.query_params.get('section')
        if class_id:
            qs = qs.filter(school_class_id=class_id)
        if section_id:
            qs = qs.filter(section_id=section_id)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(parent_name__icontains=search) |
                Q(parent_phone__icontains=search)
            )
        return qs.order_by('school_class', 'name')

    @action(detail=True, methods=['get'])
    def fee_history(self, request, pk=None):
        student = self.get_object()
        return Response(build_student_fee_history(student))


class FeeTypeViewSet(viewsets.ModelViewSet):
    serializer_class = FeeTypeSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    module_key = "fee_structure"

    def get_queryset(self):
        school = self.request.user.school
        if not school:
            return FeeType.objects.none()
        school_types = FeeType.objects.filter(school=school).order_by('name')
        school_names = school_types.values_list('name', flat=True)
        system_types = (
            FeeType.objects.filter(school__isnull=True, is_system=True)
            .exclude(name__in=school_names)
            .order_by('name')
        )
        return (school_types | system_types).order_by('name')

    def perform_create(self, serializer):
        from rest_framework.exceptions import ValidationError

        school = self.request.user.school
        if not school:
            raise ValidationError('No school assigned to this user.')
        serializer.save(school=school, is_system=False)

    def perform_update(self, serializer):
        from rest_framework.exceptions import ValidationError

        obj = self.get_object()
        school = self.request.user.school
        if obj.is_system and obj.school_id is None:
            raise ValidationError('System fee types cannot be edited.')
        if not school or obj.school_id != school.id:
            raise ValidationError('You can only edit your school fee types.')
        serializer.save(school=school, is_system=False)

    def perform_destroy(self, instance):
        from rest_framework.exceptions import ValidationError

        school = self.request.user.school
        if instance.is_system and instance.school_id is None:
            raise ValidationError('System fee types cannot be deleted.')
        if not school or instance.school_id != school.id:
            raise ValidationError('You can only delete your school fee types.')
        if FeeStructure.objects.filter(fee_type=instance).exists():
            raise ValidationError('Cannot delete fee type linked to fee structures.')
        instance.delete()


class FeeStructureViewSet(viewsets.ModelViewSet):
    serializer_class = FeeStructureSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    module_key = "fee_structure"

    def create(self, request, *args, **kwargs):
        if 'school_class_ids' in request.data:
            serializer = FeeStructureBulkCreateSerializer(
                data=request.data,
                context={'request': request},
            )
            serializer.is_valid(raise_exception=True)
            result = serializer.save()
            created = result['created']
            skipped = result['skipped']
            return Response(
                {
                    'created': FeeStructureSerializer(
                        created, many=True, context={'request': request}
                    ).data,
                    'created_count': len(created),
                    'skipped': skipped,
                    'message': (
                        f'Added fee to {len(created)} class(es).'
                        + (f' Skipped {len(skipped)} (already exists).' if skipped else '')
                    ),
                },
                status=status.HTTP_201_CREATED,
            )
        return super().create(request, *args, **kwargs)

    def get_queryset(self):
        school = self.request.user.school
        if not school:
            return FeeStructure.objects.none()
        qs = FeeStructure.objects.filter(school=school).select_related('fee_type', 'school_class')
        class_id = self.request.query_params.get('school_class')
        if class_id:
            qs = qs.filter(school_class_id=class_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)

    def perform_update(self, serializer):
        obj = self.get_object()
        if StudentFeeStructureChoice.objects.filter(fee_structure=obj).exists() or StudentFee.objects.filter(fee_structure=obj).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Cannot edit fee structure that is already linked to students or fee records.')
        serializer.save()

    def perform_destroy(self, instance):
        if StudentFeeStructureChoice.objects.filter(fee_structure=instance).exists() or StudentFee.objects.filter(fee_structure=instance).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Cannot delete fee structure that is already linked to students or fee records.')
        instance.delete()
