from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import School, SchoolMessagingSettings


@receiver(post_save, sender=School)
def ensure_school_messaging_settings(sender, instance, created, **kwargs):
    if created:
        SchoolMessagingSettings.objects.get_or_create(school=instance)
