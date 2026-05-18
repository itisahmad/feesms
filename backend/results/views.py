from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from schools.models import Student
from schools.mixins import SchoolScopedMixin
from schools.module_permissions import has_module_permission, is_owner
from schools.permissions import HasModulePermission, IsSchoolMember

from .models import ExamResult
from .grading import get_or_create_grading_settings, recalculate_draft_exam_grades
from .serializers import (
    BulkMarksSerializer,
    ExamResultListSerializer,
    ExamResultSerializer,
    SchoolGradingSettingsSerializer,
)
from .services import (
    build_marksheet_payload,
    bulk_save_marks,
    initialize_exam_marks,
    list_student_published_results,
    student_result_card,
)


def _assert_results_edit(user):
    if is_owner(user):
        return
    if not has_module_permission(user, 'results', 'edit'):
        raise PermissionDenied('You do not have permission to edit grading rules.')


class SchoolGradingSettingsView(APIView):
    permission_classes = [IsSchoolMember, HasModulePermission]
    module_key = 'results'

    def get(self, request):
        school = request.user.school
        settings = get_or_create_grading_settings(school)
        return Response(SchoolGradingSettingsSerializer(settings).data)

    def patch(self, request):
        _assert_results_edit(request.user)
        school = request.user.school
        settings = get_or_create_grading_settings(school)
        serializer = SchoolGradingSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        recalculate = request.data.get('recalculate_draft', True)
        marks_updated = 0
        if recalculate:
            marks_updated = recalculate_draft_exam_grades(school)
        return Response({
            **SchoolGradingSettingsSerializer(settings).data,
            'marks_recalculated': marks_updated,
        })


class StudentPublishedResultsView(APIView):
    """Published exam result summaries for one student."""

    permission_classes = [IsSchoolMember, HasModulePermission]
    module_key = 'results'

    def get(self, request, student_id):
        student = get_object_or_404(Student, pk=student_id, school=request.user.school)
        return Response({
            'student_id': student.id,
            'student_name': student.name,
            'class_name': student.get_class_display(),
            'results': list_student_published_results(student),
        })


class ExamResultViewSet(SchoolScopedMixin, viewsets.ModelViewSet):
    queryset = ExamResult.objects.all()
    permission_classes = [IsSchoolMember, HasModulePermission]
    module_key = 'results'

    def get_serializer_class(self):
        if self.action == 'list':
            return ExamResultListSerializer
        return ExamResultSerializer

    def get_queryset(self):
        qs = super().get_queryset().select_related('school_class').prefetch_related('marks')
        class_id = self.request.query_params.get('school_class')
        if class_id:
            qs = qs.filter(school_class_id=class_id)
        status_filter = self.request.query_params.get('status')
        if status_filter in (ExamResult.STATUS_DRAFT, ExamResult.STATUS_PUBLISHED):
            qs = qs.filter(status=status_filter)
        return qs.order_by('-created_at')

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['school'] = self.get_user_school()
        return ctx

    def perform_create(self, serializer):
        exam = serializer.save(school=self.get_user_school())
        initialize_exam_marks(exam)

    @action(detail=True, methods=['get'])
    def marksheet(self, request, pk=None):
        exam = self.get_object()
        payload = build_marksheet_payload(exam)
        serializer = ExamResultSerializer(exam, context=self.get_serializer_context())
        return Response({
            'exam': serializer.data,
            **payload,
        })

    @action(detail=True, methods=['post'])
    def initialize_marks(self, request, pk=None):
        exam = self.get_object()
        created = initialize_exam_marks(exam)
        return Response({'created': created, 'message': f'Initialized {created} mark entries.'})

    @action(detail=True, methods=['post'])
    def save_marks(self, request, pk=None):
        exam = self.get_object()
        if exam.status == ExamResult.STATUS_PUBLISHED:
            return Response(
                {'error': 'Cannot edit marks on a published result. Reopen as draft first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ser = BulkMarksSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        updated = bulk_save_marks(exam, ser.validated_data['marks'])
        return Response({'updated': updated})

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        exam = self.get_object()
        exam.status = ExamResult.STATUS_PUBLISHED
        exam.save(update_fields=['status', 'updated_at'])
        return Response(ExamResultSerializer(exam, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'])
    def unpublish(self, request, pk=None):
        exam = self.get_object()
        exam.status = ExamResult.STATUS_DRAFT
        exam.save(update_fields=['status', 'updated_at'])
        return Response(ExamResultSerializer(exam, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['get'])
    def student_report(self, request, pk=None):
        exam = self.get_object()
        student_id = request.query_params.get('student_id')
        if not student_id:
            return Response({'student_id': 'Required.'}, status=status.HTTP_400_BAD_REQUEST)
        student = get_object_or_404(
            Student,
            pk=student_id,
            school=exam.school,
            school_class=exam.school_class,
        )
        if exam.status != ExamResult.STATUS_PUBLISHED:
            if not is_owner(request.user) and not has_module_permission(request.user, 'results', 'edit'):
                return Response(
                    {'error': 'This exam is not published yet.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        return Response(student_result_card(exam, student))
