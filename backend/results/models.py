"""Exam results — marks per student per class subject."""
from __future__ import annotations

from decimal import Decimal

from django.db import models

from schools.models import ClassSubject, School, SchoolClass, Student

from .grading import default_bands


class SchoolGradingSettings(models.Model):
    """Per-school grade bands (percentage thresholds)."""

    school = models.OneToOneField(
        School,
        on_delete=models.CASCADE,
        related_name='grading_settings',
    )
    absent_grade = models.CharField(max_length=8, default='AB')
    bands = models.JSONField(default=default_bands)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'School grading settings'
        verbose_name_plural = 'School grading settings'

    def __str__(self):
        return f'Grading — {self.school.name}'


class ExamResult(models.Model):
    """One exam / assessment for a class (e.g. Half Yearly 2026 — Class 5)."""

    STATUS_DRAFT = 'draft'
    STATUS_PUBLISHED = 'published'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_PUBLISHED, 'Published'),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='exam_results')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='exam_results')
    name = models.CharField(max_length=120)
    exam_date = models.DateField(null=True, blank=True)
    max_marks = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('100'))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['school', 'school_class', 'name']

    def __str__(self):
        return f'{self.school_class.name} — {self.name}'


class StudentExamMark(models.Model):
    """Marks for one student in one subject for an exam."""

    exam = models.ForeignKey(ExamResult, on_delete=models.CASCADE, related_name='marks')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='exam_marks')
    class_subject = models.ForeignKey(ClassSubject, on_delete=models.CASCADE, related_name='exam_marks')
    marks_obtained = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    max_marks = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('100'))
    is_absent = models.BooleanField(default=False)
    grade = models.CharField(max_length=8, blank=True)
    remarks = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['exam', 'student', 'class_subject']
        ordering = ['student__name', 'class_subject__display_order', 'class_subject__name']

    def __str__(self):
        return f'{self.student.name} — {self.class_subject.name}'
