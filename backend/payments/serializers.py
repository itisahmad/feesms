from rest_framework import serializers

from .models import (
    SchoolPaymentConfig,
    PlatformInvoice,
    PlatformPaymentTransaction,
    ParentPaymentIntent,
    ParentPaymentTransaction,
)


class SchoolPaymentConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolPaymentConfig
        fields = ["id", "platform_billing_cycle", "razorpay_route_account_id", "active", "created_at", "updated_at"]


class PlatformInvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformInvoice
        fields = [
            "id",
            "billing_cycle",
            "amount",
            "currency",
            "status",
            "period_start",
            "period_end",
            "due_date",
            "paid_at",
            "notes",
            "created_at",
            "updated_at",
        ]


class PlatformTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformPaymentTransaction
        fields = [
            "id",
            "provider",
            "provider_order_id",
            "provider_payment_id",
            "provider_signature",
            "amount",
            "currency",
            "status",
            "raw_payload",
            "created_at",
            "updated_at",
        ]


class ParentPaymentIntentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.name", read_only=True)

    class Meta:
        model = ParentPaymentIntent
        fields = [
            "id",
            "student_fee",
            "student",
            "student_name",
            "amount",
            "currency",
            "status",
            "provider",
            "provider_order_id",
            "paid_at",
            "notes",
            "metadata",
            "created_at",
            "updated_at",
        ]


class ParentPaymentTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParentPaymentTransaction
        fields = [
            "id",
            "provider",
            "provider_payment_id",
            "provider_signature",
            "amount",
            "currency",
            "status",
            "raw_payload",
            "created_at",
            "updated_at",
        ]
