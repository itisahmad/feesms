"""
Staff module access — each dashboard nav item is a module with granular permissions.
"""
from __future__ import annotations

from copy import deepcopy

from rest_framework.exceptions import PermissionDenied

PERMISSION_KEYS = ("view", "create", "edit", "delete", "actions")

MODULE_DEFINITIONS = [
    {"key": "dashboard", "label": "Dashboard", "path": "/dashboard"},
    {"key": "classes", "label": "Classes", "path": "/dashboard/classes"},
    {"key": "students", "label": "Students", "path": "/dashboard/students"},
    {"key": "enquiries", "label": "Enquiries", "path": "/dashboard/enquiries"},
    {"key": "fee_structure", "label": "Fee Structure", "path": "/dashboard/fee-structure"},
    {"key": "fee_collection", "label": "Fee Collection", "path": "/dashboard/fees"},
    {"key": "receipt_templates", "label": "Receipt Templates", "path": "/dashboard/receipt-templates"},
    {"key": "results", "label": "Results", "path": "/dashboard/results"},
    {"key": "announcements", "label": "Announcements", "path": "/dashboard/announcements"},
    {"key": "settings", "label": "Settings", "path": "/dashboard/settings"},
]

MODULE_KEYS = [m["key"] for m in MODULE_DEFINITIONS]

# Paths under fee collection (class detail shares fee_collection module)
FEE_COLLECTION_PATH_PREFIXES = ("/dashboard/fees",)

OWNER_ONLY_MODULE_KEYS = frozenset({"settings", "staff"})


def empty_permissions() -> dict:
    return {key: {perm: False for perm in PERMISSION_KEYS} for key in MODULE_KEYS}


def full_permissions() -> dict:
    return {key: {perm: True for perm in PERMISSION_KEYS} for key in MODULE_KEYS}


def is_owner(user) -> bool:
    return bool(user and getattr(user, "is_authenticated", False) and getattr(user, "role", None) == "owner")


def normalize_module_permissions(raw) -> dict:
    """Validate and merge stored JSON into the canonical permission shape."""
    base = empty_permissions()
    if not isinstance(raw, dict):
        return base
    for module_key in MODULE_KEYS:
        if module_key in OWNER_ONLY_MODULE_KEYS:
            continue
        mod = raw.get(module_key)
        if not isinstance(mod, dict):
            continue
        for perm in PERMISSION_KEYS:
            if perm in mod:
                base[module_key][perm] = bool(mod[perm])
    return base


def user_module_permissions(user) -> dict:
    if is_owner(user):
        return full_permissions()
    stored = getattr(user, "module_permissions", None) or {}
    return normalize_module_permissions(stored)


def has_module_permission(user, module_key: str, permission: str) -> bool:
    if is_owner(user):
        return True
    if module_key in OWNER_ONLY_MODULE_KEYS:
        return False
    if permission not in PERMISSION_KEYS:
        return False
    perms = user_module_permissions(user)
    mod = perms.get(module_key) or {}
    return bool(mod.get(permission))


def allowed_module_keys(user) -> list[str]:
    if is_owner(user):
        return [m["key"] for m in MODULE_DEFINITIONS]
    perms = user_module_permissions(user)
    return [key for key in MODULE_KEYS if key not in OWNER_ONLY_MODULE_KEYS and perms.get(key, {}).get("view")]


def viewset_action_to_permission(view_action: str, method: str) -> str:
    if view_action in ("list", "retrieve"):
        return "view"
    if view_action == "create":
        return "create"
    if view_action in ("update", "partial_update"):
        return "edit"
    if view_action == "destroy":
        return "delete"
    return "actions"


def assert_module_permission(user, module_key: str, permission: str) -> None:
    if not has_module_permission(user, module_key, permission):
        raise PermissionDenied(
            f"You do not have '{permission}' permission for the {module_key.replace('_', ' ')} module."
        )


def permissions_payload_for_user(user) -> dict:
    perms = user_module_permissions(user)
    return {
        "module_permissions": perms,
        "allowed_modules": allowed_module_keys(user),
        "is_owner": is_owner(user),
        "module_definitions": MODULE_DEFINITIONS,
        "permission_keys": list(PERMISSION_KEYS),
    }
