"""
School Fee Management Models for Bihar Market
"""
from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.db.models import Sum
from .querysets import SchoolScopedQuerySet, StudentFeeQuerySet


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
    module_permissions = models.JSONField(
        default=dict,
        blank=True,
        help_text="Per-module access for staff: view, create, edit, delete, actions.",
    )


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
    fee_start_day = models.IntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(28)],
        help_text='Charges from current month apply only when student joins on/before this day.',
    )
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    PLAN_LIMITS = {
        "basic": {"max_students": 100, "max_staff_logins": 1},
        "standard": {"max_students": 300, "max_staff_logins": 2},
        "premium": {"max_students": 1_000_000, "max_staff_logins": 5},
    }

    objects = SchoolScopedQuerySet.as_manager()

    def __str__(self):
        return self.name

    def apply_plan(self, plan: str) -> None:
        limits = self.PLAN_LIMITS[plan]
        self.plan = plan
        self.max_students = limits["max_students"]
        self.max_staff_logins = limits["max_staff_logins"]
        self.save(update_fields=["plan", "max_students", "max_staff_logins"])

    @property
    def academic_year_start(self) -> int:
        return self.academic_year_start_month or 4

    def academic_year_label(self, month: int, year: int) -> str:
        start_year = year if month >= self.academic_year_start else year - 1
        return f"{start_year}-{str(start_year + 1)[-2:]}"

    def month_period_end(self, month: int, year: int) -> date:
        _, last_day = calendar.monthrange(year, month)
        return date(year, month, last_day)


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


class ClassSubject(models.Model):
    """Subjects taught in a class — optional, can be added anytime after class is created."""
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='subjects')
    name = models.CharField(max_length=100)  # e.g. Mathematics, English
    display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['display_order', 'name']
        unique_together = ['school_class', 'name']

    def __str__(self):
        return f"{self.school_class.name} — {self.name}"


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

    def charges_start_date(self) -> date | None:
        return self.charges_effective_from or self.admission_date

    def applies_to_month(self, month: int, year: int) -> bool:
        start = self.charges_start_date()
        if not start:
            return True
        try:
            return self.school.month_period_end(month, year) >= start
        except (ValueError, TypeError):
            return True


class FeeType(models.Model):
    """Types of fees: tuition, transport, books, exam, etc."""
    BILLING_PERIOD_CHOICES = [
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('half_yearly', 'Half-Yearly'),
        ('yearly', 'Yearly'),
        ('one_time', 'One-Time Payment'),
    ]
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='fee_types', null=True, blank=True)
    name = models.CharField(max_length=100)  # Tuition, Transport, Books, Exam, etc.
    is_system = models.BooleanField(default=False)  # System-defined vs custom
    description = models.CharField(max_length=255, blank=True)
    billing_period = models.CharField(max_length=20, choices=BILLING_PERIOD_CHOICES, default='monthly')

    def __str__(self):
        return f"{self.name} ({self.get_billing_period_display()})"


class FeeStructure(models.Model):
    """Fee amount per class - different classes can have different fees"""
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='fee_structures')
    fee_type = models.ForeignKey(FeeType, on_delete=models.CASCADE, related_name='structures')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.PROTECT, related_name='fee_structures', null=True, blank=True)
    class_name = models.CharField(max_length=50, blank=True)  # Deprecated - use school_class; kept for migration
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    due_day = models.IntegerField(default=5)  # Day of month when fee is due (1-28)
    late_fine_per_day = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    academic_year = models.CharField(max_length=20, default='2024-25')
    allow_yearly_payment = models.BooleanField(default=True, help_text='Parents can pay whole year at once')
    yearly_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)], help_text='Discount % when paying full year upfront')
    created_at = models.DateTimeField(auto_now_add=True)

    def should_bill_for_month(self, month: int) -> bool:
        """Whether this fee should be billed for the given month (1-12)."""
        billing_period = self.fee_type.billing_period
        if billing_period == 'monthly':
            return True
        if billing_period == 'quarterly':
            return month in (1, 4, 7, 10)
        if billing_period == 'half_yearly':
            return month in (1, 7)
        if billing_period == 'yearly':
            return month == 1
        if billing_period == 'one_time':
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

    def is_billable_for_period(self, month: int, year: int, student, choice=None) -> bool:
        start_date = None
        if choice and choice.effective_from:
            start_date = choice.effective_from
        if not start_date:
            start_date = getattr(student, "charges_effective_from", None) or student.admission_date
        if not start_date:
            return self.should_bill_for_month(month)
        month_diff = (year - start_date.year) * 12 + (month - start_date.month)
        if month_diff < 0:
            return False
        billing_period = self.fee_type.billing_period
        if billing_period == "monthly":
            return True
        if billing_period == "quarterly":
            return month_diff % 3 == 0
        if billing_period == "half_yearly":
            return month_diff % 6 == 0
        if billing_period == "yearly":
            return month_diff % 12 == 0
        if billing_period == "one_time":
            return month_diff == 0
        return True

    def due_date_for(self, month: int, year: int) -> date:
        return date(year, month, min(self.due_day, 28))


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

    objects = StudentFeeQuerySet.as_manager()

    class Meta:
        unique_together = ['student', 'fee_structure', 'month', 'year']
        ordering = ['-year', '-month']

    def __str__(self):
        return f"{self.student.name} - {self.fee_structure.fee_type.name} ({self.month}/{self.year})"

    def paid_amount(self) -> Decimal:
        if hasattr(self, "paid_total"):
            return Decimal(str(self.paid_total))
        total = self.payments.aggregate(total=Sum("amount"))["total"]
        return total or Decimal("0")

    @property
    def balance(self) -> Decimal:
        return self.total_amount - self.paid_amount()

    @property
    def is_fully_paid(self) -> bool:
        return self.balance <= 0

    @classmethod
    def ensure_for_period(cls, student, fee_structure, month: int, year: int) -> tuple["StudentFee", bool]:
        return cls.objects.get_or_create(
            student=student,
            fee_structure=fee_structure,
            month=month,
            year=year,
            defaults={
                "amount": fee_structure.amount,
                "late_fine": 0,
                "total_amount": fee_structure.amount,
                "due_date": fee_structure.due_date_for(month, year),
            },
        )


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

    def assign_receipt_number(self) -> None:
        if self.receipt_number:
            return
        school_id = self.student_fee.student.school_id
        self.receipt_number = f"RCP-{school_id}-{self.id:06d}"
        self.save(update_fields=["receipt_number"])


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


