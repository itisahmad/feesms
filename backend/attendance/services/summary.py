"""Attendance aggregates for reports and parent summaries."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Iterable

from django.db.models import Q
from django.utils import timezone

from schools.module_permissions import is_owner

from ..models import AttendanceRecord, AttendanceSession, ClassTeacherAssignment

PRESENT_STATUSES = {
    AttendanceRecord.STATUS_PRESENT,
    AttendanceRecord.STATUS_LATE,
}


def attendance_weight(status: str) -> float:
    if status in (AttendanceRecord.STATUS_PRESENT, AttendanceRecord.STATUS_LATE):
        return 1.0
    if status == AttendanceRecord.STATUS_HALF_DAY:
        return 0.5
    return 0.0


def parse_date_param(value: str | None, default: date) -> date:
    if not value:
        return default
    try:
        return date.fromisoformat(value)
    except ValueError:
        return default


def default_report_range() -> tuple[date, date]:
    today = timezone.localdate()
    start = today.replace(day=1)
    return start, today


def filter_sessions_for_user(qs, user):
    if is_owner(user):
        return qs
    if ClassTeacherAssignment.objects.filter(staff_user=user).exists():
        pairs = ClassTeacherAssignment.objects.filter(staff_user=user).values_list(
            'school_class_id', 'section_id',
        )
        cond = Q()
        for sc_id, sec_id in pairs:
            cond |= Q(school_class_id=sc_id, section_id=sec_id)
        return qs.filter(cond)
    return qs


def sessions_queryset(
    *,
    school,
    user,
    start_date: date,
    end_date: date,
    school_class_id: int | None = None,
    section_id: int | None = None,
):
    qs = AttendanceSession.objects.filter(
        school=school,
        date__gte=start_date,
        date__lte=end_date,
    ).select_related('school_class', 'section')
    if school_class_id:
        qs = qs.filter(school_class_id=school_class_id)
    if section_id:
        qs = qs.filter(section_id=section_id)
    return filter_sessions_for_user(qs, user).order_by('date', 'school_class__display_order')


def records_for_sessions(session_ids: Iterable[int], status: str | None = None):
    qs = AttendanceRecord.objects.filter(session_id__in=session_ids).select_related(
        'student', 'session', 'session__school_class', 'session__section',
    )
    if status:
        qs = qs.filter(status=status)
    return qs


def _student_tally() -> dict:
    return {
        'present': 0,
        'absent': 0,
        'late': 0,
        'leave': 0,
        'half_day': 0,
        'weighted_days': 0.0,
        'session_days': 0,
    }


def class_attendance_report(
    *,
    school,
    user,
    start_date: date,
    end_date: date,
    school_class_id: int | None = None,
    section_id: int | None = None,
    status: str | None = None,
) -> dict:
    sessions = list(sessions_queryset(
        school=school,
        user=user,
        start_date=start_date,
        end_date=end_date,
        school_class_id=school_class_id,
        section_id=section_id,
    ))
    session_ids = [s.id for s in sessions]
    records = list(records_for_sessions(session_ids, status=status))

    by_class: dict[tuple[int, int], dict] = {}
    for session in sessions:
        key = (session.school_class_id, session.section_id)
        if key not in by_class:
            by_class[key] = {
                'school_class_id': session.school_class_id,
                'school_class_name': session.school_class.name,
                'section_id': session.section_id,
                'section_name': session.section.name,
                'label': f'{session.school_class.name} · Section {session.section.name}',
                'session_days': 0,
                'session_dates': set(),
                'status_totals': defaultdict(int),
                'students': {},
            }
        bucket = by_class[key]
        bucket['session_days'] += 1
        bucket['session_dates'].add(session.date)

    session_dates_by_class: dict[tuple[int, int], set] = {
        key: data['session_dates'] for key, data in by_class.items()
    }

    for rec in records:
        key = (rec.session.school_class_id, rec.session.section_id)
        bucket = by_class.get(key)
        if not bucket:
            continue
        bucket['status_totals'][rec.status] += 1
        sid = rec.student_id
        if sid not in bucket['students']:
            bucket['students'][sid] = {
                'student_id': sid,
                'name': rec.student.name,
                'roll_number': rec.student.roll_number or '',
                **_student_tally(),
            }
        st = bucket['students'][sid]
        st['session_days'] += 1
        st[rec.status] = st.get(rec.status, 0) + 1
        st['weighted_days'] += attendance_weight(rec.status)

    classes_out = []
    for key, bucket in sorted(by_class.items(), key=lambda x: (x[1]['school_class_name'], x[1]['section_name'])):
        session_day_count = len(session_dates_by_class.get(key, set())) or bucket['session_days']
        students_out = []
        total_pct = 0.0
        for st in sorted(bucket['students'].values(), key=lambda s: (s['roll_number'], s['name'])):
            denom = session_day_count or 1
            presence_pct = round(st['weighted_days'] / denom * 100, 1)
            st['presence_pct'] = presence_pct
            students_out.append(st)
            total_pct += presence_pct
        avg_pct = round(total_pct / len(students_out), 1) if students_out else 0.0
        classes_out.append({
            'school_class_id': bucket['school_class_id'],
            'school_class_name': bucket['school_class_name'],
            'section_id': bucket['section_id'],
            'section_name': bucket['section_name'],
            'label': bucket['label'],
            'session_days': session_day_count,
            'student_count': len(students_out),
            'average_presence_pct': avg_pct,
            'status_totals': dict(bucket['status_totals']),
            'students': students_out,
        })

    return {
        'start_date': str(start_date),
        'end_date': str(end_date),
        'classes': classes_out,
    }


def student_attendance_report(
    *,
    student,
    user,
    start_date: date,
    end_date: date,
    status: str | None = None,
) -> dict:
    school = student.school
    if not user_can_access_student_class(user, student.school_class_id, student.section_id):
        return None

    sessions = sessions_queryset(
        school=school,
        user=user,
        start_date=start_date,
        end_date=end_date,
        school_class_id=student.school_class_id,
        section_id=student.section_id,
    )
    session_ids = list(sessions.values_list('id', flat=True))
    records = records_for_sessions(session_ids, status=status).filter(student=student).order_by('-session__date')

    tally = _student_tally()
    history = []
    for rec in records:
        tally['session_days'] += 1
        tally[rec.status] = tally.get(rec.status, 0) + 1
        tally['weighted_days'] += attendance_weight(rec.status)
        history.append({
            'date': str(rec.session.date),
            'status': rec.status,
            'class_name': rec.session.school_class.name,
            'section_name': rec.session.section.name,
            'remark': rec.remark or '',
        })

    denom = tally['session_days'] or 1
    presence_pct = round(tally['weighted_days'] / denom * 100, 1)

    return {
        'student': {
            'id': student.id,
            'name': student.name,
            'roll_number': student.roll_number or '',
            'class_name': student.get_class_display(),
            'section_name': student.section.name if student.section_id else '',
        },
        'start_date': str(start_date),
        'end_date': str(end_date),
        'summary': {
            'session_days': tally['session_days'],
            'present_days': tally['present'],
            'absent_days': tally['absent'],
            'late_days': tally['late'],
            'leave_days': tally['leave'],
            'half_day_days': tally['half_day'],
            'presence_pct': presence_pct,
        },
        'records': history,
    }


def user_can_access_student_class(user, school_class_id: int | None, section_id: int | None) -> bool:
    if is_owner(user):
        return True
    if not school_class_id or not section_id:
        return True
    if ClassTeacherAssignment.objects.filter(staff_user=user).exists():
        return ClassTeacherAssignment.objects.filter(
            staff_user=user,
            school_class_id=school_class_id,
            section_id=section_id,
        ).exists()
    return True


def attendance_export_rows(
    *,
    school,
    user,
    start_date: date,
    end_date: date,
    school_class_id: int | None = None,
    section_id: int | None = None,
    status: str | None = None,
) -> list[dict]:
    sessions = list(sessions_queryset(
        school=school,
        user=user,
        start_date=start_date,
        end_date=end_date,
        school_class_id=school_class_id,
        section_id=section_id,
    ))
    session_ids = [s.id for s in sessions]
    records = records_for_sessions(session_ids, status=status).order_by(
        'session__date', 'session__school_class__display_order', 'student__roll_number',
    )
    rows = []
    for rec in records:
        rows.append({
            'date': str(rec.session.date),
            'class_name': rec.session.school_class.name,
            'section_name': rec.session.section.name,
            'roll_number': rec.student.roll_number or '',
            'student_name': rec.student.name,
            'status': rec.status,
            'remark': rec.remark or '',
        })
    return rows


def parent_attendance_summary(student, *, months: int = 1) -> dict:
    """Read-only attendance summary for parent child profile."""
    today = timezone.localdate()
    start = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    if months > 1:
        for _ in range(months - 1):
            start = (start - timedelta(days=1)).replace(day=1)

    sessions = AttendanceSession.objects.filter(
        school=student.school,
        school_class=student.school_class,
        section=student.section,
        date__gte=start,
        date__lte=today,
    )
    session_ids = list(sessions.values_list('id', flat=True))
    records = AttendanceRecord.objects.filter(session_id__in=session_ids, student=student)

    tally = _student_tally()
    recent_absences = []
    for rec in records.select_related('session').order_by('-session__date'):
        tally['session_days'] += 1
        tally[rec.status] = tally.get(rec.status, 0) + 1
        tally['weighted_days'] += attendance_weight(rec.status)
        if rec.status in (AttendanceRecord.STATUS_ABSENT, AttendanceRecord.STATUS_LEAVE) and len(recent_absences) < 5:
            recent_absences.append({
                'date': str(rec.session.date),
                'status': rec.status,
                'remark': rec.remark or '',
            })

    denom = tally['session_days'] or 1
    return {
        'period_start': str(start),
        'period_end': str(today),
        'session_days': tally['session_days'],
        'present_days': tally['present'],
        'absent_days': tally['absent'],
        'late_days': tally['late'],
        'leave_days': tally['leave'],
        'half_day_days': tally['half_day'],
        'presence_pct': round(tally['weighted_days'] / denom * 100, 1),
        'recent_absences': recent_absences,
    }
