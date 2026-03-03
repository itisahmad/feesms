# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0008_add_billing_period'),
    ]

    operations = [
        migrations.AddField(
            model_name='school',
            name='academic_year_start_month',
            field=models.IntegerField(default=4)  # 4=April (common in India)
        ),
    ]
