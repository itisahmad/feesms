from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0009_schoolclass_whatsapp_group'),
        ('announcements', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='announcement',
            name='post_to_whatsapp_groups',
            field=models.BooleanField(
                default=True,
                help_text='When enabled, also post to class WhatsApp groups (Cloud API) or include group links in parent messages.',
            ),
        ),
        migrations.AddField(
            model_name='announcement',
            name='whatsapp_groups_targeted',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='announcement',
            name='whatsapp_groups_posted',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='announcement',
            name='whatsapp_groups_failed',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='announcement',
            name='whatsapp_groups_link_only',
            field=models.PositiveIntegerField(
                default=0,
                help_text='Classes with invite link only (no group JID); link included in parent messages.',
            ),
        ),
        migrations.CreateModel(
            name='AnnouncementGroupDelivery',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('class_name', models.CharField(max_length=80)),
                ('whatsapp_group_link', models.URLField(blank=True, max_length=500)),
                ('status', models.CharField(
                    choices=[
                        ('posted', 'Posted to group'),
                        ('link_in_parent_message', 'Link sent to parents'),
                        ('failed', 'Failed'),
                        ('skipped', 'Skipped'),
                    ],
                    max_length=32,
                )),
                ('error_message', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('announcement', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='group_deliveries',
                    to='announcements.announcement',
                )),
                ('school_class', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='announcement_group_deliveries',
                    to='schools.schoolclass',
                )),
            ],
            options={
                'verbose_name_plural': 'Announcement group deliveries',
                'ordering': ['class_name'],
            },
        ),
    ]
