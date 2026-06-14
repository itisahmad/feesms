"""Parent portal authentication helpers."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password

from .models import School, Student
from .phone_otp import normalize_parent_phone

User = get_user_model()


def resolve_school_by_public_code(code: str) -> School | None:
    code = (code or "").strip()
    if not code:
        return None
    return School.objects.filter(public_code__iexact=code).first()


def make_parent_username(school_id: int, phone: str) -> str:
    return f"parent_{school_id}_{phone}"


def parent_phone_linked_to_students(school: School, phone: str) -> bool:
    return Student.objects.filter(school=school, parent_phone=phone, is_active=True).exists()


def get_parent_child_or_none(user, student_id: int) -> Student | None:
    """Return linked active student for parent, or None (caller should respond 404)."""
    if not user or getattr(user, "role", None) != "parent" or not user.school_id:
        return None
    phone = (getattr(user, "phone", None) or "").strip()
    if not phone:
        return None
    return (
        Student.objects.filter(
            pk=student_id,
            school_id=user.school_id,
            parent_phone=phone,
            is_active=True,
        )
        .select_related("school_class", "section")
        .first()
    )


def resolve_parent_for_login(school_code: str, raw_phone: str, password: str):
    """
    Returns (user, error_message) for parent login.
    """
    password = password or ""
    school = resolve_school_by_public_code(school_code)
    if not school:
        return None, "Invalid school code."

    try:
        phone = normalize_parent_phone(raw_phone)
    except Exception as exc:
        return None, getattr(exc, "message", str(exc))

    if not password:
        return None, "School code, phone, and password are required."

    user = User.objects.filter(school=school, role="parent", phone=phone).first()
    if not user:
        return None, "No parent account found. Register first with OTP."
    if not user.is_active:
        return None, "This account is disabled."
    if not check_password(password, user.password):
        return None, "Invalid school code, phone, or password."

    return user, None
