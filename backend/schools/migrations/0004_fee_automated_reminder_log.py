import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("schools", "0003_messaging_models"),
    ]

    operations = [
        migrations.CreateModel(
            name="FeeAutomatedReminderLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("run_date", models.DateField(db_index=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "school",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="fee_automated_reminder_logs",
                        to="schools.school",
                    ),
                ),
            ],
            options={
                "ordering": ["-run_date", "school_id"],
            },
        ),
        migrations.AddConstraint(
            model_name="feeautomatedreminderlog",
            constraint=models.UniqueConstraint(fields=("school", "run_date"), name="uniq_fee_auto_reminder_school_date"),
        ),
    ]
