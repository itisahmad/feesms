from decimal import Decimal

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('schools', '0008_classsubject'),
    ]

    operations = [
        migrations.CreateModel(
            name='ExamResult',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('exam_date', models.DateField(blank=True, null=True)),
                ('max_marks', models.DecimalField(decimal_places=2, default=Decimal('100'), max_digits=8)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('published', 'Published')], default='draft', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='exam_results', to='schools.school')),
                ('school_class', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='exam_results', to='schools.schoolclass')),
            ],
            options={
                'ordering': ['-created_at'],
                'unique_together': {('school', 'school_class', 'name')},
            },
        ),
        migrations.CreateModel(
            name='StudentExamMark',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('marks_obtained', models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ('max_marks', models.DecimalField(decimal_places=2, default=Decimal('100'), max_digits=8)),
                ('is_absent', models.BooleanField(default=False)),
                ('grade', models.CharField(blank=True, max_length=8)),
                ('remarks', models.CharField(blank=True, max_length=255)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('class_subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='exam_marks', to='schools.classsubject')),
                ('exam', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='marks', to='results.examresult')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='exam_marks', to='schools.student')),
            ],
            options={
                'ordering': ['student__name', 'class_subject__display_order', 'class_subject__name'],
                'unique_together': {('exam', 'student', 'class_subject')},
            },
        ),
    ]
