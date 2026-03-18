"""
School Fee Management Models for Bihar Market
"""
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from decimal import Decimal


class User(AbstractUser):
    """Extended user for school owners and staff"""
    ROLE_CHOICES = [
        ('owner', 'Owner'),
        ('accountant', 'Accountant'),
        ('staff', 'Staff'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='owner')
    phone = models.CharField(max_length=20, blank=True)
    school = models.ForeignKey('School', on_delete=models.CASCADE, null=True, blank=True, related_name='staff')


class School(models.Model):
    """School/Institution"""
    PLAN_CHOICES = [
        ('basic', 'Basic - ₹299/month'),
        ('standard', 'Standard - ₹599/month'),
        ('premium', 'Premium - ₹999/month'),
    ]
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, default='Muzaffarpur')
    state = models.CharField(max_length=50, default='Bihar')
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    logo = models.ImageField(upload_to='school_logos/', blank=True, null=True)
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default='standard')
    max_students = models.IntegerField(default=300)  # 100 for basic, 300 for standard, unlimited for premium
    max_staff_logins = models.IntegerField(default=2)  # 1 for basic, 2 for standard, 5 for premium
    academic_year_start_month = models.IntegerField(default=4)  # 1=Jan, 3=Mar, 4=Apr, etc. When academic year begins
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class SchoolClass(models.Model):
    """Classes/Grades that school offers - owner onboards these first"""
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='classes')
    name = models.CharField(max_length=50)  # e.g., "Nursery", "LKG", "Class 1", "Class 2"
    display_order = models.IntegerField(default=0)  # For ordering in dropdown
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['display_order', 'name']
        unique_together = ['school', 'name']

    def __str__(self):
        return f"{self.school.name} - {self.name}"


class Section(models.Model):
    """Sections within a class - e.g., A, B, C for Class 1"""
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='sections')
    name = models.CharField(max_length=20)  # A, B, C
    display_order = models.IntegerField(default=0)

    class Meta:
        ordering = ['display_order', 'name']
        unique_together = ['school_class', 'name']

    def __str__(self):
        return f"{self.school_class.name} - {self.name}"


class Student(models.Model):
    """Student enrolled in school"""
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='students')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.PROTECT, related_name='students', null=True, blank=True)
    section = models.ForeignKey('Section', on_delete=models.PROTECT, related_name='students', null=True, blank=True)
    name = models.CharField(max_length=200)
    class_name = models.CharField(max_length=50, blank=True)  # Deprecated - use school_class; kept for migration
    section_legacy = models.CharField(max_length=10, blank=True)  # Deprecated - use section FK
    parent_name = models.CharField(max_length=200)
    parent_phone = models.CharField(max_length=20)
    parent_email = models.EmailField(blank=True)
    admission_number = models.CharField(max_length=50, blank=True)
    roll_number = models.CharField(max_length=50, blank=True)
    admission_date = models.DateField(null=True, blank=True)  # When student joined school
    charges_effective_from = models.DateField(null=True, blank=True, help_text='Date from which monthly fees apply. Can be future. If not set, admission_date is used.')
    uses_transport = models.BooleanField(default=True)  # Deprecated - use fee_structure_choices
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['school_class', 'section', 'name']

    def __str__(self):
        return f"{self.name} - {self.get_class_display()}"

    def get_class_display(self):
        if self.school_class:
            sec = self.section.name if self.section else (self.section_legacy or '')
            return f"{self.school_class.name}{'-' + sec if sec else ''}"
        return self.class_name or '-'


class FeeType(models.Model):
    """Types of fees: tuition, transport, books, exam, etc."""
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='fee_types', null=True, blank=True)
    name = models.CharField(max_length=100)  # Tuition, Transport, Books, Exam, etc.
    is_system = models.BooleanField(default=False)  # System-defined vs custom
    description = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return self.name


class FeeStructure(models.Model):
    """Fee amount per class - different classes can have different fees"""
    BILLING_PERIOD_CHOICES = [
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('half_yearly', 'Half-Yearly'),
        ('yearly', 'Yearly'),
        ('one_time', 'One-Time Payment'),
    ]
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='fee_structures')
    fee_type = models.ForeignKey(FeeType, on_delete=models.CASCADE, related_name='structures')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.PROTECT, related_name='fee_structures', null=True, blank=True)
    class_name = models.CharField(max_length=50, blank=True)  # Deprecated - use school_class; kept for migration
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    billing_period = models.CharField(max_length=20, choices=BILLING_PERIOD_CHOICES, default='monthly')
    due_day = models.IntegerField(default=5)  # Day of month when fee is due (1-28)
    late_fine_per_day = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    academic_year = models.CharField(max_length=20, default='2024-25')
    allow_yearly_payment = models.BooleanField(default=True, help_text='Parents can pay whole year at once')
    yearly_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)], help_text='Discount % when paying full year upfront')
    created_at = models.DateTimeField(auto_now_add=True)

    def should_bill_for_month(self, month: int) -> bool:
        """Whether this fee should be billed for the given month (1-12)."""
        if self.billing_period == 'monthly':
            return True
        if self.billing_period == 'quarterly':
            return month in (1, 4, 7, 10)
        if self.billing_period == 'half_yearly':
            return month in (1, 7)
        if self.billing_period == 'yearly':
            return month == 1
        if self.billing_period == 'one_time':
            start = getattr(self.school, 'academic_year_start_month', 4) or 4
            return month == start  # First month of academic year
        return True

    class Meta:
        unique_together = ['school', 'fee_type', 'school_class', 'academic_year']
        ordering = ['school_class', 'fee_type']

    def __str__(self):
        return f"{self.get_class_display()} - {self.fee_type.name}: ₹{self.amount}"

    def get_class_display(self):
        return self.school_class.name if self.school_class else self.class_name or '-'


