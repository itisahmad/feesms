from django.contrib import admin

from .models import ExamResult, SchoolGradingSettings, StudentExamMark


@admin.register(SchoolGradingSettings)
class SchoolGradingSettingsAdmin(admin.ModelAdmin):
    list_display = ['school', 'absent_grade', 'updated_at']


class StudentExamMarkInline(admin.TabularInline):
    model = StudentExamMark
    extra = 0


@admin.register(ExamResult)
class ExamResultAdmin(admin.ModelAdmin):
    list_display = ['name', 'school_class', 'school', 'status', 'exam_date', 'max_marks']
    list_filter = ['status', 'school']
    inlines = [StudentExamMarkInline]


@admin.register(StudentExamMark)
class StudentExamMarkAdmin(admin.ModelAdmin):
    list_display = ['exam', 'student', 'class_subject', 'marks_obtained', 'grade', 'is_absent']
    list_filter = ['exam__school']
