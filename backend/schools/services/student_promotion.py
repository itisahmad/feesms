"""Promote students to the next class at end of session."""
from __future__ import annotations

from datetime import date

from django.db import transaction

from schools.fee_reminder_data import academic_year_label
from schools.models import FeeStructure, School, SchoolClass, Section, Student, StudentFeeStructureChoice


def next_academic_year_label(label: str) -> str:
    if '-' not in label:
        return label
    start, _ = label.split('-', 1)
    try:
        y0 = int(start)
        return f'{y0 + 1}-{str(y0 + 2)[-2:]}'
    except ValueError:
        return label


def get_next_class(school: School, current_class: SchoolClass) -> SchoolClass | None:
    return (
        SchoolClass.objects.filter(school=school, display_order__gt=current_class.display_order)
        .order_by('display_order', 'name')
        .first()
    )


def resolve_target_section(
    target_class: SchoolClass,
    source_section: Section | None,
) -> Section | None:
    if source_section:
        match = target_class.sections.filter(name=source_section.name).first()
        if match:
            return match
    return target_class.sections.order_by('display_order', 'name').first()


def _generate_roll_number(school: School, school_class: SchoolClass, section: Section) -> str:
    qs = Student.objects.filter(
        school=school,
        school_class=school_class,
        section=section,
        is_active=True,
    ).exclude(roll_number='')

    max_roll = 0
    for rn in qs.values_list('roll_number', flat=True):
        if str(rn).isdigit():
            max_roll = max(max_roll, int(rn))

    candidate = max_roll + 1
    while qs.filter(roll_number=str(candidate)).exists():
        candidate += 1
    return str(candidate)


def _academic_year_start_date(school: School, academic_year: str) -> date:
    try:
        start_year = int(academic_year.split('-')[0])
    except (ValueError, IndexError):
        start_year = date.today().year
    start_month = getattr(school, 'academic_year_start_month', 4) or 4
    return date(start_year, start_month, 1)


def _migrate_fee_choices(
    student: Student,
    target_class: SchoolClass,
    academic_year: str,
    effective_from: date,
) -> int:
    """Map existing fee-type selections to target class structures for the new year."""
    current_choices = list(
        StudentFeeStructureChoice.objects.filter(student=student).select_related(
            'fee_structure__fee_type',
        )
    )
    selected_fee_type_ids = {c.fee_structure.fee_type_id for c in current_choices}

    target_structs = FeeStructure.objects.filter(
        school=student.school,
        school_class=target_class,
        academic_year=academic_year,
    ).select_related('fee_type')

    if selected_fee_type_ids:
        structs_to_add = [s for s in target_structs if s.fee_type_id in selected_fee_type_ids]
    else:
        structs_to_add = list(target_structs)

    added = 0
    for struct in structs_to_add:
        _, created = StudentFeeStructureChoice.objects.get_or_create(
            student=student,
            fee_structure=struct,
            defaults={'effective_from': effective_from},
        )
        if created:
            added += 1
    return added


def build_promotion_preview(
    school: School,
    *,
    school_class_id: int,
    section_id: int | None = None,
    academic_year: str | None = None,
) -> dict:
    try:
        from_class = SchoolClass.objects.get(id=school_class_id, school=school)
    except SchoolClass.DoesNotExist:
        raise ValueError('Class not found.')

    section = None
    if section_id:
        section = Section.objects.filter(id=section_id, school_class=from_class).first()
        if not section:
            raise ValueError('Section not found for this class.')

    to_class = get_next_class(school, from_class)
    to_section = resolve_target_section(to_class, section) if to_class else None

    today = date.today()
    current_ay = academic_year_label(school, today.month, today.year)
    target_ay = academic_year or next_academic_year_label(current_ay)

    students_qs = Student.objects.filter(
        school=school,
        school_class=from_class,
        is_active=True,
    ).select_related('section')
    if section:
        students_qs = students_qs.filter(section=section)
    students_qs = students_qs.order_by('section__display_order', 'section__name', 'roll_number', 'name')

    student_rows = []
    for student in students_qs:
        student_rows.append({
            'id': student.id,
            'name': student.name,
            'roll_number': student.roll_number or '',
            'section_id': student.section_id,
            'section_name': student.section.name if student.section else '',
            'will_graduate': to_class is None,
        })

    return {
        'from_class': {'id': from_class.id, 'name': from_class.name},
        'section': {'id': section.id, 'name': section.name} if section else None,
        'to_class': {'id': to_class.id, 'name': to_class.name} if to_class else None,
        'to_section': {'id': to_section.id, 'name': to_section.name} if to_section else None,
        'academic_year': target_ay,
        'current_academic_year': current_ay,
        'students': student_rows,
        'promotable_count': sum(1 for s in student_rows if not s['will_graduate']),
        'graduating_count': sum(1 for s in student_rows if s['will_graduate']),
    }


