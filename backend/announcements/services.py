"""Resolve recipients and send announcement messages."""
from __future__ import annotations

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from schools.messaging import normalize_phone, send_sms_message, send_whatsapp_group_message, send_whatsapp_message
from schools.models import SchoolClass, Student

from .models import Announcement, AnnouncementDelivery, AnnouncementGroupDelivery


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
        school_class = student.school_class
        class_name = school_class.name if school_class else ''
        group_link = (school_class.whatsapp_group_link or '').strip() if school_class else ''
        by_phone[phone] = {
            'student_id': student.id,
            'student_name': student.name,
            'parent_phone': student.parent_phone,
            'class_name': class_name,
            'school_class_id': student.school_class_id,
            'whatsapp_group_link': group_link,
        }
    return list(by_phone.values())


def resolve_whatsapp_group_classes(school, audience_type: str, class_ids: list[int]) -> list[SchoolClass]:
    """Classes in scope that have a WhatsApp group link or group JID configured."""
    qs = SchoolClass.objects.filter(school=school).filter(
        Q(whatsapp_group_link__gt='') | Q(whatsapp_group_id__gt='')
    )
    if audience_type == Announcement.AUDIENCE_CLASSES:
        valid_ids = _validate_class_ids(school, class_ids)
        if not valid_ids:
            return []
        qs = qs.filter(id__in=valid_ids)
    return list(qs.order_by('display_order', 'name'))


def build_announcement_message(announcement: Announcement) -> str:
    school_name = announcement.school.name
    category = announcement.get_category_display()
    lines = [f'{school_name} — {category}: {announcement.title}', '', announcement.body.strip()]
    return '\n'.join(lines).strip()


def build_parent_message(announcement: Announcement, whatsapp_group_link: str = '') -> str:
    message = build_announcement_message(announcement)
    link = (whatsapp_group_link or '').strip()
    if link:
        label = 'Join your class WhatsApp group'
        message = f'{message}\n\n{label}: {link}'
    return message


def preview_recipient_count(school, audience_type: str, class_ids: list[int]) -> int:
    return len(resolve_parent_recipients(school, audience_type, class_ids))


def preview_whatsapp_group_count(school, audience_type: str, class_ids: list[int]) -> int:
    return len(resolve_whatsapp_group_classes(school, audience_type, class_ids))


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

    channel = announcement.channel
    include_group_link_in_parent = announcement.post_to_whatsapp_groups
    base_message = build_announcement_message(announcement)
    sent_sms = 0
    sent_whatsapp = 0
    failed_count = 0
    deliveries: list[AnnouncementDelivery] = []

    for item in recipients:
        phone = item['parent_phone']
        student_id = item.get('student_id')
        group_link = item.get('whatsapp_group_link', '') if include_group_link_in_parent else ''
        parent_message = build_parent_message(announcement, group_link) if group_link else base_message

        if channel in (Announcement.CHANNEL_SMS, Announcement.CHANNEL_BOTH):
            ok, err, _ = send_sms_message(phone, parent_message)
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
            ok, err, _ = send_whatsapp_message(phone, parent_message)
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

    groups_targeted = 0
    groups_posted = 0
    groups_failed = 0
    groups_link_only = 0
    group_deliveries: list[AnnouncementGroupDelivery] = []

    if announcement.post_to_whatsapp_groups:
        group_classes = resolve_whatsapp_group_classes(
            announcement.school,
            announcement.audience_type,
            announcement.target_class_ids or [],
        )
        groups_targeted = len(group_classes)
        group_message = base_message

        for school_class in group_classes:
            link = (school_class.whatsapp_group_link or '').strip()
            group_id = (school_class.whatsapp_group_id or '').strip()

            if group_id:
                ok, err, _ = send_whatsapp_group_message(group_id, group_message)
                if ok:
                    groups_posted += 1
                    group_deliveries.append(
                        AnnouncementGroupDelivery(
                            announcement=announcement,
                            school_class=school_class,
                            class_name=school_class.name,
                            whatsapp_group_link=link,
                            status=AnnouncementGroupDelivery.STATUS_POSTED,
                        )
                    )
                else:
                    groups_failed += 1
                    group_deliveries.append(
                        AnnouncementGroupDelivery(
                            announcement=announcement,
                            school_class=school_class,
                            class_name=school_class.name,
                            whatsapp_group_link=link,
                            status=AnnouncementGroupDelivery.STATUS_FAILED,
                            error_message=err or 'Group post failed',
                        )
                    )
            elif link:
                groups_link_only += 1
                group_deliveries.append(
                    AnnouncementGroupDelivery(
                        announcement=announcement,
                        school_class=school_class,
                        class_name=school_class.name,
                        whatsapp_group_link=link,
                        status=AnnouncementGroupDelivery.STATUS_LINK_IN_PARENT_MSG,
                    )
                )

        if group_deliveries:
            AnnouncementGroupDelivery.objects.bulk_create(group_deliveries)

    announcement.status = Announcement.STATUS_SENT
    announcement.recipient_count = len(recipients)
    announcement.sent_sms = sent_sms
    announcement.sent_whatsapp = sent_whatsapp
    announcement.failed_count = failed_count
    announcement.whatsapp_groups_targeted = groups_targeted
    announcement.whatsapp_groups_posted = groups_posted
    announcement.whatsapp_groups_failed = groups_failed
    announcement.whatsapp_groups_link_only = groups_link_only
    announcement.sent_at = timezone.now()
    announcement.save(
        update_fields=[
            'status',
            'recipient_count',
            'sent_sms',
            'sent_whatsapp',
            'failed_count',
            'whatsapp_groups_targeted',
            'whatsapp_groups_posted',
            'whatsapp_groups_failed',
            'whatsapp_groups_link_only',
            'sent_at',
            'updated_at',
        ]
    )

    return {
        'recipient_count': len(recipients),
        'sent_sms': sent_sms,
        'sent_whatsapp': sent_whatsapp,
        'failed_count': failed_count,
        'whatsapp_groups_targeted': groups_targeted,
        'whatsapp_groups_posted': groups_posted,
        'whatsapp_groups_failed': groups_failed,
        'whatsapp_groups_link_only': groups_link_only,
    }
