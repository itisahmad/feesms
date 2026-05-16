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
    StudentSerializer, FeeTypeSerializer, FeeStructureSerializer,
    StudentFeeSerializer, StudentFeeCreateSerializer, FeePaymentSerializer,
    ExpenseCategorySerializer, VendorSerializer, ExpenseSerializer, BudgetSerializer, ExpenseReportSerializer
)
from ..default_fee_types import ensure_default_fee_types_for_school
from ..fee_periods import is_struct_billable_for_period
from ..bulk_fee_collection import pay_all_pending_operation, pay_all_year_operation
from ..mixins import SchoolNestedMixin, SchoolScopedMixin
from ..permissions import IsSchoolOwner
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
        ensure_default_fee_types_for_school(request.user.school)
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class StaffUserViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsSchoolOwner]

    def get_queryset(self):
        school = self.get_user_school()
        if not school:
            return User.objects.none()
        return User.objects.filter(school=school).exclude(role='owner').order_by('username')

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

        current_staff = User.objects.filter(school=school).exclude(role='owner').count()
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
