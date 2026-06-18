# Generated manually

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('schools', '0014_schoolstaffrole_user_staff_role'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AttendanceSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('finalized', 'Finalized')], default='draft', max_length=20)),
                ('finalized_at', models.DateTimeField(blank=True, null=True)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('marked_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='attendance_sessions_marked', to=settings.AUTH_USER_MODEL)),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attendance_sessions', to='schools.school')),
                ('school_class', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='attendance_sessions', to='schools.schoolclass')),
                ('section', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='attendance_sessions', to='schools.section')),
            ],
            options={
                'ordering': ['-date', 'school_class__display_order'],
                'unique_together': {('school', 'school_class', 'section', 'date')},
            },
        ),
        migrations.CreateModel(
            name='ClassTeacherAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('assigned_at', models.DateTimeField(auto_now_add=True)),
                ('assigned_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assigned_class_teachers', to=settings.AUTH_USER_MODEL)),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='class_teacher_assignments', to='schools.school')),
                ('school_class', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teacher_assignments', to='schools.schoolclass')),
                ('section', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teacher_assignments', to='schools.section')),
                ('staff_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='class_teacher_assignments', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['school_class__display_order', 'section__display_order'],
                'unique_together': {('staff_user', 'school_class', 'section')},
            },
        ),
        migrations.CreateModel(
            name='AttendanceRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('present', 'Present'), ('absent', 'Absent'), ('late', 'Late'), ('leave', 'On leave'), ('half_day', 'Half day')], default='present', max_length=20)),
                ('remark', models.CharField(blank=True, max_length=200)),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='records', to='attendance.attendancesession')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='attendance_records', to='schools.student')),
            ],
            options={
                'ordering': ['student__roll_number', 'student__name'],
                'unique_together': {('session', 'student')},
            },
        ),
    ]
