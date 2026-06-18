# Generated manually for attendance + staff roles

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0013_school_subscription_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='SchoolStaffRole',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=80)),
                ('slug', models.CharField(max_length=80)),
                ('description', models.TextField(blank=True)),
                ('module_permissions', models.JSONField(blank=True, default=dict)),
                ('is_system', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='staff_roles', to='schools.school')),
            ],
            options={
                'ordering': ['name'],
                'unique_together': {('school', 'name'), ('school', 'slug')},
            },
        ),
        migrations.AddField(
            model_name='user',
            name='staff_role',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='users', to='schools.schoolstaffrole'),
        ),
    ]