class StudentFeeStructureChoice(models.Model):
    """Which fee structures apply to this student - ticked = charged. effective_from for mid-session (e.g. transport started later)"""
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='fee_structure_choices')
    fee_structure = models.ForeignKey(FeeStructure, on_delete=models.CASCADE, related_name='student_choices')
    effective_from = models.DateField(null=True, blank=True)  # Fee applies from this date; null = from admission
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['student', 'fee_structure']


class StudentFee(models.Model):
    """Fee assigned to student for a specific month/period"""
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='fees')
    fee_structure = models.ForeignKey(FeeStructure, on_delete=models.CASCADE, related_name='student_fees')
    month = models.IntegerField()  # 1-12
    year = models.IntegerField()
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    late_fine = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['student', 'fee_structure', 'month', 'year']
        ordering = ['-year', '-month']

    def __str__(self):
        return f"{self.student.name} - {self.fee_structure.fee_type.name} ({self.month}/{self.year})"


class FeePayment(models.Model):
    """Payment record for student fees"""
    student_fee = models.ForeignKey(StudentFee, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(0)], help_text='Discount given on this payment (amount credited = amount, cash received = amount - discount)')
    payment_date = models.DateField()
    payment_mode = models.CharField(max_length=50, default='Cash')  # Cash, UPI, Bank Transfer, etc.
    transaction_id = models.CharField(max_length=100, blank=True)
    receipt_number = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-payment_date', '-created_at']

    def __str__(self):
        return f"₹{self.amount} - {self.student_fee.student.name}"


class Subscription(models.Model):
    """School subscription plan"""
    STATUS_CHOICES = [
        ('trial', 'Trial'),
        ('active', 'Active'),
        ('past_due', 'Past Due'),
        ('cancelled', 'Cancelled'),
    ]
    school = models.OneToOneField(School, on_delete=models.CASCADE, related_name='subscription')
    plan = models.CharField(max_length=20, choices=School.PLAN_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='trial')
    razorpay_subscription_id = models.CharField(max_length=100, blank=True)
    razorpay_customer_id = models.CharField(max_length=100, blank=True)
    current_period_start = models.DateField(null=True, blank=True)
    current_period_end = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# Expense Management System Models

class ExpenseCategory(models.Model):
    """Customizable expense categories for schools"""
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='expense_categories')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=7, default='#6366f1')  # Hex color for UI
    icon = models.CharField(max_length=50, blank=True)  # Icon name for UI
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['school', 'name']
        verbose_name_plural = "Expense Categories"

    def __str__(self):
        return f"{self.school.name} - {self.name}"


class Vendor(models.Model):
    """Vendors/suppliers for school purchases"""
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='vendors')
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    gst_number = models.CharField(max_length=50, blank=True)
    pan_number = models.CharField(max_length=20, blank=True)
    payment_terms = models.CharField(max_length=200, blank=True)  # e.g., "Net 30 days"
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Vendor"

    def __str__(self):
        return f"{self.school.name} - {self.name}"


class Expense(models.Model):
    """Individual expense records"""
    PAYMENT_MODE_CHOICES = [
        ('cash', 'Cash'),
        ('bank_transfer', 'Bank Transfer'),
        ('cheque', 'Cheque'),
        ('card', 'Card'),
        ('upi', 'UPI'),
        ('other', 'Other'),
    ]
    
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='expenses')
    category = models.ForeignKey(ExpenseCategory, on_delete=models.SET_NULL, null=True, related_name='expenses')
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.00'))])
    date = models.DateField()
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODE_CHOICES, default='cash')
    reference_number = models.CharField(max_length=100, blank=True)  # Cheque number, transaction ID, etc.
    receipt = models.ImageField(upload_to='expense_receipts/', blank=True, null=True)
    tags = models.CharField(max_length=500, blank=True)  # Comma-separated tags for filtering
    is_recurring = models.BooleanField(default=False)
    recurring_interval = models.CharField(max_length=20, blank=True)  # monthly, quarterly, yearly
    recurring_end_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_expenses')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.school.name} - {self.title} ({self.amount})"


class Budget(models.Model):
    """Budget planning for expense categories"""
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='budgets')
    category = models.ForeignKey(ExpenseCategory, on_delete=models.CASCADE, related_name='budgets')
    academic_year = models.CharField(max_length=20)  # e.g., "2025-26"
    planned_amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.00'))])
    alert_threshold_percentage = models.IntegerField(default=80)  # Alert when spent % exceeds this
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['school', 'category', 'academic_year']

    def __str__(self):
        return f"{self.school.name} - {self.category.name} ({self.academic_year})"

    @property
    def spent_amount(self):
        """Calculate actual spending for this budget"""
        year_parts = self.academic_year.split('-')
        start_year = year_parts[0]
        end_year = year_parts[1]
        # Handle 2-digit end year by converting to 4-digit
        if len(end_year) == 2:
            end_year = f"20{end_year}"
        return Expense.objects.filter(
            school=self.school,
            category=self.category,
            date__gte=f"{start_year}-04-01",  # Academic year start
            date__lte=f"{end_year}-03-31"   # Academic year end
        ).aggregate(total=models.Sum('amount'))['total'] or Decimal('0.00')

    @property
    def remaining_amount(self):
        return self.planned_amount - self.spent_amount

    @property
    def utilization_percentage(self):
        if self.planned_amount == 0:
            return 0
        return float((self.spent_amount / self.planned_amount) * 100)
