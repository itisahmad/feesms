"""School grading rules — bands by percentage."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction

DEFAULT_BANDS: list[dict[str, Any]] = [
    {'grade': 'A+', 'min_percentage': 90},
    {'grade': 'A', 'min_percentage': 80},
    {'grade': 'B', 'min_percentage': 70},
    {'grade': 'C', 'min_percentage': 60},
    {'grade': 'D', 'min_percentage': 40},
    {'grade': 'F', 'min_percentage': 0},
]


def default_bands() -> list[dict[str, Any]]:
    return [dict(b) for b in DEFAULT_BANDS]


@dataclass(frozen=True)
class GradingConfig:
    absent_grade: str
    bands: list[dict[str, Any]]


def normalize_bands(bands: list[dict]) -> list[dict[str, Any]]:
    """Validate and sort bands high → low by min_percentage."""
    if not bands:
        raise ValueError('At least one grade band is required.')
    seen_grades: set[str] = set()
    seen_mins: set[float] = set()
    cleaned: list[dict[str, Any]] = []
    for row in bands:
        grade = str(row.get('grade', '')).strip()
        if not grade:
            raise ValueError('Each band must have a grade label.')
        if grade in seen_grades:
            raise ValueError(f'Duplicate grade: {grade}')
        seen_grades.add(grade)
        try:
            min_pct = float(row.get('min_percentage', row.get('min_percent', 0)))
        except (TypeError, ValueError) as exc:
            raise ValueError('min_percentage must be a number.') from exc
        if min_pct < 0 or min_pct > 100:
            raise ValueError('min_percentage must be between 0 and 100.')
        if min_pct in seen_mins:
            raise ValueError('Each band must have a unique min_percentage.')
        seen_mins.add(min_pct)
        cleaned.append({'grade': grade, 'min_percentage': min_pct})
    cleaned.sort(key=lambda b: b['min_percentage'], reverse=True)
    return cleaned


def get_or_create_grading_settings(school):
    from .models import SchoolGradingSettings

    settings, created = SchoolGradingSettings.objects.get_or_create(
        school=school,
        defaults={
            'absent_grade': 'AB',
            'bands': default_bands(),
        },
    )
    if created:
        return settings
    if not settings.bands:
        settings.bands = default_bands()
        settings.save(update_fields=['bands', 'updated_at'])
    return settings


def grading_config_from_settings(settings) -> GradingConfig:
    bands = normalize_bands(settings.bands)
    absent = (settings.absent_grade or 'AB').strip() or 'AB'
    return GradingConfig(absent_grade=absent, bands=bands)


def get_grading_config(school) -> GradingConfig:
    return grading_config_from_settings(get_or_create_grading_settings(school))


def calculate_grade(
    marks_obtained,
    max_marks,
    is_absent: bool = False,
    *,
    config: GradingConfig | None = None,
) -> str:
    if config is None:
        config = GradingConfig(absent_grade='AB', bands=normalize_bands(default_bands()))
    if is_absent or marks_obtained is None:
        return config.absent_grade
    try:
        obtained = Decimal(str(marks_obtained))
        maximum = Decimal(str(max_marks))
    except (InvalidOperation, TypeError):
        return ''
    if maximum <= 0:
        return ''
    pct = float((obtained / maximum) * 100)
    for band in config.bands:
        if pct >= band['min_percentage']:
            return str(band['grade'])
    return str(config.bands[-1]['grade']) if config.bands else ''


@transaction.atomic
def recalculate_draft_exam_grades(school) -> int:
    """Re-apply grading rules to all marks on draft exams for this school."""
    from .models import ExamResult, StudentExamMark

    config = get_grading_config(school)
    updated = 0
    exams = ExamResult.objects.filter(school=school, status=ExamResult.STATUS_DRAFT)
    for exam in exams:
        marks = list(StudentExamMark.objects.filter(exam=exam))
        for mark in marks:
            mark.grade = calculate_grade(
                mark.marks_obtained,
                mark.max_marks or exam.max_marks,
                mark.is_absent,
                config=config,
            )
        if marks:
            StudentExamMark.objects.bulk_update(marks, ['grade'])
            updated += len(marks)
    return updated
