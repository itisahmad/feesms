"""Login identifier resolution and owner username generation."""
from __future__ import annotations

import re

from django.contrib.auth import get_user_model

User = get_user_model()


def make_unique_username_for_email(email: str) -> str:
    """Internal Django username for owners (not used at login)."""
    local = (email or "").split("@")[0].lower()
    base = re.sub(r"[^a-z0-9._-]", "", local)[:30] or "owner"
    candidate = base
    suffix = 0
    while User.objects.filter(username=candidate).exists():
        suffix += 1
        candidate = f"{base}_{suffix}"
    return candidate


def resolve_user_for_login(login: str, password: str):
    """
    Owners sign in with email; staff/accountant sign in with username.
    Returns (user, error_message).
    """
    from django.contrib.auth.hashers import check_password

    login = (login or "").strip()
    password = password or ""
    if not login or not password:
        return None, "Email/username and password are required."

    if "@" in login:
        user = User.objects.filter(email__iexact=login).first()
        if not user:
            return None, "Invalid email or password."
        if user.role != "owner":
            return None, "Staff accounts must sign in with school code and username on the staff login page."
    else:
        return None, "School owners must sign in with email. Staff use the staff login page with school code."

    if not user.is_active:
        return None, "This account is disabled."

    if not check_password(password, user.password):
        return None, ("Invalid email or password." if "@" in login else "Invalid username or password.")

    if user.role == "parent":
        return None, "Parents must sign in with school code at the parent portal."

    return user, None
