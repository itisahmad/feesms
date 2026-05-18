import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("schools", "0004_fee_automated_reminder_log"),
    ]

    operations = [
        migrations.CreateModel(
            name="AdmissionEnquiry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200)),
                ("phone", models.CharField(max_length=20)),
                ("parent_name", models.CharField(blank=True, max_length=200)),
                ("email", models.EmailField(blank=True, max_length=254)),
                ("enquiry_date", models.DateField()),
                ("follow_up_date", models.DateField(blank=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("new", "New"),
                            ("contacted", "Contacted"),
                            ("visited", "Visited"),
                            ("admitted", "Admitted"),
                            ("lost", "Not interested"),
                        ],
                        default="new",
                        max_length=20,
                    ),
                ),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("walk_in", "Walk-in"),
                            ("phone", "Phone call"),
                            ("referral", "Referral"),
                            ("online", "Online"),
                            ("other", "Other"),
                        ],
                        default="walk_in",
                        max_length=20,
                    ),
                ),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_enquiries",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "school",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="admission_enquiries",
                        to="schools.school",
                    ),
                ),
                (
                    "school_class",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="admission_enquiries",
                        to="schools.schoolclass",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "Admission enquiries",
                "ordering": ["follow_up_date", "-created_at"],
            },
        ),
    ]
