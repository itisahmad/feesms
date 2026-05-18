from django.contrib import admin

from .models import SchoolReceiptSettings


@admin.register(SchoolReceiptSettings)
class SchoolReceiptSettingsAdmin(admin.ModelAdmin):
    list_display = ('school', 'template_key', 'print_format', 'updated_at')
    search_fields = ('school__name',)
