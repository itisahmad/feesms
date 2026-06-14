"""School public code for parent login."""
from __future__ import annotations

import re

from .models import School


def slug_from_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "", (name or "").upper())
    return (cleaned[:10] or "SCHOOL")


def make_unique_public_code(school: School) -> str:
    base = slug_from_name(school.name)
    candidate = f"{base}-{school.id}"
    if not School.objects.filter(public_code=candidate).exclude(pk=school.pk).exists():
        return candidate
    suffix = 1
    while True:
        candidate = f"{base}-{school.id}-{suffix}"
        if not School.objects.filter(public_code=candidate).exclude(pk=school.pk).exists():
            return candidate
        suffix += 1


def ensure_school_public_code(school: School, *, save: bool = True) -> str:
    if school.public_code:
        return school.public_code
    school.public_code = make_unique_public_code(school)
    if save:
        school.save(update_fields=["public_code"])
    return school.public_code
