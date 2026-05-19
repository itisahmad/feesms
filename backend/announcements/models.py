"""Broadcast announcements to parents via SMS / WhatsApp."""
from __future__ import annotations

from django.conf import settings
from django.db import models

from schools.models import School, SchoolClass, Student


class Announcement(models.Model):
    CATEGORY_TRIP = 'trip'
    CATEGORY_EVENT = 'event'
    CATEGORY_HOLIDAY = 'holiday'
    CATEGORY_ACADEMIC = 'academic'
    CATEGORY_GENERAL = 'general'
    CATEGORY_URGENT = 'urgent'
    CATEGORY_CHOICES = [
        (CATEGORY_TRIP, 'Trip / excursion'),
        (CATEGORY_EVENT, 'Event'),
        (CATEGORY_HOLIDAY, 'Holiday / leave'),
        (CATEGORY_ACADEMIC, 'Academic'),
        (CATEGORY_GENERAL, 'General'),
        (CATEGORY_URGENT, 'Urgent'),
    ]

    AUDIENCE_ALL = 'all_parents'
    AUDIENCE_CLASSES = 'classes'
    AUDIENCE_CHOICES = [
        (AUDIENCE_ALL, 'All parents (whole school)'),
        (AUDIENCE_CLASSES, 'Selected classes'),
    ]

    CHANNEL_SMS = 'sms'
    CHANNEL_WHATSAPP = 'whatsapp'
    CHANNEL_BOTH = 'both'
    CHANNEL_CHOICES = [
        (CHANNEL_SMS, 'SMS'),
        (CHANNEL_WHATSAPP, 'WhatsApp'),
        (CHANNEL_BOTH, 'SMS + WhatsApp'),
    ]

    STATUS_DRAFT = 'draft'
    STATUS_SENT = 'sent'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_SENT, 'Sent'),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='announcements')
    title = models.CharField(max_length=200)
    body = models.TextField()
    category = models.CharField(max_length=32, choices=CATEGORY_CHOICES, default=CATEGORY_GENERAL)
    audience_type = models.CharField(max_length=32, choices=AUDIENCE_CHOICES, default=AUDIENCE_ALL)
    target_class_ids = models.JSONField(default=list, blank=True)
    channel = models.CharField(max_length=16, choices=CHANNEL_CHOICES, default=CHANNEL_BOTH)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='announcements_created',
    )
    recipient_count = models.PositiveIntegerField(default=0)
    post_to_whatsapp_groups = models.BooleanField(
        default=True,
        help_text='When enabled, also post to class WhatsApp groups (Cloud API) or include group links in parent messages.',
    )
    sent_sms = models.PositiveIntegerField(default=0)
    sent_whatsapp = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    whatsapp_groups_targeted = models.PositiveIntegerField(default=0)
    whatsapp_groups_posted = models.PositiveIntegerField(default=0)
    whatsapp_groups_failed = models.PositiveIntegerField(default=0)
    whatsapp_groups_link_only = models.PositiveIntegerField(
        default=0,
        help_text='Classes with invite link only (no group JID); link included in parent messages.',
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.title} ({self.get_status_display()})'

    @property
    def audience_label(self) -> str:
        if self.audience_type == self.AUDIENCE_ALL:
            return 'Whole school'
        ids = self.target_class_ids or []
        if not ids:
            return 'Selected classes'
        names = list(
            SchoolClass.objects.filter(school_id=self.school_id, id__in=ids).values_list('name', flat=True)
        )
        if not names:
            return f'{len(ids)} class(es)'
        if len(names) <= 3:
            return ', '.join(names)
        return f'{len(names)} classes'


class AnnouncementDelivery(models.Model):
    STATUS_SENT = 'sent'
    STATUS_FAILED = 'failed'
    STATUS_CHOICES = [
        (STATUS_SENT, 'Sent'),
        (STATUS_FAILED, 'Failed'),
    ]

    announcement = models.ForeignKey(Announcement, on_delete=models.CASCADE, related_name='deliveries')
    student = models.ForeignKey(Student, on_delete=models.SET_NULL, null=True, blank=True)
    parent_phone = models.CharField(max_length=20)
    student_name = models.CharField(max_length=120, blank=True)
    class_name = models.CharField(max_length=80, blank=True)
    channel = models.CharField(max_length=16)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'Announcement deliveries'


class AnnouncementGroupDelivery(models.Model):
    """Delivery log for class WhatsApp group posts."""

    STATUS_POSTED = 'posted'
    STATUS_LINK_IN_PARENT_MSG = 'link_in_parent_message'
    STATUS_FAILED = 'failed'
    STATUS_SKIPPED = 'skipped'
    STATUS_CHOICES = [
        (STATUS_POSTED, 'Posted to group'),
        (STATUS_LINK_IN_PARENT_MSG, 'Link sent to parents'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_SKIPPED, 'Skipped'),
    ]

    announcement = models.ForeignKey(Announcement, on_delete=models.CASCADE, related_name='group_deliveries')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='announcement_group_deliveries')
    class_name = models.CharField(max_length=80)
    whatsapp_group_link = models.URLField(max_length=500, blank=True)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['class_name']
        verbose_name_plural = 'Announcement group deliveries'
