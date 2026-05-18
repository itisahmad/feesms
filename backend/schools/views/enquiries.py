"""Admission enquiry CRUD for prospective students."""
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, viewsets

from ..permissions import HasModulePermission
from rest_framework.decorators import action
from rest_framework.response import Response

from ..mixins import SchoolScopedMixin
from ..models import AdmissionEnquiry
from ..serializers import AdmissionEnquirySerializer


class AdmissionEnquiryViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    serializer_class = AdmissionEnquirySerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    module_key = "enquiries"

    def get_queryset(self):
        qs = (
            super()
            .get_queryset()
            .select_related("school_class", "created_by")
            .order_by("follow_up_date", "-created_at")
        )
        params = self.request.query_params
        status = (params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        class_id = params.get("class") or params.get("school_class")
        if class_id:
            try:
                qs = qs.filter(school_class_id=int(class_id))
            except (TypeError, ValueError):
                pass
        search = (params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(phone__icontains=search)
                | Q(parent_name__icontains=search)
                | Q(notes__icontains=search)
            )
        if params.get("follow_up_due") == "today":
            today = timezone.localdate()
            qs = qs.filter(follow_up_date=today).exclude(
                status__in=[AdmissionEnquiry.STATUS_ADMITTED, AdmissionEnquiry.STATUS_LOST]
            )
        return qs

    def perform_create(self, serializer):
        school = self.get_user_school()
        serializer.save(school=school, created_by=self.request.user)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Counts by status and follow-ups due today."""
        school = request.user.school
        if not school:
            return Response({"error": "No school"}, status=400)
        qs = AdmissionEnquiry.objects.filter(school=school)
        today = timezone.localdate()
        by_status = {choice[0]: qs.filter(status=choice[0]).count() for choice in AdmissionEnquiry.STATUS_CHOICES}
        follow_up_today = qs.filter(follow_up_date=today).exclude(
            status__in=[AdmissionEnquiry.STATUS_ADMITTED, AdmissionEnquiry.STATUS_LOST]
        ).count()
        return Response(
            {
                "total": qs.count(),
                "by_status": by_status,
                "follow_up_today": follow_up_today,
            }
        )
