from django.contrib import admin

from .models import (
    SchoolPaymentConfig,
    PlatformInvoice,
    PlatformPaymentTransaction,
    ParentPaymentIntent,
    ParentPaymentTransaction,
)


@admin.register(SchoolPaymentConfig)
class SchoolPaymentConfigAdmin(admin.ModelAdmin):
    list_display = ["school", "platform_billing_cycle", "razorpay_route_account_id", "active", "updated_at"]
    search_fields = ["school__name", "razorpay_route_account_id"]


@admin.register(PlatformInvoice)
class PlatformInvoiceAdmin(admin.ModelAdmin):
    list_display = ["id", "school", "billing_cycle", "amount", "status", "due_date", "paid_at"]
    list_filter = ["billing_cycle", "status"]
    search_fields = ["school__name"]


@admin.register(PlatformPaymentTransaction)
class PlatformPaymentTransactionAdmin(admin.ModelAdmin):
    list_display = ["id", "invoice", "provider_order_id", "provider_payment_id", "amount", "status", "created_at"]
    list_filter = ["status", "provider"]
    search_fields = ["provider_order_id", "provider_payment_id", "invoice__school__name"]


@admin.register(ParentPaymentIntent)
class ParentPaymentIntentAdmin(admin.ModelAdmin):
    list_display = ["id", "school", "student", "student_fee", "amount", "status", "provider_order_id", "paid_at"]
    list_filter = ["status", "provider"]
    search_fields = ["school__name", "student__name", "provider_order_id"]


@admin.register(ParentPaymentTransaction)
class ParentPaymentTransactionAdmin(admin.ModelAdmin):
    list_display = ["id", "intent", "provider_payment_id", "amount", "status", "created_at"]
    list_filter = ["status", "provider"]
    search_fields = ["provider_payment_id", "intent__school__name", "intent__student__name"]
