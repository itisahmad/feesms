"""Staff portal authentication helpers."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password

from .parent_auth import resolve_school_by_public_code

User = get_user_model()

STAFF_ROLES = ('staff', 'accountant')


def resolve_staff_for_login(school_code: str, username: str, password: str):
    """
    Returns (user, error_message) for staff/accountant login.
    School is resolved by public_code; username is scoped to that school.
    """
    password = password or ""
    school = resolve_school_by_public_code(school_code)
    if not school:
        return None, "Invalid school code."

    login_name = (username or "").strip()
    if not login_name or not password:
        return None, "School code, username, and password are required."
    if "@" in login_name:
        return None, "Enter your staff username, not an email address."

    user = User.objects.filter(
        school=school,
        username__iexact=login_name,
        role__in=STAFF_ROLES,
    ).first()
    if not user:
        return None, "Invalid school code, username, or password."
    if not user.is_active:
        return None, "This account is disabled."
    if not check_password(password, user.password):
        return None, "Invalid school code, username, or password."

    return user, None
