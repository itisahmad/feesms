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

from ..models import (User, School, SchoolStaffRole, SchoolClass, Section, Student, FeeType, FeeStructure,
                     StudentFeeStructureChoice, StudentFee, FeePayment,
                     ExpenseCategory, Vendor, Expense, Budget)
from ..messaging import send_sms_message, send_whatsapp_message
from ..serializers import (
    UserSerializer, RegisterSerializer, SchoolSerializer, SchoolClassSerializer, SectionSerializer,
    StaffUserCreateSerializer, StaffUserUpdateSerializer, ForgotPasswordSerializer, ResetPasswordSerializer,
    SchoolStaffRoleSerializer,
    StudentSerializer, FeeTypeSerializer, FeeStructureSerializer,
    StudentFeeSerializer, StudentFeeCreateSerializer, FeePaymentSerializer,
    ExpenseCategorySerializer, VendorSerializer, ExpenseSerializer, BudgetSerializer, ExpenseReportSerializer
)
from ..default_fee_types import ensure_default_fee_types_for_school
from ..fee_periods import is_struct_billable_for_period
from ..bulk_fee_collection import pay_all_pending_operation, pay_all_year_operation
from ..mixins import SchoolNestedMixin, SchoolScopedMixin
from ..module_permissions import MODULE_DEFINITIONS, PERMISSION_KEYS, permissions_payload_for_user
from ..permissions import IsSchoolOwner
from payments.subscription_service import sync_school_subscription
from ..services.fee_collection import (
    build_collection_summary,
    build_dashboard_stats,
    build_student_fee_history,
)


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            from rest_framework_simplejwt.tokens import RefreshToken
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CurrentUserView(APIView):
    def get(self, request):
        school = request.user.school
        if school:
            sync_school_subscription(school)
            request.user.school.refresh_from_db()
        ensure_default_fee_types_for_school(school)
        data = UserSerializer(request.user).data
        data.update(permissions_payload_for_user(request.user))
        data["module_definitions"] = MODULE_DEFINITIONS
        data["permission_keys"] = list(PERMISSION_KEYS)
        return Response(data)


class StaffUserViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsSchoolOwner]

    def get_queryset(self):
        school = self.get_user_school()
        if not school:
            return User.objects.none()
        return User.objects.filter(school=school).exclude(role__in=['owner', 'parent']).select_related('staff_role').order_by('username')

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['school'] = self.get_user_school()
        return ctx

    def get_serializer_class(self):
        if self.action == 'create':
            return StaffUserCreateSerializer
        if self.action in ('update', 'partial_update'):
            return StaffUserUpdateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        from rest_framework.exceptions import ValidationError

        owner = self.request.user
        school = owner.school
        if owner.role != 'owner' or not school:
            raise ValidationError('Only school owner can create staff logins.')

        current_staff = User.objects.filter(school=school).exclude(role__in=['owner', 'parent']).count()
        if current_staff >= school.max_staff_logins:
            raise ValidationError(f'Max staff logins reached ({school.max_staff_logins}). Upgrade plan to add more.')

        serializer.save(school=school)

    def perform_update(self, serializer):
        from rest_framework.exceptions import ValidationError

        owner = self.request.user
        if owner.role != 'owner':
            raise ValidationError('Only school owner can update staff logins.')
        serializer.save()

    def perform_destroy(self, instance):
        from rest_framework.exceptions import ValidationError

        owner = self.request.user
        if owner.role != 'owner':
            raise ValidationError('Only school owner can remove staff logins.')
        if instance.role == 'owner':
            raise ValidationError('Owner account cannot be removed.')
        instance.delete()

    @action(detail=False, methods=["get"], url_path="module-definitions")
    def module_definitions(self, request):
        return Response(
            {
                "modules": MODULE_DEFINITIONS,
                "permission_keys": list(PERMISSION_KEYS),
            }
        )


class SchoolStaffRoleViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    serializer_class = SchoolStaffRoleSerializer
    permission_classes = [permissions.IsAuthenticated, IsSchoolOwner]

    def get_queryset(self):
        school = self.get_user_school()
        if not school:
            return SchoolStaffRole.objects.none()
        return SchoolStaffRole.objects.filter(school=school).order_by('name')

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['school'] = self.get_user_school()
        return ctx

    def list(self, request, *args, **kwargs):
        school = self.get_user_school()
        if school and not SchoolStaffRole.objects.filter(school=school).exists():
            from ..staff_roles import seed_default_staff_roles
            seed_default_staff_roles(school)
        return super().list(request, *args, **kwargs)

    def perform_destroy(self, instance):
        from rest_framework.exceptions import ValidationError
        if instance.users.exists():
            raise ValidationError('Remove this role from staff users before deleting.')
        instance.delete()


class StaffLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from rest_framework_simplejwt.tokens import RefreshToken

        from ..default_fee_types import ensure_default_fee_types_for_school
        from ..staff_auth import resolve_staff_for_login

        school_code = request.data.get("school_code", "")
        username = request.data.get("username", "")
        password = request.data.get("password", "")

        user, err = resolve_staff_for_login(school_code, username, password)
        if err:
            return Response({"error": err}, status=status.HTTP_401_UNAUTHORIZED)

        ensure_default_fee_types_for_school(user.school)
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "role": user.role,
            }
        )


class ForgotPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        value = serializer.validated_data['username_or_email'].strip()
        if not value:
            return Response({'error': 'username_or_email is required'}, status=400)

        user = User.objects.filter(Q(username__iexact=value) | Q(email__iexact=value)).first()
        if not user:
            return Response({'message': 'If account exists, reset instructions have been generated.'})

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_path = f'/reset-password?uid={uid}&token={token}'

        return Response({
            'message': 'Reset instructions generated.',
            'uid': uid,
            'token': token,
            'reset_path': reset_path,
        })


class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uid = serializer.validated_data['uid']
        token = serializer.validated_data['token']
        password = serializer.validated_data['password']

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = get_user_model().objects.get(pk=user_id)
        except Exception:
            return Response({'error': 'Invalid reset link.'}, status=400)

        if not default_token_generator.check_token(user, token):
            return Response({'error': 'Invalid or expired reset token.'}, status=400)

        user.set_password(password)
        user.save(update_fields=['password'])
        return Response({'message': 'Password reset successful. Please login again.'})
