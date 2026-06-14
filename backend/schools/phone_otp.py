"""Parent phone OTP for student enrollment."""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .messaging import send_sms_message
from .models import PhoneOTP

logger = logging.getLogger(__name__)

OTP_LENGTH = 6
OTP_EXPIRE_MINUTES = 10
MAX_SENDS_PER_WINDOW = 3
SEND_WINDOW_MINUTES = 15
MAX_VERIFY_ATTEMPTS = 5
VERIFICATION_VALID_MINUTES = 30
# TODO: remove before production — DEBUG-only bypass for local/testing OTP flows
DEBUG_TEST_OTP = "123456"
PURPOSE_ENROLL = PhoneOTP.PURPOSE_ENROLL
PURPOSE_PARENT_REGISTER = PhoneOTP.PURPOSE_PARENT_REGISTER
PURPOSE_PARENT_RESET = PhoneOTP.PURPOSE_PARENT_RESET


class PhoneOTPError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def normalize_parent_phone(raw_phone: str) -> str:
    raw_phone = (raw_phone or "").strip()
    digits = "".join(ch for ch in raw_phone if ch.isdigit())
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if len(digits) != 10:
        raise PhoneOTPError("Enter a valid 10-digit parent phone number.")
    if digits[0] not in "6789":
        raise PhoneOTPError("Parent phone number must start with 6, 7, 8, or 9.")
    return digits


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _is_debug_test_otp(code: str) -> bool:
    return settings.DEBUG and code == DEBUG_TEST_OTP


def _send_otp(school, phone: str, purpose: str, *, log_label: str) -> dict:
    window_start = timezone.now() - timedelta(minutes=SEND_WINDOW_MINUTES)
    recent_sends = PhoneOTP.objects.filter(
        school=school,
        phone=phone,
        purpose=purpose,
        created_at__gte=window_start,
    ).count()
    if recent_sends >= MAX_SENDS_PER_WINDOW:
        raise PhoneOTPError("Too many OTP requests for this number. Try again in 15 minutes.", 429)

    code = "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))
    expires_at = timezone.now() + timedelta(minutes=OTP_EXPIRE_MINUTES)
    otp_row = PhoneOTP.objects.create(
        school=school,
        phone=phone,
        purpose=purpose,
        code_hash=_hash_code(code),
        expires_at=expires_at,
    )

    message = f"Your SchoolFee Pro verification code is {code}. Valid for {OTP_EXPIRE_MINUTES} minutes."
    ok, err, _ = send_sms_message(phone, message)

    if settings.DEBUG:
        logger.info("%s for school=%s phone=%s code=%s", log_label, school.id, phone, code)

    if not ok:
        if settings.DEBUG:
            return {
                "message": "OTP generated (SMS not sent — check server logs in DEBUG).",
                "phone": phone,
                "expires_at": expires_at.isoformat(),
                "debug_otp_logged": True,
            }
        otp_row.delete()
        raise PhoneOTPError(err or "Failed to send SMS. Check Twilio configuration.", 502)

    return {
        "message": "Verification code sent by SMS.",
        "phone": phone,
        "expires_at": expires_at.isoformat(),
    }


def _confirm_otp(school, raw_phone: str, otp: str, purpose: str) -> dict:
    phone = normalize_parent_phone(raw_phone)
    code = (otp or "").strip()
    if not code.isdigit() or len(code) != OTP_LENGTH:
        raise PhoneOTPError("Enter the 6-digit verification code.")

    now = timezone.now()
    otp_row = (
        PhoneOTP.objects.filter(
            school=school,
            phone=phone,
            purpose=purpose,
            verified_at__isnull=True,
            expires_at__gte=now,
        )
        .order_by("-created_at")
        .first()
    )
    if not otp_row:
        raise PhoneOTPError("No active verification code. Request a new OTP.")

    if otp_row.verify_attempts >= MAX_VERIFY_ATTEMPTS:
        raise PhoneOTPError("Too many incorrect attempts. Request a new OTP.", 429)

    otp_row.verify_attempts += 1
    if not _is_debug_test_otp(code) and _hash_code(code) != otp_row.code_hash:
        otp_row.save(update_fields=["verify_attempts"])
        raise PhoneOTPError("Incorrect verification code.")

    otp_row.verified_at = now
    otp_row.save(update_fields=["verify_attempts", "verified_at"])
    return {
        "message": "Phone number verified.",
        "phone": phone,
        "verified_at": otp_row.verified_at.isoformat(),
    }


def _has_recent_verification(school_id: int, phone: str, purpose: str) -> bool:
    since = timezone.now() - timedelta(minutes=VERIFICATION_VALID_MINUTES)
    return PhoneOTP.objects.filter(
        school_id=school_id,
        phone=phone,
        purpose=purpose,
        verified_at__gte=since,
    ).exists()


def send_enrollment_otp(school, raw_phone: str) -> dict:
    phone = normalize_parent_phone(raw_phone)
    return _send_otp(school, phone, PURPOSE_ENROLL, log_label="Enrollment OTP")


def confirm_enrollment_otp(school, raw_phone: str, otp: str) -> dict:
    return _confirm_otp(school, raw_phone, otp, PURPOSE_ENROLL)


def has_recent_phone_verification(school_id: int, phone: str) -> bool:
    return _has_recent_verification(school_id, phone, PURPOSE_ENROLL)


def send_parent_register_otp(school, raw_phone: str) -> dict:
    from .models import Student

    phone = normalize_parent_phone(raw_phone)
    if not Student.objects.filter(school=school, parent_phone=phone, is_active=True).exists():
        raise PhoneOTPError("No student found with this phone at this school.")
    return _send_otp(school, phone, PURPOSE_PARENT_REGISTER, log_label="Parent register OTP")


def confirm_parent_register_otp(school, raw_phone: str, otp: str) -> dict:
    return _confirm_otp(school, raw_phone, otp, PURPOSE_PARENT_REGISTER)


def has_recent_parent_register_verification(school_id: int, phone: str) -> bool:
    return _has_recent_verification(school_id, phone, PURPOSE_PARENT_REGISTER)


def send_parent_reset_otp(school, raw_phone: str) -> dict:
    from django.contrib.auth import get_user_model
    from .models import Student

    User = get_user_model()
    phone = normalize_parent_phone(raw_phone)
    if not User.objects.filter(school=school, role="parent", phone=phone, is_active=True).exists():
        raise PhoneOTPError("No parent account found. Register first with OTP.")
    if not Student.objects.filter(school=school, parent_phone=phone, is_active=True).exists():
        raise PhoneOTPError("No student found with this phone at this school.")
    return _send_otp(school, phone, PURPOSE_PARENT_RESET, log_label="Parent reset OTP")


def confirm_parent_reset_otp(school, raw_phone: str, otp: str) -> dict:
    return _confirm_otp(school, raw_phone, otp, PURPOSE_PARENT_RESET)


def has_recent_parent_reset_verification(school_id: int, phone: str) -> bool:
    return _has_recent_verification(school_id, phone, PURPOSE_PARENT_RESET)
