"""
Automated fee reminders on each school's fee_start_day (cron via management command).

Respects SchoolMessagingSettings (SMS / WhatsApp). Logs MessageLog / MessageUsage.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.utils import timezone

from schools.fee_reminder_data import academic_year_label, merged_fee_reminder_targets
from schools.messaging import normalize_phone
from schools.models import FeeAutomatedReminderLog, MessageLog, MessageUsage, School, SchoolMessagingSettings, Student
from schools.services.messaging_service import send_sms, send_whatsapp


def _get_or_create_messaging_settings(school: School) -> SchoolMessagingSettings:
    obj, _ = SchoolMessagingSettings.objects.get_or_create(school=school)
    return obj


def _build_fee_start_message(
    *,
    school: School,
    student: Student,
    ref_month: int,
    ref_year: int,
    monthly_pending: Decimal,
    yearly_pending: Decimal,
) -> str:
    month_name = date(ref_year, ref_month, 1).strftime("%b")
    ay = academic_year_label(school, ref_month, ref_year)
    cls_disp = student.get_class_display()
    parts = [
        f"Dear Parent, fee reminder from {school.name} for {student.name} ({cls_disp}).",
    ]
    if monthly_pending > 0:
        parts.append(
            f"Pending for {month_name} {ref_year}: ₹{monthly_pending:.2f}.",
        )
    if yearly_pending > 0:
        parts.append(
            f"Total pending across academic year {ay} (all recorded dues): ₹{yearly_pending:.2f}. "
            f"You may pay monthly or settle the full year as per school policy (discounts if applicable).",
        )
    parts.append("Please pay at your earliest convenience. Thank you.")
    return " ".join(parts)


def _send_one_channel(
    *,
    school: School,
    student: Student,
    channel: str,
    body: str,
    raw_phone: str,
) -> tuple[str, str | None]:
    """Returns (status, error_message)."""
    phone_display = normalize_phone(raw_phone) or raw_phone
    send_fn = send_sms if channel == MessageLog.CHANNEL_SMS else send_whatsapp
    log = MessageLog.objects.create(
        school=school,
        student=student,
        phone_number=phone_display,
        channel=channel,
        message_type=MessageLog.TYPE_REMINDER,
        content=body,
        status=MessageLog.STATUS_PENDING,
    )
    out = send_fn(raw_phone, body)
    now = timezone.now()
    if out.get("success"):
        log.status = MessageLog.STATUS_SENT
        log.provider_response = out.get("provider_response")
        log.sent_at = now
        log.save(update_fields=["status", "provider_response", "sent_at"])
        return "sent", None
    log.status = MessageLog.STATUS_FAILED
    log.provider_response = {"error": out.get("error"), **(out.get("provider_response") or {})}
    log.sent_at = now
    log.save(update_fields=["status", "provider_response", "sent_at"])
    return "failed", out.get("error") or "send failed"


def run_fee_start_reminders_for_date(
    run_date: date,
    *,
    force: bool = False,
    school_id: int | None = None,
) -> dict:
    """
    For schools whose fee_start_day matches run_date.day, send SMS and/or WhatsApp
    to parents with pending monthly and/or academic-year balances.

    If not force, skips a school when FeeAutomatedReminderLog already exists for run_date.
    """
    day = run_date.day
    summary: dict = {
        "run_date": str(run_date),
        "schools_considered": 0,
        "schools_skipped_wrong_day": 0,
        "schools_skipped_already_run": 0,
        "schools_skipped_no_channel": 0,
        "schools_processed": 0,
        "students_messaged": 0,
        "channels": {"sms": {"sent": 0, "failed": 0}, "whatsapp": {"sent": 0, "failed": 0}},
        "errors": [],
    }

    qs = School.objects.all().order_by("id")
    if school_id is not None:
        qs = qs.filter(id=school_id)

    ref_month, ref_year = run_date.month, run_date.year

    for school in qs:
        if school.fee_start_day != day:
            summary["schools_skipped_wrong_day"] += 1
            continue
        summary["schools_considered"] += 1

        if not force and FeeAutomatedReminderLog.objects.filter(school=school, run_date=run_date).exists():
            summary["schools_skipped_already_run"] += 1
            continue

        msg_settings = _get_or_create_messaging_settings(school)
        channels: list[str] = []
        if msg_settings.sms_enabled:
            channels.append(MessageLog.CHANNEL_SMS)
        if msg_settings.whatsapp_enabled:
            channels.append(MessageLog.CHANNEL_WHATSAPP)
        if not channels:
            summary["schools_skipped_no_channel"] += 1
            continue

        targets = merged_fee_reminder_targets(school, ref_month, ref_year)
        per_channel_attempts = {MessageLog.CHANNEL_SMS: 0, MessageLog.CHANNEL_WHATSAPP: 0}

        for sid, row in targets.items():
            student = row["student"]
            raw_phone = (row.get("parent_phone") or "").strip()
            if not raw_phone:
                for ch in channels:
                    per_channel_attempts[ch] += 1
                    MessageLog.objects.create(
                        school=school,
                        student=student,
                        phone_number="",
                        channel=ch,
                        message_type=MessageLog.TYPE_REMINDER,
                        content="(skipped — no parent phone)",
                        status=MessageLog.STATUS_FAILED,
                        provider_response={"error": "Missing parent phone number.", "source": "fee_start_reminder"},
                    )
                    summary["channels"][ch]["failed"] += 1
                summary["students_messaged"] += 1
                continue

            body = _build_fee_start_message(
                school=school,
                student=student,
                ref_month=ref_month,
                ref_year=ref_year,
                monthly_pending=row["monthly_pending"],
                yearly_pending=row["yearly_pending"],
            )

            for ch in channels:
                per_channel_attempts[ch] += 1
                st, err = _send_one_channel(
                    school=school,
                    student=student,
                    channel=ch,
                    body=body,
                    raw_phone=raw_phone,
                )
                if st == "sent":
                    summary["channels"][ch]["sent"] += 1
                else:
                    summary["channels"][ch]["failed"] += 1
                    if err:
                        summary["errors"].append({"school_id": school.id, "student_id": sid, "channel": ch, "error": err})

            summary["students_messaged"] += 1

        for ch, count in per_channel_attempts.items():
            if count > 0:
                MessageUsage.objects.create(school=school, channel=ch, message_count=count)

        FeeAutomatedReminderLog.objects.get_or_create(school=school, run_date=run_date)
        summary["schools_processed"] += 1

    return summary
