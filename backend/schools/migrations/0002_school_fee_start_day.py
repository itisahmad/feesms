from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='school',
            name='fee_start_day',
            field=models.IntegerField(
                default=1,
                help_text='Charges from current month apply only when student joins on/before this day.',
                validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(28)],
            ),
        ),
    ]
