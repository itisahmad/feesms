"""Role-based permissions for school APIs."""
from rest_framework.permissions import BasePermission

from .module_permissions import has_module_permission, is_owner, viewset_action_to_permission


class IsSchoolOwner(BasePermission):
    message = "Only the school owner can perform this action."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == "owner" and user.school_id)


class IsSchoolMember(BasePermission):
    """Authenticated user with a school assigned."""

    message = "You must belong to a school."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.school_id)


class HasModulePermission(BasePermission):
    """
    Enforce staff module_permissions on viewsets that set `module_key`.
    Owners bypass checks.
    """

    message = "You do not have permission for this module."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if is_owner(user):
            return True
        action = getattr(view, "action", None)
        action_map = getattr(view, "action_module_map", None) or {}
        module_key = action_map.get(action) if action else None
        if not module_key:
            module_key = getattr(view, "module_key", None)
        if not module_key:
            return True
        if not action:
            return has_module_permission(user, module_key, "view")
        perm = viewset_action_to_permission(action, request.method)
        return has_module_permission(user, module_key, perm)
