from django.contrib import admin

from .models import AttendanceRecord, AttendanceSession, ClassTeacherAssignment


@admin.register(ClassTeacherAssignment)
class ClassTeacherAssignmentAdmin(admin.ModelAdmin):
    list_display = ('staff_user', 'school_class', 'section', 'school')
    list_filter = ('school',)


class AttendanceRecordInline(admin.TabularInline):
    model = AttendanceRecord
    extra = 0


@admin.register(AttendanceSession)
class AttendanceSessionAdmin(admin.ModelAdmin):
    list_display = ('school_class', 'section', 'date', 'status', 'school')
    list_filter = ('status', 'school', 'date')
    inlines = [AttendanceRecordInline]
