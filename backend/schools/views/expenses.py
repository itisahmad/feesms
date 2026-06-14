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
from ..permissions import IsSchoolOwner, IsSchoolStaff
from ..services.fee_collection import (
    build_collection_summary,
    build_dashboard_stats,
    build_student_fee_history,
)


class ExpenseCategoryViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    serializer_class = ExpenseCategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsSchoolStaff]

    def get_queryset(self):
        return super().get_queryset().order_by('name')


class VendorViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    serializer_class = VendorSerializer
    permission_classes = [permissions.IsAuthenticated, IsSchoolStaff]

    def get_queryset(self):
        return super().get_queryset().order_by('name')


class ExpenseViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [permissions.IsAuthenticated, IsSchoolStaff]

    def get_queryset(self):
        return super().get_queryset().select_related('category', 'vendor', 'created_by').order_by('-date', '-created_at')

    def perform_create(self, serializer):
        serializer.save(school=self.get_user_school(), created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def reports(self, request):
        """Generate comprehensive expense and profit reports"""
        from django.db.models import Sum, Count, Q
        from datetime import date
        import calendar

        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)

        # Get date range from query params
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        if not start_date or not end_date:
            # Default to current academic year
            today = date.today()
            if today.month >= school.academic_year_start_month:
                start_year = today.year
            else:
                start_year = today.year - 1
            start_date = date(start_year, school.academic_year_start_month, 1)
            end_year = start_year + 1
            end_date = date(end_year, school.academic_year_start_month - 1, calendar.monthrange(end_year, school.academic_year_start_month - 1)[1])
        else:
            try:
                start_date = date.fromisoformat(start_date)
                end_date = date.fromisoformat(end_date)
            except ValueError:
                return Response({'error': 'Invalid date format'}, status=400)

        # Calculate total income from fee payments
        total_income = FeePayment.objects.filter(
            student_fee__student__school=school,
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).aggregate(total=Sum('amount'))['total'] or 0

        # Calculate total expenses
        total_expenses = Expense.objects.filter(
            school=school,
            date__gte=start_date,
            date__lte=end_date
        ).aggregate(total=Sum('amount'))['total'] or 0

        # Expense by category
        expense_by_category = Expense.objects.filter(
            school=school,
            date__gte=start_date,
            date__lte=end_date
        ).values('category__name').annotate(
            total=Sum('amount'),
            count=Count('id')
        ).order_by('-total')

        # Monthly trends
        monthly_trends = []
        current = start_date
        while current <= end_date:
            month_income = FeePayment.objects.filter(
                student_fee__student__school=school,
                created_at__year=current.year,
                created_at__month=current.month
            ).aggregate(total=Sum('amount'))['total'] or 0
            
            month_expenses = Expense.objects.filter(
                school=school,
                date__year=current.year,
                date__month=current.month
            ).aggregate(total=Sum('amount'))['total'] or 0
            
            monthly_trends.append({
                'month': current.strftime('%b %Y'),
                'income': float(month_income),
                'expenses': float(month_expenses),
                'profit': float(month_income - month_expenses)
            })
            
            # Move to next month
            if current.month == 12:
                current = date(current.year + 1, 1, 1)
            else:
                current = date(current.year, current.month + 1, 1)

        # Top vendors
        top_vendors = Expense.objects.filter(
            school=school,
            date__gte=start_date,
            date__lte=end_date,
            vendor__isnull=False
        ).values('vendor__name').annotate(
            total=Sum('amount'),
            count=Count('id')
        ).order_by('-total')[:10]

        # Budget comparison
        budget_comparison = []
        budgets = Budget.objects.filter(
            school=school,
            academic_year=f"{start_date.year}-{(start_date.year + 1) % 100:02d}"
        ).select_related('category')
        
        for budget in budgets:
            budget_comparison.append({
                'category': budget.category.name,
                'budgeted': float(budget.planned_amount),
                'spent': float(budget.spent_amount),
                'remaining': float(budget.remaining_amount),
                'utilization': budget.utilization_percentage
            })

        data = {
            'total_income': float(total_income),
            'total_expenses': float(total_expenses),
            'net_profit': float(total_income - total_expenses),
            'expense_by_category': list(expense_by_category),
            'monthly_trends': monthly_trends,
            'top_vendors': list(top_vendors),
            'budget_comparison': budget_comparison,
            'period': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        }

        serializer = ExpenseReportSerializer(data)
        return Response(serializer.data)


class BudgetViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    serializer_class = BudgetSerializer
    permission_classes = [permissions.IsAuthenticated, IsSchoolStaff]

    def get_queryset(self):
        return super().get_queryset().select_related('category', 'school').order_by('-academic_year', 'category__name')
