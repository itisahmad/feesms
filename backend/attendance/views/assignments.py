from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from schools.mixins import SchoolScopedMixin
from schools.models import SchoolClass, Section, User
from schools.module_permissions import is_owner
from schools.permissions import HasModulePermission, IsSchoolOwner

from ..models import AttendanceSession, ClassTeacherAssignment
from ..serializers import BulkAssignmentSerializer, ClassTeacherAssignmentSerializer
from ..services.access import my_classes_payload, user_can_access_class


class ClassTeacherAssignmentViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    serializer_class = ClassTeacherAssignmentSerializer
    permission_classes = [IsAuthenticated, HasModulePermission]
    module_key = 'attendance'
    action_module_map = {
        'list': 'attendance',
        'retrieve': 'attendance',
        'create': 'attendance',
        'destroy': 'attendance',
        'bulk_set': 'attendance',
    }

    def get_queryset(self):
        school = self.get_user_school()
        if not school:
            return ClassTeacherAssignment.objects.none()
        qs = ClassTeacherAssignment.objects.filter(school=school).select_related(
            'staff_user', 'school_class', 'section',
        )
        staff_user = self.request.query_params.get('staff_user')
        if staff_user:
            qs = qs.filter(staff_user_id=staff_user)
        return qs.order_by('school_class__display_order', 'section__name')

    def perform_create(self, serializer):
        school = self.get_user_school()
        if not is_owner(self.request.user):
            raise PermissionDenied('Only the owner can assign classes.')
        staff = serializer.validated_data['staff_user']
        if staff.school_id != school.id or staff.role in ('owner', 'parent'):
            raise ValidationError({'staff_user': 'Invalid staff user.'})
        sc = serializer.validated_data['school_class']
        sec = serializer.validated_data['section']
        if sc.school_id != school.id or sec.school_class_id != sc.id:
            raise ValidationError('Class and section must belong to your school.')
        serializer.save(school=school, assigned_by=self.request.user)

    def perform_destroy(self, instance):
        if not is_owner(self.request.user):
            raise PermissionDenied('Only the owner can remove class assignments.')
        instance.delete()

    @action(detail=False, methods=['post'], url_path='bulk-set')
    def bulk_set(self, request):
        if not is_owner(request.user):
            raise PermissionDenied('Only the owner can assign classes.')
        school = self.get_user_school()
        ser = BulkAssignmentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        staff_id = ser.validated_data['staff_user_id']
        try:
            staff = User.objects.get(pk=staff_id, school=school)
        except User.DoesNotExist:
            raise ValidationError({'staff_user_id': 'Staff user not found.'})
        if staff.role in ('owner', 'parent'):
            raise ValidationError({'staff_user_id': 'Invalid staff user.'})

        ClassTeacherAssignment.objects.filter(staff_user=staff, school=school).delete()
        created = []
        for item in ser.validated_data['assignments']:
            sc_id = item.get('school_class_id') or item.get('school_class')
            sec_id = item.get('section_id') or item.get('section')
            if not sc_id or not sec_id:
                continue
            try:
                sc = SchoolClass.objects.get(pk=sc_id, school=school)
                sec = Section.objects.get(pk=sec_id, school_class=sc)
            except (SchoolClass.DoesNotExist, Section.DoesNotExist):
                continue
            obj = ClassTeacherAssignment.objects.create(
                school=school,
                staff_user=staff,
                school_class=sc,
                section=sec,
                assigned_by=request.user,
            )
            created.append(obj)
        out = ClassTeacherAssignmentSerializer(created, many=True)
        return Response({'assignments': out.data, 'count': len(created)})


class MyClassesView(APIView):
    permission_classes = [IsAuthenticated, HasModulePermission]
    module_key = 'attendance'

    def get(self, request):
        school = request.user.school
        if not school:
            return Response({'classes': []})
        return Response({'classes': my_classes_payload(request.user, school)})
