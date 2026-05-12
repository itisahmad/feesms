from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("schools", "0002_school_fee_start_day"),
    ]

    operations = [
        migrations.CreateModel(
            name="ParentPaymentIntent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("currency", models.CharField(default="INR", max_length=10)),
                ("status", models.CharField(choices=[("created", "Created"), ("pending", "Pending"), ("paid", "Paid"), ("failed", "Failed"), ("cancelled", "Cancelled")], default="created", max_length=20)),
                ("provider", models.CharField(default="razorpay", max_length=30)),
                ("provider_order_id", models.CharField(blank=True, max_length=120)),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                ("notes", models.TextField(blank=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="schools.user")),
                ("school", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="parent_payment_intents", to="schools.school")),
                ("student", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="parent_payment_intents", to="schools.student")),
                ("student_fee", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="parent_payment_intents", to="schools.studentfee")),
            ],
        ),
        migrations.CreateModel(
            name="PlatformInvoice",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("billing_cycle", models.CharField(choices=[("monthly", "Monthly"), ("yearly", "Yearly")], default="monthly", max_length=20)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("currency", models.CharField(default="INR", max_length=10)),
                ("status", models.CharField(choices=[("created", "Created"), ("pending", "Pending"), ("paid", "Paid"), ("failed", "Failed"), ("cancelled", "Cancelled")], default="created", max_length=20)),
                ("period_start", models.DateField(blank=True, null=True)),
                ("period_end", models.DateField(blank=True, null=True)),
                ("due_date", models.DateField(blank=True, null=True)),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                ("notes", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("school", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="platform_invoices", to="schools.school")),
            ],
        ),
        migrations.CreateModel(
            name="SchoolPaymentConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("platform_billing_cycle", models.CharField(choices=[("monthly", "Monthly"), ("yearly", "Yearly")], default="monthly", max_length=20)),
                ("razorpay_route_account_id", models.CharField(blank=True, help_text="Razorpay Route linked account id for parent-to-school settlement.", max_length=100)),
                ("active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("school", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="payment_config", to="schools.school")),
            ],
        ),
        migrations.CreateModel(
            name="PlatformPaymentTransaction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("provider", models.CharField(default="razorpay", max_length=30)),
                ("provider_order_id", models.CharField(blank=True, max_length=120)),
                ("provider_payment_id", models.CharField(blank=True, max_length=120)),
                ("provider_signature", models.CharField(blank=True, max_length=255)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("currency", models.CharField(default="INR", max_length=10)),
                ("status", models.CharField(choices=[("created", "Created"), ("authorized", "Authorized"), ("captured", "Captured"), ("failed", "Failed")], default="created", max_length=20)),
                ("raw_payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("invoice", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="transactions", to="payments.platforminvoice")),
            ],
        ),
        migrations.CreateModel(
            name="ParentPaymentTransaction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("provider", models.CharField(default="razorpay", max_length=30)),
                ("provider_payment_id", models.CharField(blank=True, max_length=120)),
                ("provider_signature", models.CharField(blank=True, max_length=255)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("currency", models.CharField(default="INR", max_length=10)),
                ("status", models.CharField(choices=[("created", "Created"), ("authorized", "Authorized"), ("captured", "Captured"), ("failed", "Failed")], default="created", max_length=20)),
                ("raw_payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("intent", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="transactions", to="payments.parentpaymentintent")),
            ],
        ),
    ]
