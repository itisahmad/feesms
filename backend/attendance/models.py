"""Attendance models — class sessions and per-student records."""
from django.conf import settings
from django.db import models


class ClassTeacherAssignment(models.Model):
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='class_teacher_assignments')
    staff_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='class_teacher_assignments',
    )
    school_class = models.ForeignKey('schools.SchoolClass', on_delete=models.CASCADE, related_name='teacher_assignments')
    section = models.ForeignKey('schools.Section', on_delete=models.CASCADE, related_name='teacher_assignments')
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_class_teachers',
    )

    class Meta:
        unique_together = [['staff_user', 'school_class', 'section']]
        ordering = ['school_class__display_order', 'section__display_order']

    def __str__(self):
        return f'{self.staff_user} → {self.school_class.name}-{self.section.name}'


class AttendanceSession(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_FINALIZED = 'finalized'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_FINALIZED, 'Finalized'),
    ]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='attendance_sessions')
    school_class = models.ForeignKey('schools.SchoolClass', on_delete=models.PROTECT, related_name='attendance_sessions')
    section = models.ForeignKey('schools.Section', on_delete=models.PROTECT, related_name='attendance_sessions')
    date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attendance_sessions_marked',
    )
    finalized_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['school', 'school_class', 'section', 'date']]
        ordering = ['-date', 'school_class__display_order']

    def __str__(self):
        return f'{self.school_class.name}-{self.section.name} {self.date}'


class AttendanceRecord(models.Model):
    STATUS_PRESENT = 'present'
    STATUS_ABSENT = 'absent'
    STATUS_LATE = 'late'
    STATUS_LEAVE = 'leave'
    STATUS_HALF_DAY = 'half_day'
    STATUS_CHOICES = [
        (STATUS_PRESENT, 'Present'),
        (STATUS_ABSENT, 'Absent'),
        (STATUS_LATE, 'Late'),
        (STATUS_LEAVE, 'On leave'),
        (STATUS_HALF_DAY, 'Half day'),
    ]

    session = models.ForeignKey(AttendanceSession, on_delete=models.CASCADE, related_name='records')
    student = models.ForeignKey('schools.Student', on_delete=models.PROTECT, related_name='attendance_records')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PRESENT)
    remark = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = [['session', 'student']]
        ordering = ['student__roll_number', 'student__name']

    def __str__(self):
        return f'{self.student.name} — {self.status}'
