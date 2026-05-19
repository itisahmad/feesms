from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0008_classsubject'),
    ]

    operations = [
        migrations.AddField(
            model_name='schoolclass',
            name='whatsapp_group_name',
            field=models.CharField(
                blank=True,
                help_text='Optional label, e.g. "Class 5 Parents"',
                max_length=120,
            ),
        ),
        migrations.AddField(
            model_name='schoolclass',
            name='whatsapp_group_link',
            field=models.URLField(
                blank=True,
                help_text='Optional invite link (https://chat.whatsapp.com/...) for parents to join.',
                max_length=500,
            ),
        ),
        migrations.AddField(
            model_name='schoolclass',
            name='whatsapp_group_id',
            field=models.CharField(
                blank=True,
                help_text='Optional WhatsApp group JID for Cloud API auto-post (e.g. 120363...@g.us).',
                max_length=80,
            ),
        ),
    ]
