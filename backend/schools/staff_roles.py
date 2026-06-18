"""Default staff role labels (no permissions — roles are for identification only)."""
from __future__ import annotations

import re


def slugify_role_name(name: str) -> str:
    base = re.sub(r'[^a-z0-9]+', '-', (name or '').lower()).strip('-')
    return base[:60] or 'role'


def make_unique_role_slug(school, name: str) -> str:
    from .models import SchoolStaffRole

    base = slugify_role_name(name)
    candidate = base
    suffix = 0
    while SchoolStaffRole.objects.filter(school=school, slug=candidate).exists():
        suffix += 1
        candidate = f'{base}-{suffix}'
    return candidate


def default_role_templates() -> list[dict]:
    return [
        {'name': 'Teacher', 'description': 'Staff who teach classes.'},
        {'name': 'Accountant', 'description': 'Staff who handle fees and accounts.'},
        {'name': 'General Staff', 'description': 'Other school staff.'},
    ]


def seed_default_staff_roles(school) -> list:
    from .models import SchoolStaffRole

    created = []
    for tpl in default_role_templates():
        slug = make_unique_role_slug(school, tpl['name'])
        role, was_created = SchoolStaffRole.objects.get_or_create(
            school=school,
            name=tpl['name'],
            defaults={
                'slug': slug,
                'description': tpl.get('description', ''),
                'module_permissions': {},
                'is_system': False,
            },
        )
        if was_created:
            created.append(role)
    return created
