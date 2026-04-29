from django.db import models


class SchoolPaymentConfig(models.Model):
    school = models.OneToOneField("schools.School", on_delete=models.CASCADE, related_name="payment_config")
    platform_billing_cycle = models.CharField(
        max_length=20,
        choices=[("monthly", "Monthly"), ("yearly", "Yearly")],
        default="monthly",
    )
    razorpay_route_account_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="Razorpay Route linked account id for parent-to-school settlement.",
    )
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.school.name} payment config"


class PlatformInvoice(models.Model):
    STATUS_CHOICES = [
        ("created", "Created"),
        ("pending", "Pending"),
        ("paid", "Paid"),
        ("failed", "Failed"),
        ("cancelled", "Cancelled"),
    ]

    school = models.ForeignKey("schools.School", on_delete=models.CASCADE, related_name="platform_invoices")
    billing_cycle = models.CharField(max_length=20, choices=[("monthly", "Monthly"), ("yearly", "Yearly")], default="monthly")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, default="INR")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="created")
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    notes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.school.name} {self.billing_cycle} invoice {self.amount}"


class PlatformPaymentTransaction(models.Model):
    STATUS_CHOICES = [
        ("created", "Created"),
        ("authorized", "Authorized"),
        ("captured", "Captured"),
        ("failed", "Failed"),
    ]

    invoice = models.ForeignKey(PlatformInvoice, on_delete=models.CASCADE, related_name="transactions")
    provider = models.CharField(max_length=30, default="razorpay")
    provider_order_id = models.CharField(max_length=120, blank=True)
    provider_payment_id = models.CharField(max_length=120, blank=True)
    provider_signature = models.CharField(max_length=255, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, default="INR")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="created")
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Platform tx {self.provider_order_id or self.id}"


class ParentPaymentIntent(models.Model):
    STATUS_CHOICES = [
        ("created", "Created"),
        ("pending", "Pending"),
        ("paid", "Paid"),
        ("failed", "Failed"),
        ("cancelled", "Cancelled"),
    ]

    school = models.ForeignKey("schools.School", on_delete=models.CASCADE, related_name="parent_payment_intents")
    student = models.ForeignKey("schools.Student", on_delete=models.SET_NULL, null=True, blank=True, related_name="parent_payment_intents")
    student_fee = models.ForeignKey("schools.StudentFee", on_delete=models.SET_NULL, null=True, blank=True, related_name="parent_payment_intents")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, default="INR")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="created")
    provider = models.CharField(max_length=30, default="razorpay")
    provider_order_id = models.CharField(max_length=120, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey("schools.User", on_delete=models.SET_NULL, null=True, blank=True)
    notes = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Parent payment intent {self.id} - {self.school.name}"


class ParentPaymentTransaction(models.Model):
    STATUS_CHOICES = [
        ("created", "Created"),
        ("authorized", "Authorized"),
        ("captured", "Captured"),
        ("failed", "Failed"),
    ]

    intent = models.ForeignKey(ParentPaymentIntent, on_delete=models.CASCADE, related_name="transactions")
    provider = models.CharField(max_length=30, default="razorpay")
    provider_payment_id = models.CharField(max_length=120, blank=True)
    provider_signature = models.CharField(max_length=255, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, default="INR")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="created")
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Parent tx {self.provider_payment_id or self.id}"
