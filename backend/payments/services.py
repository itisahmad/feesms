import hashlib
import hmac
import json
import os
import urllib.error
import urllib.request
from decimal import Decimal


RAZORPAY_API_BASE = "https://api.razorpay.com/v1"


def _get_auth_header() -> str:
    key_id = os.getenv("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    if not key_id or not key_secret:
        raise ValueError("Razorpay credentials are missing.")
    token = f"{key_id}:{key_secret}".encode("utf-8")
    import base64
    return "Basic " + base64.b64encode(token).decode("utf-8")


def _post(path: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{RAZORPAY_API_BASE}{path}",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": _get_auth_header(),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read().decode("utf-8")
            return json.loads(data or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise ValueError(f"Razorpay HTTP error: {detail}") from exc


def to_paise(amount: Decimal) -> int:
    return int((amount * 100).quantize(Decimal("1")))


def create_order(amount: Decimal, receipt: str, notes: dict | None = None, transfers: list | None = None) -> dict:
    payload = {
        "amount": to_paise(amount),
        "currency": "INR",
        "receipt": receipt[:40],
        "notes": notes or {},
    }
    if transfers:
        payload["transfers"] = transfers
    return _post("/orders", payload)


def verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    if not secret:
        raise ValueError("RAZORPAY_KEY_SECRET is missing.")
    expected = hmac.new(
        secret.encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
