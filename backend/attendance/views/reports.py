import csv
from datetime import date

from django.http import HttpResponse
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from schools.mixins import SchoolScopedMixin
from schools.models import Student
from schools.permissions import HasModulePermission

from ..models import AttendanceRecord
from ..services.summary import (
    attendance_export_rows,
    class_attendance_report,
    default_report_range,
    parse_date_param,
    student_attendance_report,
    user_can_access_student_class,
)


class ClassReportView(SchoolScopedMixin, APIView):
    permission_classes = [IsAuthenticated, HasModulePermission]
    module_key = 'attendance'

    def get(self, request):
        school = self.get_user_school()
        if not school:
            return Response({'classes': []})
        default_start, default_end = default_report_range()
        start_date = parse_date_param(request.query_params.get('start_date'), default_start)
        end_date = parse_date_param(request.query_params.get('end_date'), default_end)
        if start_date > end_date:
            raise ValidationError({'end_date': 'End date must be on or after start date.'})

        school_class_id = request.query_params.get('school_class')
        section_id = request.query_params.get('section')
        status = request.query_params.get('status')
        if status and status not in dict(AttendanceRecord.STATUS_CHOICES):
            raise ValidationError({'status': 'Invalid status.'})

        data = class_attendance_report(
            school=school,
            user=request.user,
            start_date=start_date,
            end_date=end_date,
            school_class_id=int(school_class_id) if school_class_id else None,
            section_id=int(section_id) if section_id else None,
            status=status or None,
        )
        return Response(data)


class StudentReportView(SchoolScopedMixin, APIView):
    permission_classes = [IsAuthenticated, HasModulePermission]
    module_key = 'attendance'

    def get(self, request, student_id: int):
        school = self.get_user_school()
        if not school:
            raise NotFound
        try:
            student = Student.objects.get(pk=student_id, school=school)
        except Student.DoesNotExist:
            raise NotFound

        default_start, default_end = default_report_range()
        start_date = parse_date_param(request.query_params.get('start_date'), default_start)
        end_date = parse_date_param(request.query_params.get('end_date'), default_end)
        status = request.query_params.get('status')
        if status and status not in dict(AttendanceRecord.STATUS_CHOICES):
            raise ValidationError({'status': 'Invalid status.'})

        if not user_can_access_student_class(request.user, student.school_class_id, student.section_id):
            raise PermissionDenied('You cannot view this student\'s attendance.')

        data = student_attendance_report(
            student=student,
            user=request.user,
            start_date=start_date,
            end_date=end_date,
            status=status or None,
        )
        return Response(data)


class ExportReportView(SchoolScopedMixin, APIView):
    permission_classes = [IsAuthenticated, HasModulePermission]
    module_key = 'attendance'

    def get(self, request):
        school = self.get_user_school()
        if not school:
            return HttpResponse('', content_type='text/csv')

        default_start, default_end = default_report_range()
        start_date = parse_date_param(request.query_params.get('start_date'), default_start)
        end_date = parse_date_param(request.query_params.get('end_date'), default_end)
        school_class_id = request.query_params.get('school_class')
        section_id = request.query_params.get('section')
        status = request.query_params.get('status')

        rows = attendance_export_rows(
            school=school,
            user=request.user,
            start_date=start_date,
            end_date=end_date,
            school_class_id=int(school_class_id) if school_class_id else None,
            section_id=int(section_id) if section_id else None,
            status=status or None,
        )

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = (
            f'attachment; filename="attendance-{start_date}-to-{end_date}.csv"'
        )
        writer = csv.writer(response)
        writer.writerow(['Date', 'Class', 'Section', 'Roll No', 'Student', 'Status', 'Remark'])
        for row in rows:
            writer.writerow([
                row['date'],
                row['class_name'],
                row['section_name'],
                row['roll_number'],
                row['student_name'],
                row['status'],
                row['remark'],
            ])
        return response