class SchoolMessagingSettings(models.Model):
    school = models.OneToOneField(School, on_delete=models.CASCADE, related_name="messaging_settings")
    sms_enabled = models.BooleanField(default=False)
    whatsapp_enabled = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Messaging settings — {self.school.name}"


class MessageLog(models.Model):
    CHANNEL_SMS = "sms"
    CHANNEL_WHATSAPP = "whatsapp"
    CHANNEL_CHOICES = [(CHANNEL_SMS, "SMS"), (CHANNEL_WHATSAPP, "WhatsApp")]

    TYPE_PAYMENT = "payment"
    TYPE_RESULT = "result"
    TYPE_REMINDER = "reminder"
    TYPE_CUSTOM = "custom"
    TYPE_CHOICES = [
        (TYPE_PAYMENT, "Payment"),
        (TYPE_RESULT, "Result"),
        (TYPE_REMINDER, "Reminder"),
        (TYPE_CUSTOM, "Custom"),
    ]

    STATUS_PENDING = "pending"
    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_SENT, "Sent"),
        (STATUS_FAILED, "Failed"),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="message_logs")
    student = models.ForeignKey(Student, on_delete=models.SET_NULL, null=True, blank=True, related_name="message_logs")
    phone_number = models.CharField(max_length=32)
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    message_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    content = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    provider_response = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]


class MessageUsage(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="message_usage_batches")
    channel = models.CharField(max_length=20, choices=MessageLog.CHANNEL_CHOICES)
    message_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class AdmissionEnquiry(models.Model):
    """Prospective admission enquiries for follow-up."""

    STATUS_NEW = "new"
    STATUS_CONTACTED = "contacted"
    STATUS_VISITED = "visited"
    STATUS_ADMITTED = "admitted"
    STATUS_LOST = "lost"

    STATUS_CHOICES = [
        (STATUS_NEW, "New"),
        (STATUS_CONTACTED, "Contacted"),
        (STATUS_VISITED, "Visited"),
        (STATUS_ADMITTED, "Admitted"),
        (STATUS_LOST, "Not interested"),
    ]

    SOURCE_WALK_IN = "walk_in"
    SOURCE_PHONE = "phone"
    SOURCE_REFERRAL = "referral"
    SOURCE_ONLINE = "online"
    SOURCE_OTHER = "other"

    SOURCE_CHOICES = [
        (SOURCE_WALK_IN, "Walk-in"),
        (SOURCE_PHONE, "Phone call"),
        (SOURCE_REFERRAL, "Referral"),
        (SOURCE_ONLINE, "Online"),
        (SOURCE_OTHER, "Other"),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="admission_enquiries")
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20)
    parent_name = models.CharField(max_length=200, blank=True)
    email = models.EmailField(blank=True)
    school_class = models.ForeignKey(
        SchoolClass,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admission_enquiries",
    )
    enquiry_date = models.DateField()
    follow_up_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_NEW)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_WALK_IN)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_enquiries",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["follow_up_date", "-created_at"]
        verbose_name_plural = "Admission enquiries"

    def __str__(self):
        return f"{self.name} ({self.phone})"


class FeeAutomatedReminderLog(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="fee_automated_reminder_logs")
    run_date = models.DateField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-run_date", "school_id"]
        constraints = [
            models.UniqueConstraint(fields=["school", "run_date"], name="uniq_fee_auto_reminder_school_date"),
        ]
