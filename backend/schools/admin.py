from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, School, SchoolClass, Section, Student, FeeType, FeeStructure, StudentFeeStructureChoice, StudentFee, FeePayment, Subscription


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'role', 'school', 'is_staff']
    list_filter = ['role', 'is_staff']
    search_fields = ['username', 'email']


@admin.register(SchoolClass)
class SchoolClassAdmin(admin.ModelAdmin):
    list_display = ['name', 'school', 'display_order']
    list_filter = ['school']


@admin.register(StudentFeeStructureChoice)
class StudentFeeStructureChoiceAdmin(admin.ModelAdmin):
    list_display = ['student', 'fee_structure', 'effective_from']


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ['name', 'school_class', 'display_order']
    list_filter = ['school_class']


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ['name', 'city', 'plan', 'max_students', 'created_at']
    list_filter = ['plan', 'city']
    search_fields = ['name', 'city']


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ['name', 'school', 'school_class', 'section', 'parent_phone', 'is_active']
    list_filter = ['school', 'school_class', 'section', 'is_active']
    search_fields = ['name', 'parent_name', 'parent_phone']


@admin.register(FeeType)
class FeeTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'is_system', 'school']
    list_filter = ['category', 'is_system']


@admin.register(FeeStructure)
class FeeStructureAdmin(admin.ModelAdmin):
    list_display = ['school', 'fee_type', 'school_class', 'amount', 'billing_period', 'academic_year']
    list_filter = ['school', 'billing_period', 'academic_year']


@admin.register(StudentFee)
class StudentFeeAdmin(admin.ModelAdmin):
    list_display = ['student', 'fee_structure', 'month', 'year', 'total_amount', 'get_paid_amount']
    list_filter = ['year', 'month']
    
    search_fields = [
        'student__name',
        'fee_structure__fee_type__name',
    ]

    def get_paid_amount(self, obj):
        total = sum(p.amount for p in obj.payments.all())
        return total
    get_paid_amount.short_description = 'Paid'


@admin.register(FeePayment)
class FeePaymentAdmin(admin.ModelAdmin):
    list_display = ['student_fee', 'amount', 'payment_date', 'payment_mode', 'receipt_number']


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ['school', 'plan', 'status', 'current_period_start', 'current_period_end']
