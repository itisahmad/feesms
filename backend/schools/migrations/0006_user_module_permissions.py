from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("schools", "0005_admissionenquiry"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="module_permissions",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
