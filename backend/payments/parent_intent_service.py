"""Shared Razorpay parent payment intent create + capture."""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.utils import timezone

from schools.models import FeePayment, StudentFee
from schools.serializers import FeePaymentSerializer

from .models import ParentPaymentIntent, ParentPaymentTransaction, SchoolPaymentConfig
from .serializers import ParentPaymentIntentSerializer
from .services import create_order, verify_signature


class ParentPaymentError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _fee_balance(student_fee: StudentFee) -> Decimal:
    return student_fee.balance


def _assert_parent_online_payment_allowed(school) -> None:
    cfg, _ = SchoolPaymentConfig.objects.get_or_create(school=school)
    if not cfg.allow_parent_online_payment:
        raise ParentPaymentError(
            "Online fee payment is not enabled for this school. Contact the school office.",
            403,
        )


def create_parent_payment_intent_for_fee(
    *,
    school,
    student_fee: StudentFee,
    created_by,
    notes: str = "",
    amount_override: Decimal | None = None,
) -> dict:
    if student_fee.student.school_id != school.id:
        raise ParentPaymentError("Student fee not found.", 404)

    _assert_parent_online_payment_allowed(school)

    amount = amount_override if amount_override is not None else _fee_balance(student_fee)
    try:
        amount = Decimal(str(amount))
    except InvalidOperation:
        raise ParentPaymentError("Invalid amount.")
    if amount <= 0:
        raise ParentPaymentError("No pending balance for this fee.")

    cfg, _ = SchoolPaymentConfig.objects.get_or_create(school=school)
    transfers = None
    if cfg.razorpay_route_account_id:
        transfers = [
            {
                "account": cfg.razorpay_route_account_id,
                "amount": int((amount * 100).quantize(Decimal("1"))),
                "currency": "INR",
                "notes": {"school_id": str(school.id), "student_fee_id": str(student_fee.id)},
            }
        ]

    intent = ParentPaymentIntent.objects.create(
        school=school,
        student=student_fee.student,
        student_fee=student_fee,
        amount=amount,
        status="pending",
        created_by=created_by,
        notes=notes,
        metadata={"mode": "razorpay", "route_account_configured": bool(cfg.razorpay_route_account_id)},
    )
    order = create_order(
        amount=amount,
        receipt=f"parent_{intent.id}",
        notes={"intent_id": str(intent.id), "school_id": str(school.id), "type": "parent"},
        transfers=transfers,
    )
    intent.provider_order_id = order.get("id", "")
    intent.save(update_fields=["provider_order_id", "updated_at"])
    ParentPaymentTransaction.objects.create(
        intent=intent,
        amount=amount,
        currency="INR",
        status="created",
        raw_payload=order,
    )
    return {
        "intent": ParentPaymentIntentSerializer(intent).data,
        "order_id": order.get("id"),
        "amount_paise": order.get("amount"),
        "currency": order.get("currency", "INR"),
        "amount": str(amount),
    }


def capture_parent_payment_intent(
    *,
    school,
    intent: ParentPaymentIntent,
    order_id: str,
    payment_id: str,
    signature: str,
    payment_mode: str = "Online (Razorpay)",
    created_by=None,
) -> dict:
    if intent.school_id != school.id:
        raise ParentPaymentError("Intent not found.", 404)
    if intent.status == "paid":
        fee_payment = None
        if intent.student_fee_id:
            fee_payment = intent.student_fee.payments.order_by("-id").first()
        return {
            "message": "Payment already captured.",
            "intent_id": intent.id,
            "fee_payment": FeePaymentSerializer(fee_payment).data if fee_payment else None,
        }

    if not order_id or not payment_id or not signature:
        raise ParentPaymentError("Missing verification fields.")
    if not verify_signature(order_id, payment_id, signature):
        raise ParentPaymentError("Invalid payment signature.", 400)

    intent.status = "paid"
    intent.paid_at = timezone.now()
    intent.save(update_fields=["status", "paid_at", "updated_at"])

    tx = intent.transactions.order_by("-created_at").first()
    if tx:
        tx.provider_payment_id = payment_id
        tx.provider_signature = signature
        tx.status = "captured"
        tx.raw_payload = {
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        }
        tx.save()
    else:
        ParentPaymentTransaction.objects.create(
            intent=intent,
            provider_payment_id=payment_id,
            provider_signature=signature,
            amount=intent.amount,
            currency=intent.currency,
            status="captured",
            raw_payload={
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": signature,
            },
        )

    created_fee_payment = None
    if intent.student_fee:
        created_fee_payment = FeePayment.objects.create(
            student_fee=intent.student_fee,
            amount=intent.amount,
            payment_date=timezone.now().date(),
            payment_mode=payment_mode,
            transaction_id=payment_id,
            notes=(intent.notes or "Online parent payment via Razorpay"),
            created_by=created_by,
        )
        created_fee_payment.receipt_number = f"RCP-{school.id}-{created_fee_payment.id:06d}"
        created_fee_payment.save(update_fields=["receipt_number"])

    return {
        "message": "Parent payment captured.",
        "intent_id": intent.id,
        "fee_payment": FeePaymentSerializer(created_fee_payment).data if created_fee_payment else None,
    }
