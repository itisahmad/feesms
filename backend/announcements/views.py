from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from schools.mixins import SchoolScopedMixin
from schools.module_permissions import assert_module_permission
from schools.permissions import HasModulePermission, IsSchoolMember

from .models import Announcement
from .serializers import (
    AnnouncementListSerializer,
    AnnouncementSerializer,
    RecipientPreviewSerializer,
)
from .services import send_announcement


class AnnouncementViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    queryset = Announcement.objects.select_related('created_by', 'school').prefetch_related(
        'deliveries',
        'group_deliveries',
    )
    permission_classes = [IsSchoolMember, HasModulePermission]
    module_key = 'announcements'

    def get_serializer_class(self):
        if self.action == 'list':
            return AnnouncementListSerializer
        return AnnouncementSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get('category')
        ann_status = self.request.query_params.get('status')
        if category:
            qs = qs.filter(category=category)
        if ann_status:
            qs = qs.filter(status=ann_status)
        return qs

    def perform_create(self, serializer):
        school = self.get_user_school()
        serializer.save(school=school, created_by=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.status == Announcement.STATUS_SENT:
            raise ValidationError('Sent announcements cannot be edited.')
        serializer.save()

    def perform_destroy(self, instance):
        if instance.status == Announcement.STATUS_SENT:
            raise ValidationError('Sent announcements cannot be deleted.')
        instance.delete()

    @action(detail=False, methods=['post'])
    def preview_recipients(self, request):
        assert_module_permission(request.user, 'announcements', 'view')
        serializer = RecipientPreviewSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        return Response(result)

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        assert_module_permission(request.user, 'announcements', 'actions')
        announcement = self.get_object()
        if announcement.status == Announcement.STATUS_SENT:
            return Response({'error': 'Already sent.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            stats = send_announcement(announcement)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        announcement.refresh_from_db()
        group_part = ''
        if stats.get('whatsapp_groups_targeted'):
            group_part = (
                f" Class WhatsApp groups: {stats['whatsapp_groups_posted']} posted, "
                f"{stats['whatsapp_groups_link_only']} via parent link, "
                f"{stats['whatsapp_groups_failed']} failed."
            )
        return Response({
            'message': (
                f"Sent to {stats['recipient_count']} parent(s). "
                f"SMS: {stats['sent_sms']}, WhatsApp: {stats['sent_whatsapp']}, "
                f"failures: {stats['failed_count']}."
                f"{group_part}"
            ),
            'announcement': AnnouncementSerializer(announcement, context={'request': request}).data,
        })
