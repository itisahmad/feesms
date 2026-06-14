from django.db import migrations, models
import re


def slug_from_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "", (name or "").upper())
    return (cleaned[:10] or "SCHOOL")


def populate_public_codes(apps, schema_editor):
    School = apps.get_model("schools", "School")
    used = set()
    for school in School.objects.all().order_by("id"):
        base = slug_from_name(school.name)
        candidate = f"{base}-{school.id}"
        suffix = 0
        while candidate in used:
            suffix += 1
            candidate = f"{base}-{school.id}-{suffix}"
        school.public_code = candidate
        school.save(update_fields=["public_code"])
        used.add(candidate)


class Migration(migrations.Migration):

    dependencies = [
        ("schools", "0009_schoolclass_whatsapp_group"),
    ]

    operations = [
        migrations.AddField(
            model_name="school",
            name="public_code",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Code parents use at login together with mobile number.",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="student",
            name="parent_phone_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="PhoneOTP",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("phone", models.CharField(max_length=20)),
                (
                    "purpose",
                    models.CharField(
                        choices=[("enroll_student", "Student enrollment")],
                        default="enroll_student",
                        max_length=32,
                    ),
                ),
                ("code_hash", models.CharField(max_length=64)),
                ("expires_at", models.DateTimeField()),
                ("verified_at", models.DateTimeField(blank=True, null=True)),
                ("verify_attempts", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "school",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="phone_otps",
                        to="schools.school",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(
                        fields=["school", "phone", "purpose", "-created_at"],
                        name="schools_pho_school__a8e2b4_idx",
                    )
                ],
            },
        ),
        migrations.RunPython(populate_public_codes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="school",
            name="public_code",
            field=models.CharField(
                blank=True,
                help_text="Code parents use at login together with mobile number.",
                max_length=32,
                unique=True,
            ),
        ),
    ]
