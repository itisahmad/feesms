from django.db import migrations, models
import django.db.models.deletion

import results.grading


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0008_classsubject'),
        ('results', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='SchoolGradingSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('absent_grade', models.CharField(default='AB', max_length=8)),
                ('bands', models.JSONField(default=results.grading.default_bands)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('school', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='grading_settings', to='schools.school')),
            ],
            options={
                'verbose_name': 'School grading settings',
                'verbose_name_plural': 'School grading settings',
            },
        ),
    ]
