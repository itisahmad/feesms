from django.utils import timezone

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from schools.mixins import SchoolScopedMixin
from schools.models import SchoolClass, Section
from schools.module_permissions import has_module_permission, is_owner
from schools.permissions import HasModulePermission

from ..models import AttendanceSession
from ..serializers import (
    AttendanceSessionListSerializer,
    AttendanceSessionSerializer,
    CreateSessionSerializer,
    UpdateRecordsSerializer,
)
from ..services.access import (
    finalize_session,
    get_or_create_session,
    mark_all_present,
    reopen_session,
    update_session_records,
    user_can_access_class,
)


class AttendanceSessionViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasModulePermission]
    module_key = 'attendance'
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        school = self.get_user_school()
        if not school:
            return AttendanceSession.objects.none()
        qs = AttendanceSession.objects.filter(school=school).select_related(
            'school_class', 'section', 'marked_by',
        ).prefetch_related('records__student')
        date = self.request.query_params.get('date')
        school_class = self.request.query_params.get('school_class')
        section = self.request.query_params.get('section')
        if date:
            qs = qs.filter(date=date)
        if school_class:
            qs = qs.filter(school_class_id=school_class)
        if section:
            qs = qs.filter(section_id=section)
        if not is_owner(self.request.user):
            from ..models import ClassTeacherAssignment
            if ClassTeacherAssignment.objects.filter(staff_user=self.request.user).exists():
                pairs = ClassTeacherAssignment.objects.filter(
                    staff_user=self.request.user,
                ).values_list('school_class_id', 'section_id')
                from django.db.models import Q
                cond = Q()
                for sc_id, sec_id in pairs:
                    cond |= Q(school_class_id=sc_id, section_id=sec_id)
                qs = qs.filter(cond)
        return qs.order_by('-date', 'school_class__display_order')

    def get_serializer_class(self):
        if self.action == 'list':
            return AttendanceSessionListSerializer
        return AttendanceSessionSerializer

    def _check_class_access(self, user, school_class_id, section_id):
        if not user_can_access_class(user, school_class_id, section_id):
            raise PermissionDenied('You are not assigned to this class.')

    def create(self, request, *args, **kwargs):
        if not has_module_permission(request.user, 'attendance', 'create') and not is_owner(request.user):
            raise PermissionDenied()
        school = self.get_user_school()
        ser = CreateSessionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        sc_id = ser.validated_data['school_class']
        sec_id = ser.validated_data['section']
        date = ser.validated_data['date']
        try:
            sc = SchoolClass.objects.get(pk=sc_id, school=school)
            sec = Section.objects.get(pk=sec_id, school_class=sc)
        except (SchoolClass.DoesNotExist, Section.DoesNotExist):
            raise ValidationError('Invalid class or section.')
        self._check_class_access(request.user, sc.id, sec.id)
        session = get_or_create_session(
            school=school,
            school_class=sc,
            section=sec,
            date=date,
            user=request.user,
        )
        return Response(
            AttendanceSessionSerializer(session).data,
            status=status.HTTP_201_CREATED if session else status.HTTP_200_OK,
        )

    def retrieve(self, request, *args, **kwargs):
        session = self.get_object()
        self._check_class_access(request.user, session.school_class_id, session.section_id)
        return Response(AttendanceSessionSerializer(session).data)

    def partial_update(self, request, *args, **kwargs):
        session = self.get_object()
        self._check_class_access(request.user, session.school_class_id, session.section_id)
        if session.status == AttendanceSession.STATUS_FINALIZED:
            if not (is_owner(request.user) or has_module_permission(request.user, 'attendance', 'actions')):
                raise PermissionDenied('Session is finalized.')
        if not has_module_permission(request.user, 'attendance', 'edit') and not is_owner(request.user):
            raise PermissionDenied()
        ser = UpdateRecordsSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            update_session_records(session, ser.validated_data.get('records', []), request.user)
        except ValueError as exc:
            raise ValidationError(str(exc))
        if 'notes' in ser.validated_data:
            session.notes = ser.validated_data['notes']
            session.save(update_fields=['notes', 'updated_at'])
        session.refresh_from_db()
        return Response(AttendanceSessionSerializer(session).data)

    @action(detail=True, methods=['post'])
    def finalize(self, request, pk=None):
        session = self.get_object()
        self._check_class_access(request.user, session.school_class_id, session.section_id)
        if not (is_owner(request.user) or has_module_permission(request.user, 'attendance', 'actions')):
            raise PermissionDenied()
        finalize_session(session, request.user)
        return Response(AttendanceSessionSerializer(session).data)

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        session = self.get_object()
        if not (is_owner(request.user) or has_module_permission(request.user, 'attendance', 'actions')):
            raise PermissionDenied()
        reopen_session(session, request.user)
        return Response(AttendanceSessionSerializer(session).data)

    @action(detail=True, methods=['post'], url_path='mark-all-present')
    def mark_all_present(self, request, pk=None):
        session = self.get_object()
        self._check_class_access(request.user, session.school_class_id, session.section_id)
        if not has_module_permission(request.user, 'attendance', 'edit') and not is_owner(request.user):
            raise PermissionDenied()
        try:
            mark_all_present(session, request.user)
        except ValueError as exc:
            raise ValidationError(str(exc))
        return Response(AttendanceSessionSerializer(session).data)

    @action(detail=False, methods=['get'], url_path='today-summary')
    def today_summary(self, request):
        school = self.get_user_school()
        today = timezone.localdate()
        qs = self.get_queryset().filter(date=today)
        total_present = 0
        total_absent = 0
        for s in qs:
            total_present += s.records.filter(status='present').count()
            total_absent += s.records.exclude(status='present').count()
        return Response({
            'date': str(today),
            'sessions_count': qs.count(),
            'present': total_present,
            'absent': total_absent,
        })
