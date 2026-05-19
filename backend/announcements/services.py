"""Resolve recipients and send announcement messages."""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from schools.messaging import normalize_phone, send_sms_message, send_whatsapp_message
from schools.models import SchoolClass, Student

from .models import Announcement, AnnouncementDelivery


def _validate_class_ids(school, class_ids: list[int]) -> list[int]:
    if not class_ids:
        return []
    valid = set(
        SchoolClass.objects.filter(school=school, id__in=class_ids).values_list('id', flat=True)
    )
    return [cid for cid in class_ids if cid in valid]


def resolve_parent_recipients(school, audience_type: str, class_ids: list[int]) -> list[dict]:
    """Unique parent phones with one representative student per phone."""
    qs = Student.objects.filter(school=school, is_active=True).select_related('school_class')
    qs = qs.exclude(parent_phone__isnull=True).exclude(parent_phone='')

    if audience_type == Announcement.AUDIENCE_CLASSES:
        valid_ids = _validate_class_ids(school, class_ids)
        if not valid_ids:
            return []
        qs = qs.filter(school_class_id__in=valid_ids)

    by_phone: dict[str, dict] = {}
    for student in qs:
        phone = normalize_phone(student.parent_phone)
        if not phone or phone in by_phone:
            continue
        class_name = student.school_class.name if student.school_class else ''
        by_phone[phone] = {
            'student_id': student.id,
            'student_name': student.name,
            'parent_phone': student.parent_phone,
            'class_name': class_name,
        }
    return list(by_phone.values())


def build_announcement_message(announcement: Announcement) -> str:
    school_name = announcement.school.name
    category = announcement.get_category_display()
    lines = [f'{school_name} — {category}: {announcement.title}', '', announcement.body.strip()]
    return '\n'.join(lines).strip()


def preview_recipient_count(school, audience_type: str, class_ids: list[int]) -> int:
    return len(resolve_parent_recipients(school, audience_type, class_ids))


@transaction.atomic
def send_announcement(announcement: Announcement) -> dict:
    if announcement.status == Announcement.STATUS_SENT:
        raise ValueError('Announcement was already sent.')

    recipients = resolve_parent_recipients(
        announcement.school,
        announcement.audience_type,
        announcement.target_class_ids or [],
    )
    if not recipients:
        raise ValueError('No active students with parent phone numbers match this audience.')

    message = build_announcement_message(announcement)
    channel = announcement.channel
    sent_sms = 0
    sent_whatsapp = 0
    failed_count = 0
    deliveries: list[AnnouncementDelivery] = []

    for item in recipients:
        phone = item['parent_phone']
        student_id = item.get('student_id')

        if channel in (Announcement.CHANNEL_SMS, Announcement.CHANNEL_BOTH):
            ok, err, _ = send_sms_message(phone, message)
            if ok:
                sent_sms += 1
                deliveries.append(
                    AnnouncementDelivery(
                        announcement=announcement,
                        student_id=student_id,
                        parent_phone=phone,
                        student_name=item.get('student_name', ''),
                        class_name=item.get('class_name', ''),
                        channel=Announcement.CHANNEL_SMS,
                        status=AnnouncementDelivery.STATUS_SENT,
                    )
                )
            else:
                failed_count += 1
                deliveries.append(
                    AnnouncementDelivery(
                        announcement=announcement,
                        student_id=student_id,
                        parent_phone=phone,
                        student_name=item.get('student_name', ''),
                        class_name=item.get('class_name', ''),
                        channel=Announcement.CHANNEL_SMS,
                        status=AnnouncementDelivery.STATUS_FAILED,
                        error_message=err or 'SMS failed',
                    )
                )

        if channel in (Announcement.CHANNEL_WHATSAPP, Announcement.CHANNEL_BOTH):
            ok, err, _ = send_whatsapp_message(phone, message)
            if ok:
                sent_whatsapp += 1
                deliveries.append(
                    AnnouncementDelivery(
                        announcement=announcement,
                        student_id=student_id,
                        parent_phone=phone,
                        student_name=item.get('student_name', ''),
                        class_name=item.get('class_name', ''),
                        channel=Announcement.CHANNEL_WHATSAPP,
                        status=AnnouncementDelivery.STATUS_SENT,
                    )
                )
            else:
                failed_count += 1
                deliveries.append(
                    AnnouncementDelivery(
                        announcement=announcement,
                        student_id=student_id,
                        parent_phone=phone,
                        student_name=item.get('student_name', ''),
                        class_name=item.get('class_name', ''),
                        channel=Announcement.CHANNEL_WHATSAPP,
                        status=AnnouncementDelivery.STATUS_FAILED,
                        error_message=err or 'WhatsApp failed',
                    )
                )

    if deliveries:
        AnnouncementDelivery.objects.bulk_create(deliveries)

    announcement.status = Announcement.STATUS_SENT
    announcement.recipient_count = len(recipients)
    announcement.sent_sms = sent_sms
    announcement.sent_whatsapp = sent_whatsapp
    announcement.failed_count = failed_count
    announcement.sent_at = timezone.now()
    announcement.save(
        update_fields=[
            'status',
            'recipient_count',
            'sent_sms',
            'sent_whatsapp',
            'failed_count',
            'sent_at',
            'updated_at',
        ]
    )

    return {
        'recipient_count': len(recipients),
        'sent_sms': sent_sms,
        'sent_whatsapp': sent_whatsapp,
        'failed_count': failed_count,
    }
