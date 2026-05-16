"""Reusable DRF mixins for school-scoped APIs."""
from rest_framework.exceptions import ValidationError


class SchoolScopedMixin:
    """Filter querysets and default creates to the authenticated user's school."""

    school_lookup = "school"
    school_required = True

    def get_user_school(self):
        return getattr(self.request.user, "school", None)

    def get_queryset(self):
        if hasattr(self, "queryset") and self.queryset is not None:
            qs = super().get_queryset()
        else:
            model = self.get_serializer_class().Meta.model
            qs = model._default_manager.all()
        school = self.get_user_school()
        if not school:
            return qs.none()
        if self.school_lookup:
            return qs.filter(**{self.school_lookup: school})
        return qs

    def perform_create(self, serializer):
        school = self.get_user_school()
        if self.school_required and not school:
            raise ValidationError("No school assigned to this user.")
        if self.school_lookup:
            serializer.save(**{self.school_lookup: school})
        else:
            serializer.save()


class SchoolNestedMixin(SchoolScopedMixin):
    """For models scoped via a related field (e.g. student__school)."""

    school_lookup = "student__school"
