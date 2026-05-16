"""
Platform-managed outbound messaging.

Set MESSAGING_PROVIDER=mock (default) for simulated sends, or twilio to use existing Twilio helpers.
Additional providers (MSG91, etc.) can be added as branches below.
"""
from __future__ import annotations

import os
import uuid
from typing import Any


def _mock_send(channel: str, phone: str, message: str) -> dict[str, Any]:
    return {
        "success": True,
        "error": None,
        "provider_response": {
            "provider": "mock",
            "channel": channel,
            "to": phone,
            "message_preview": message[:120] + ("…" if len(message) > 120 else ""),
            "mock_id": f"mock_{uuid.uuid4().hex[:24]}",
        },
    }


def _twilio_send_sms(phone: str, message: str) -> dict[str, Any]:
    from schools.messaging import send_sms_message

    ok, err, sid = send_sms_message(phone, message)
    if ok:
        return {"success": True, "error": None, "provider_response": {"provider": "twilio", "sid": sid}}
    return {"success": False, "error": err or "Twilio SMS failed", "provider_response": {"provider": "twilio"}}


def _twilio_send_whatsapp(phone: str, message: str) -> dict[str, Any]:
    from schools.messaging import send_whatsapp_message

    ok, err, sid = send_whatsapp_message(phone, message)
    if ok:
        return {"success": True, "error": None, "provider_response": {"provider": "twilio", "sid": sid}}
    return {"success": False, "error": err or "Twilio WhatsApp failed", "provider_response": {"provider": "twilio"}}


def send_sms(phone: str, message: str) -> dict[str, Any]:
    """
    Send a plain SMS. Returns:
    { "success": bool, "error": str | None, "provider_response": dict | None }
    """
    provider = (os.getenv("MESSAGING_PROVIDER") or "mock").strip().lower()
    if not (phone or "").strip():
        return {"success": False, "error": "Phone number is empty.", "provider_response": None}
    if provider == "twilio":
        return _twilio_send_sms(phone, message)
    return _mock_send("sms", phone, message)


def send_whatsapp(phone: str, message: str) -> dict[str, Any]:
    """Send WhatsApp. Same return shape as send_sms."""
    provider = (os.getenv("MESSAGING_PROVIDER") or "mock").strip().lower()
    if not (phone or "").strip():
        return {"success": False, "error": "Phone number is empty.", "provider_response": None}
    if provider == "twilio":
        return _twilio_send_whatsapp(phone, message)
    return _mock_send("whatsapp", phone, message)
