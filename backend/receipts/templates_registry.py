"""Prebuilt receipt template catalog (not stored per row in DB)."""

TEMPLATE_CATALOG = [
    {
        'key': 'classic',
        'name': 'Classic School Receipt',
        'description': 'Traditional bordered layout with centered header — ideal for most schools.',
        'supports_a4': True,
        'supports_thermal': True,
    },
    {
        'key': 'modern_minimal',
        'name': 'Modern Minimal Receipt',
        'description': 'Clean typography, subtle dividers, and accent color highlights.',
        'supports_a4': True,
        'supports_thermal': True,
    },
    {
        'key': 'government',
        'name': 'Government Style Receipt',
        'description': 'Formal grid layout with reference numbers — suited for audits.',
        'supports_a4': True,
        'supports_thermal': False,
    },
    {
        'key': 'thermal',
        'name': 'Thermal Printer Receipt',
        'description': 'Compact narrow layout optimized for 80mm thermal rolls.',
        'supports_a4': False,
        'supports_thermal': True,
    },
    {
        'key': 'premium',
        'name': 'Premium Private School Receipt',
        'description': 'Elegant header band, logo prominence, and signature block.',
        'supports_a4': True,
        'supports_thermal': True,
    },
]

DEFAULT_TEMPLATE_KEY = 'classic'

TEMPLATE_KEYS = {t['key'] for t in TEMPLATE_CATALOG}


def get_template_meta(key: str) -> dict | None:
    for t in TEMPLATE_CATALOG:
        if t['key'] == key:
            return t
    return None
