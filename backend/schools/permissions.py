"""Role-based permissions for school APIs."""
from rest_framework.permissions import BasePermission


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
