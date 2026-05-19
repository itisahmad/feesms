from django.contrib import admin

from .models import Announcement, AnnouncementDelivery


class AnnouncementDeliveryInline(admin.TabularInline):
    model = AnnouncementDelivery
    extra = 0
    readonly_fields = ('parent_phone', 'student_name', 'class_name', 'channel', 'status', 'error_message', 'created_at')


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ('title', 'school', 'category', 'audience_type', 'status', 'recipient_count', 'sent_at', 'created_at')
    list_filter = ('status', 'category', 'audience_type', 'school')
    search_fields = ('title', 'body')
    inlines = [AnnouncementDeliveryInline]


@admin.register(AnnouncementDelivery)
class AnnouncementDeliveryAdmin(admin.ModelAdmin):
    list_display = ('announcement', 'parent_phone', 'student_name', 'channel', 'status', 'created_at')
    list_filter = ('status', 'channel')
