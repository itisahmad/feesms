"""Result sheet building and grade calculation."""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import transaction

from schools.models import ClassSubject, Student

from .grading import calculate_grade, get_grading_config
from .models import ExamResult, StudentExamMark


def initialize_exam_marks(exam: ExamResult) -> int:
    """Create empty mark rows for all active students × class subjects. Returns rows created."""
    students = Student.objects.filter(
        school=exam.school,
        school_class=exam.school_class,
        is_active=True,
    ).order_by('name')
    subjects = ClassSubject.objects.filter(school_class=exam.school_class).order_by(
        'display_order', 'name'
    )
    created = 0
    for student in students:
        for subject in subjects:
            _, was_created = StudentExamMark.objects.get_or_create(
                exam=exam,
                student=student,
                class_subject=subject,
                defaults={
                    'max_marks': exam.max_marks,
                    'grade': '',
                },
            )
            if was_created:
                created += 1
    return created


@transaction.atomic
def bulk_save_marks(exam: ExamResult, entries: list[dict]) -> int:
    """Update marks from list of {student_id, class_subject_id, marks_obtained?, is_absent?}."""
    updated = 0
    max_marks = exam.max_marks
    grading = get_grading_config(exam.school)
    for entry in entries:
        student_id = entry.get('student_id')
        subject_id = entry.get('class_subject_id')
        if not student_id or not subject_id:
            continue
        is_absent = bool(entry.get('is_absent'))
        marks_raw = entry.get('marks_obtained')
        marks_obtained = None
        if not is_absent and marks_raw is not None and marks_raw != '':
            try:
                marks_obtained = Decimal(str(marks_raw))
            except (InvalidOperation, TypeError):
                marks_obtained = None
        grade = calculate_grade(marks_obtained, max_marks, is_absent=is_absent, config=grading)
        mark, _ = StudentExamMark.objects.update_or_create(
            exam=exam,
            student_id=student_id,
            class_subject_id=subject_id,
            defaults={
                'marks_obtained': marks_obtained,
                'max_marks': max_marks,
                'is_absent': is_absent,
                'grade': grade,
                'remarks': (entry.get('remarks') or '')[:255],
            },
        )
        updated += 1
    return updated


def build_marksheet_payload(exam: ExamResult) -> dict:
    grading = get_grading_config(exam.school)
    subjects = list(
        ClassSubject.objects.filter(school_class=exam.school_class).order_by('display_order', 'name')
    )
    students_qs = Student.objects.filter(
        school=exam.school,
        school_class=exam.school_class,
        is_active=True,
    ).select_related('section').order_by('name')
    students = list(students_qs)

    marks_qs = StudentExamMark.objects.filter(exam=exam).select_related(
        'student', 'class_subject',
    )
    mark_map: dict[tuple[int, int], StudentExamMark] = {}
    for m in marks_qs:
        mark_map[(m.student_id, m.class_subject_id)] = m

    subject_cols = [
        {'id': s.id, 'name': s.name, 'display_order': s.display_order}
        for s in subjects
    ]

    student_rows = []
    for student in students:
        marks_cells = []
        total_obtained = Decimal('0')
        total_max = Decimal('0')
        counted = 0
        for subj in subjects:
            m = mark_map.get((student.id, subj.id))
            if m:
                obtained = m.marks_obtained
                cell_max = m.max_marks or exam.max_marks
                if not m.is_absent and obtained is not None:
                    total_obtained += obtained
                    total_max += cell_max
                    counted += 1
                marks_cells.append({
                    'mark_id': m.id,
                    'class_subject_id': subj.id,
                    'marks_obtained': str(obtained) if obtained is not None else None,
                    'max_marks': str(cell_max),
                    'is_absent': m.is_absent,
                    'grade': m.grade,
                    'remarks': m.remarks,
                })
            else:
                marks_cells.append({
                    'mark_id': None,
                    'class_subject_id': subj.id,
                    'marks_obtained': None,
                    'max_marks': str(exam.max_marks),
                    'is_absent': False,
                    'grade': '',
                    'remarks': '',
                })
        percentage = None
        overall_grade = ''
        if total_max > 0:
            percentage = float((total_obtained / total_max) * 100)
            overall_grade = calculate_grade(total_obtained, total_max, config=grading)
        student_rows.append({
            'student_id': student.id,
            'student_name': student.name,
            'roll_number': student.roll_number or '',
            'admission_number': student.admission_number or '',
            'class_name': student.get_class_display(),
            'marks': marks_cells,
            'total_obtained': str(total_obtained) if counted else None,
            'total_max': str(total_max) if counted else None,
            'percentage': round(percentage, 2) if percentage is not None else None,
            'overall_grade': overall_grade,
        })

    return {
        'subjects': subject_cols,
        'students': student_rows,
        'has_subjects': len(subjects) > 0,
        'has_students': len(students) > 0,
    }


def list_student_published_results(student: Student) -> list[dict]:
    """Summaries of published exams for this student's class."""
    if not student.school_class_id:
        return []
    exams = ExamResult.objects.filter(
        school=student.school,
        school_class=student.school_class,
        status=ExamResult.STATUS_PUBLISHED,
    ).order_by('-exam_date', '-created_at')
    rows = []
    for exam in exams:
        card = student_result_card(exam, student)
        rows.append({
            'exam_id': exam.id,
            'exam_name': exam.name,
            'exam_date': exam.exam_date.isoformat() if exam.exam_date else None,
            'class_name': exam.school_class.name,
            'max_marks': str(exam.max_marks),
            'total_obtained': card['total_obtained'],
            'total_max': card['total_max'],
            'percentage': card['percentage'],
            'overall_grade': card['overall_grade'],
        })
    return rows


def student_result_card(exam: ExamResult, student: Student) -> dict:
    sheet = build_marksheet_payload(exam)
    row = next((s for s in sheet['students'] if s['student_id'] == student.id), None)
    return {
        'exam': {
            'id': exam.id,
            'name': exam.name,
            'exam_date': exam.exam_date.isoformat() if exam.exam_date else None,
            'max_marks': str(exam.max_marks),
            'status': exam.status,
            'class_name': exam.school_class.name,
        },
        'student': {
            'id': student.id,
            'name': student.name,
            'roll_number': student.roll_number or '',
            'class_name': student.get_class_display(),
        },
        'subjects': sheet['subjects'],
        'marks': row['marks'] if row else [],
        'total_obtained': row['total_obtained'] if row else None,
        'total_max': row['total_max'] if row else None,
        'percentage': row['percentage'] if row else None,
        'overall_grade': row['overall_grade'] if row else '',
    }
