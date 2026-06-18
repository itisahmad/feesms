"""Attendance access and marking helpers."""
from __future__ import annotations

from django.utils import timezone

from schools.models import Student
from schools.module_permissions import is_owner

from ..models import AttendanceRecord, AttendanceSession, ClassTeacherAssignment


def user_has_class_assignments(user) -> bool:
    return ClassTeacherAssignment.objects.filter(staff_user=user).exists()


def user_can_access_class(user, school_class_id: int, section_id: int) -> bool:
    if is_owner(user):
        return True
    if user_has_class_assignments(user):
        return ClassTeacherAssignment.objects.filter(
            staff_user=user,
            school_class_id=school_class_id,
            section_id=section_id,
        ).exists()
    return True


def accessible_assignments(user, school):
    qs = ClassTeacherAssignment.objects.filter(school=school).select_related(
        'school_class', 'section', 'staff_user',
    )
    if is_owner(user):
        return qs
    if user_has_class_assignments(user):
        return qs.filter(staff_user=user)
    if school:
        from schools.models import SchoolClass, Section
        pairs = []
        for sc in SchoolClass.objects.filter(school=school).prefetch_related('sections'):
            for sec in sc.sections.all():
                pairs.append({'school_class': sc, 'section': sec, 'staff_user_id': None})
        return pairs
    return qs.none()


def my_classes_payload(user, school) -> list[dict]:
    if is_owner(user) or not user_has_class_assignments(user):
        from schools.models import SchoolClass
        out = []
        for sc in SchoolClass.objects.filter(school=school).prefetch_related('sections').order_by('display_order', 'name'):
            for sec in sc.sections.all().order_by('display_order', 'name'):
                out.append({
                    'school_class_id': sc.id,
                    'school_class_name': sc.name,
                    'section_id': sec.id,
                    'section_name': sec.name,
                    'label': f'{sc.name} · Section {sec.name}',
                })
        return out
    rows = ClassTeacherAssignment.objects.filter(staff_user=user, school=school).select_related('school_class', 'section')
    return [
        {
            'school_class_id': r.school_class_id,
            'school_class_name': r.school_class.name,
            'section_id': r.section_id,
            'section_name': r.section.name,
            'label': f'{r.school_class.name} · Section {r.section.name}',
        }
        for r in rows
    ]


def get_or_create_session(*, school, school_class, section, date, user) -> AttendanceSession:
    session, created = AttendanceSession.objects.get_or_create(
        school=school,
        school_class=school_class,
        section=section,
        date=date,
        defaults={'marked_by': user},
    )
    if created:
        students = Student.objects.filter(
            school=school,
            school_class=school_class,
            section=section,
            is_active=True,
        ).order_by('roll_number', 'name')
        AttendanceRecord.objects.bulk_create([
            AttendanceRecord(session=session, student=s, status=AttendanceRecord.STATUS_PRESENT)
            for s in students
        ])
    return session


def update_session_records(session: AttendanceSession, records_data: list[dict], user) -> AttendanceSession:
    if session.status == AttendanceSession.STATUS_FINALIZED:
        raise ValueError('Session is finalized.')
    for item in records_data:
        student_id = item.get('student_id')
        status = item.get('status')
        remark = item.get('remark', '')
        if not student_id or not status:
            continue
        AttendanceRecord.objects.filter(session=session, student_id=student_id).update(
            status=status,
            remark=remark or '',
        )
    session.marked_by = user
    session.save(update_fields=['marked_by', 'updated_at'])
    return session


def finalize_session(session: AttendanceSession, user) -> AttendanceSession:
    session.status = AttendanceSession.STATUS_FINALIZED
    session.finalized_at = timezone.now()
    session.marked_by = user
    session.save(update_fields=['status', 'finalized_at', 'marked_by', 'updated_at'])
    return session


def reopen_session(session: AttendanceSession, user) -> AttendanceSession:
    session.status = AttendanceSession.STATUS_DRAFT
    session.finalized_at = None
    session.marked_by = user
    session.save(update_fields=['status', 'finalized_at', 'marked_by', 'updated_at'])
    return session


def mark_all_present(session: AttendanceSession, user) -> AttendanceSession:
    if session.status == AttendanceSession.STATUS_FINALIZED:
        raise ValueError('Session is finalized.')
    session.records.update(status=AttendanceRecord.STATUS_PRESENT, remark='')
    session.marked_by = user
    session.save(update_fields=['marked_by', 'updated_at'])
    return session
