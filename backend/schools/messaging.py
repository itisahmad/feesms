"""Messaging helpers for SMS and WhatsApp reminders via Twilio."""

import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request


def normalize_phone(raw_phone: str) -> str:
    """Normalize phone to E.164-like format. Defaults 10-digit local numbers to +91."""
    raw_phone = (raw_phone or '').strip()
    if not raw_phone:
        return ''

    cleaned = ''.join(ch for ch in raw_phone if ch.isdigit() or ch == '+')
    if cleaned.startswith('00'):
        cleaned = '+' + cleaned[2:]

    if cleaned.startswith('+'):
        digits = ''.join(ch for ch in cleaned[1:] if ch.isdigit())
        return f'+{digits}' if digits else ''

    digits = ''.join(ch for ch in cleaned if ch.isdigit())
    if len(digits) == 10:
        return f'+91{digits}'
    return f'+{digits}' if digits else ''


def _twilio_post_message(from_number: str, to_number: str, body: str):
    account_sid = os.getenv('TWILIO_ACCOUNT_SID', '').strip()
    auth_token = os.getenv('TWILIO_AUTH_TOKEN', '').strip()
    if not account_sid or not auth_token:
        return False, 'Twilio credentials are missing (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN).', None

    endpoint = f'https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json'
    payload = urllib.parse.urlencode({
        'From': from_number,
        'To': to_number,
        'Body': body,
    }).encode('utf-8')

    req = urllib.request.Request(endpoint, data=payload, method='POST')
    token = base64.b64encode(f'{account_sid}:{auth_token}'.encode('utf-8')).decode('utf-8')
    req.add_header('Authorization', f'Basic {token}')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            content = resp.read().decode('utf-8') or '{}'
            data = json.loads(content)
            return True, None, data.get('sid')
    except urllib.error.HTTPError as exc:
        try:
            detail = exc.read().decode('utf-8')
        except Exception:
            detail = str(exc)
        return False, f'Twilio HTTP error: {detail}', None
    except Exception as exc:  # noqa: BLE001
        return False, f'Twilio request failed: {exc}', None


def send_sms_message(to_phone: str, body: str):
    """Send plain SMS using Twilio Programmable SMS."""
    sender = os.getenv('TWILIO_SMS_FROM', '').strip()
    if not sender:
        return False, 'TWILIO_SMS_FROM is not configured.', None

    to_number = normalize_phone(to_phone)
    from_number = normalize_phone(sender)
    if not to_number:
        return False, 'Invalid destination phone number.', None
    if not from_number:
        return False, 'Invalid TWILIO_SMS_FROM number.', None

    return _twilio_post_message(from_number, to_number, body)


def send_whatsapp_message(to_phone: str, body: str):
    """Send WhatsApp message using Twilio WhatsApp sender."""
    sender = os.getenv('TWILIO_WHATSAPP_FROM', '').strip()
    if not sender:
        return False, 'TWILIO_WHATSAPP_FROM is not configured.', None

    to_number = normalize_phone(to_phone)
    if not to_number:
        return False, 'Invalid destination phone number.', None

    sender_value = sender if sender.startswith('whatsapp:') else f'whatsapp:{normalize_phone(sender)}'
    if sender_value == 'whatsapp:':
        return False, 'Invalid TWILIO_WHATSAPP_FROM number.', None

    return _twilio_post_message(sender_value, f'whatsapp:{to_number}', body)
