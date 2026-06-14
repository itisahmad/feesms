from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("schools", "0010_school_public_code_phone_otp"),
    ]

    operations = [
        migrations.AlterField(
            model_name="phoneotp",
            name="purpose",
            field=models.CharField(
                choices=[
                    ("enroll_student", "Student enrollment"),
                    ("parent_register", "Parent registration"),
                ],
                default="enroll_student",
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("owner", "Owner"),
                    ("accountant", "Accountant"),
                    ("staff", "Staff"),
                    ("parent", "Parent"),
                ],
                default="owner",
                max_length=20,
            ),
        ),
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(
                condition=models.Q(("role", "parent")),
                fields=("school", "phone"),
                name="uniq_parent_school_phone",
            ),
        ),
    ]
