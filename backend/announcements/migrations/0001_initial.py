import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('schools', '0008_classsubject'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Announcement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('body', models.TextField()),
                ('category', models.CharField(
                    choices=[
                        ('trip', 'Trip / excursion'),
                        ('event', 'Event'),
                        ('holiday', 'Holiday / leave'),
                        ('academic', 'Academic'),
                        ('general', 'General'),
                        ('urgent', 'Urgent'),
                    ],
                    default='general',
                    max_length=32,
                )),
                ('audience_type', models.CharField(
                    choices=[
                        ('all_parents', 'All parents (whole school)'),
                        ('classes', 'Selected classes'),
                    ],
                    default='all_parents',
                    max_length=32,
                )),
                ('target_class_ids', models.JSONField(blank=True, default=list)),
                ('channel', models.CharField(
                    choices=[
                        ('sms', 'SMS'),
                        ('whatsapp', 'WhatsApp'),
                        ('both', 'SMS + WhatsApp'),
                    ],
                    default='both',
                    max_length=16,
                )),
                ('status', models.CharField(
                    choices=[('draft', 'Draft'), ('sent', 'Sent')],
                    default='draft',
                    max_length=16,
                )),
                ('recipient_count', models.PositiveIntegerField(default=0)),
                ('sent_sms', models.PositiveIntegerField(default=0)),
                ('sent_whatsapp', models.PositiveIntegerField(default=0)),
                ('failed_count', models.PositiveIntegerField(default=0)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='announcements_created',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('school', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='announcements',
                    to='schools.school',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='AnnouncementDelivery',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('parent_phone', models.CharField(max_length=20)),
                ('student_name', models.CharField(blank=True, max_length=120)),
                ('class_name', models.CharField(blank=True, max_length=80)),
                ('channel', models.CharField(max_length=16)),
                ('status', models.CharField(choices=[('sent', 'Sent'), ('failed', 'Failed')], max_length=16)),
                ('error_message', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('announcement', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='deliveries',
                    to='announcements.announcement',
                )),
                ('student', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to='schools.student',
                )),
            ],
            options={
                'verbose_name_plural': 'Announcement deliveries',
                'ordering': ['-created_at'],
            },
        ),
    ]
