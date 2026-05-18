# Generated manually for receipts app

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('schools', '0007_alter_user_module_permissions'),
    ]

    operations = [
        migrations.CreateModel(
            name='SchoolReceiptSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('template_key', models.CharField(default='classic', max_length=50)),
                ('print_format', models.CharField(choices=[('a4', 'A4'), ('thermal', 'Thermal (80mm)')], default='a4', max_length=20)),
                ('school_name', models.CharField(blank=True, max_length=200)),
                ('address', models.TextField(blank=True)),
                ('phone', models.CharField(blank=True, max_length=50)),
                ('email', models.EmailField(blank=True, max_length=254)),
                ('header_color', models.CharField(default='#0d9488', max_length=7)),
                ('footer_text', models.TextField(blank=True, default='This is a computer-generated receipt.')),
                ('signature_label', models.CharField(blank=True, default='Authorized Signatory', max_length=120)),
                ('stamp_text', models.CharField(blank=True, max_length=120)),
                ('show_logo', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('school', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='receipt_settings', to='schools.school')),
            ],
            options={
                'verbose_name': 'School receipt settings',
                'verbose_name_plural': 'School receipt settings',
            },
        ),
    ]
