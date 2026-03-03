# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0007_add_fee_choices_admission_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='feestructure',
            name='billing_period',
            field=models.CharField(choices=[('monthly', 'Monthly'), ('quarterly', 'Quarterly'), ('half_yearly', 'Half-Yearly'), ('yearly', 'Yearly')], default='monthly', max_length=20),
        ),
    ]