@transaction.atomic
def promote_students(
    school: School,
    *,
    school_class_id: int,
    section_id: int | None = None,
    student_ids: list[int] | None = None,
    exclude_student_ids: list[int] | None = None,
    target_class_id: int | None = None,
    target_section_id: int | None = None,
    regenerate_roll_numbers: bool = True,
    academic_year: str | None = None,
    graduate_inactive: bool = True,
) -> dict:
    preview = build_promotion_preview(
        school,
        school_class_id=school_class_id,
        section_id=section_id,
        academic_year=academic_year,
    )
    from_class = SchoolClass.objects.get(id=school_class_id, school=school)

    students_qs = Student.objects.filter(
        school=school,
        school_class=from_class,
        is_active=True,
    ).select_related('section')
    if section_id:
        students_qs = students_qs.filter(section_id=section_id)

    exclude_ids = set(exclude_student_ids or [])
    if student_ids:
        id_set = set(student_ids) - exclude_ids
        students_qs = students_qs.filter(id__in=id_set)
    elif exclude_ids:
        students_qs = students_qs.exclude(id__in=exclude_ids)

    to_class = None
    if target_class_id:
        to_class = SchoolClass.objects.filter(id=target_class_id, school=school).first()
        if not to_class:
            raise ValueError('Target class not found.')
    else:
        to_class = get_next_class(school, from_class)

    target_ay = preview['academic_year']
    effective_from = _academic_year_start_date(school, target_ay)

    promoted = []
    graduated = []
    skipped = []

    for student in students_qs.select_for_update():
        if to_class is None:
            if graduate_inactive:
                student.is_active = False
                student.save(update_fields=['is_active', 'updated_at'])
                graduated.append({
                    'id': student.id,
                    'name': student.name,
                    'reason': 'No higher class — marked inactive (graduated).',
                })
            else:
                skipped.append({
                    'id': student.id,
                    'name': student.name,
                    'reason': 'No higher class available.',
                })
            continue

        target_section = None
        if target_section_id:
            target_section = Section.objects.filter(
                id=target_section_id,
                school_class=to_class,
            ).first()
            if not target_section:
                skipped.append({
                    'id': student.id,
                    'name': student.name,
                    'reason': 'Target section not found.',
                })
                continue
        else:
            target_section = resolve_target_section(to_class, student.section)
            if not target_section:
                skipped.append({
                    'id': student.id,
                    'name': student.name,
                    'reason': f'No section in {to_class.name}. Add a section first.',
                })
                continue

        old_class = student.school_class.name if student.school_class else ''
        old_section = student.section.name if student.section else ''

        student.school_class = to_class
        student.section = target_section
        if regenerate_roll_numbers:
            student.roll_number = _generate_roll_number(school, to_class, target_section)
        elif not (student.roll_number or '').strip():
            student.roll_number = _generate_roll_number(school, to_class, target_section)
        student.save(update_fields=['school_class', 'section', 'roll_number', 'updated_at'])

        fee_added = _migrate_fee_choices(student, to_class, target_ay, effective_from)

        promoted.append({
            'id': student.id,
            'name': student.name,
            'from': f'{old_class}-{old_section}'.strip('-'),
            'to': f'{to_class.name}-{target_section.name}',
            'roll_number': student.roll_number,
            'fee_choices_added': fee_added,
        })

    return {
        'message': (
            f'Promoted {len(promoted)} student(s)'
            + (f', graduated {len(graduated)}' if graduated else '')
            + (f', skipped {len(skipped)}' if skipped else '')
            + '.'
        ),
        'academic_year': target_ay,
        'to_class': preview['to_class'],
        'to_section': preview['to_section'],
        'promoted': promoted,
        'graduated': graduated,
        'skipped': skipped,
        'promoted_count': len(promoted),
        'graduated_count': len(graduated),
        'skipped_count': len(skipped),
    }
