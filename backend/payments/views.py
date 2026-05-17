import uuid
from decimal import Decimal, InvalidOperation

from django.db import transaction as db_transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from schools.models import FeePayment, StudentFee
from schools.serializers import FeePaymentSerializer

from .models import (
    FeeCollectionCheckoutSession,
    ParentPaymentIntent,
    ParentPaymentTransaction,
    PlatformInvoice,
    PlatformPaymentTransaction,
    SchoolPaymentConfig,
)
from .serializers import (
    ParentPaymentIntentSerializer,
    PlatformInvoiceSerializer,
    SchoolPaymentConfigSerializer,
)
from .services import create_order, to_paise, verify_signature


PLAN_MONTHLY_AMOUNT = {
    "basic": Decimal("299.00"),
    "standard": Decimal("599.00"),
    "premium": Decimal("999.00"),
}


class PaymentConfigView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        school = request.user.school
        if not school:
            return Response({"error": "No school assigned."}, status=400)
        cfg, _ = SchoolPaymentConfig.objects.get_or_create(school=school)
        return Response(SchoolPaymentConfigSerializer(cfg).data)

    def patch(self, request):
        school = request.user.school
        if not school:
            return Response({"error": "No school assigned."}, status=400)
        cfg, _ = SchoolPaymentConfig.objects.get_or_create(school=school)
        serializer = SchoolPaymentConfigSerializer(cfg, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PlatformBillingSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        school = request.user.school
        if not school:
            return Response({"error": "No school assigned."}, status=400)

        invoices = PlatformInvoice.objects.filter(school=school).order_by("-created_at")[:20]
        next_amount = PLAN_MONTHLY_AMOUNT.get(school.plan, Decimal("599.00"))
        return Response(
            {
                "plan": school.plan,
                "next_monthly_amount": str(next_amount),
                "invoices": PlatformInvoiceSerializer(invoices, many=True).data,
            }
        )


class PlatformCreateOrderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        school = request.user.school
        if not school:
            return Response({"error": "No school assigned."}, status=400)

        billing_cycle = request.data.get("billing_cycle", "monthly")
        if billing_cycle not in ("monthly", "yearly"):
            return Response({"error": "billing_cycle must be monthly or yearly"}, status=400)

        base = PLAN_MONTHLY_AMOUNT.get(school.plan, Decimal("599.00"))
        amount = base if billing_cycle == "monthly" else base * Decimal("12")
        invoice = PlatformInvoice.objects.create(
            school=school,
            billing_cycle=billing_cycle,
            amount=amount,
            status="pending",
            due_date=timezone.now().date(),
            notes={"plan": school.plan},
        )

        order = create_order(
            amount=amount,
            receipt=f"platform_{invoice.id}",
            notes={"invoice_id": str(invoice.id), "school_id": str(school.id), "type": "platform"},
        )
        tx = PlatformPaymentTransaction.objects.create(
            invoice=invoice,
            provider_order_id=order.get("id", ""),
            amount=amount,
            currency=invoice.currency,
            status="created",
            raw_payload=order,
        )
        return Response(
            {
                "invoice": PlatformInvoiceSerializer(invoice).data,
                "order_id": order.get("id"),
                "amount_paise": order.get("amount"),
                "currency": order.get("currency", "INR"),
                "transaction_id": tx.id,
            },
            status=status.HTTP_201_CREATED,
        )


class PlatformVerifyPaymentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        school = request.user.school
        if not school:
            return Response({"error": "No school assigned."}, status=400)

        order_id = request.data.get("razorpay_order_id", "")
        payment_id = request.data.get("razorpay_payment_id", "")
        signature = request.data.get("razorpay_signature", "")
        if not order_id or not payment_id or not signature:
            return Response({"error": "Missing Razorpay verification fields."}, status=400)

        if not verify_signature(order_id, payment_id, signature):
            return Response({"error": "Invalid payment signature."}, status=400)

        tx = PlatformPaymentTransaction.objects.filter(provider_order_id=order_id, invoice__school=school).first()
        if not tx:
            return Response({"error": "Payment transaction not found."}, status=404)

        tx.provider_payment_id = payment_id
        tx.provider_signature = signature
        tx.status = "captured"
        tx.raw_payload = request.data
        tx.save()

        invoice = tx.invoice
        invoice.status = "paid"
        invoice.paid_at = timezone.now()
        invoice.save()
        return Response({"message": "Platform payment captured.", "invoice_id": invoice.id})


class ParentCreateIntentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        school = request.user.school
        if not school:
            return Response({"error": "No school assigned."}, status=400)

        student_fee_id = request.data.get("student_fee_id")
        amount_raw = request.data.get("amount")
        if not student_fee_id or amount_raw is None:
            return Response({"error": "student_fee_id and amount are required."}, status=400)

        student_fee = StudentFee.objects.filter(id=student_fee_id, student__school=school).first()
        if not student_fee:
            return Response({"error": "Student fee not found."}, status=404)

        try:
            amount = Decimal(str(amount_raw))
        except InvalidOperation:
            return Response({"error": "Invalid amount."}, status=400)
        if amount <= 0:
            return Response({"error": "Amount must be greater than zero."}, status=400)

        cfg, _ = SchoolPaymentConfig.objects.get_or_create(school=school)
        transfers = None
        if cfg.razorpay_route_account_id:
            # Route transfers settle money to the school's linked account.
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
            created_by=request.user,
            notes=request.data.get("notes", ""),
            metadata={"mode": "razorpay", "route_account_configured": bool(cfg.razorpay_route_account_id)},
        )
        order = create_order(
            amount=amount,
            receipt=f"parent_{intent.id}",
            notes={"intent_id": str(intent.id), "school_id": str(school.id), "type": "parent"},
            transfers=transfers,
        )
        intent.provider_order_id = order.get("id", "")
        intent.save()
        ParentPaymentTransaction.objects.create(
            intent=intent,
            amount=amount,
            currency="INR",
            status="created",
            raw_payload=order,
        )
        return Response(
            {
                "intent": ParentPaymentIntentSerializer(intent).data,
                "order_id": order.get("id"),
                "amount_paise": order.get("amount"),
                "currency": order.get("currency", "INR"),
            },
            status=status.HTTP_201_CREATED,
        )


class ParentVerifyPaymentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        school = request.user.school
        if not school:
            return Response({"error": "No school assigned."}, status=400)

        intent_id = request.data.get("intent_id")
        order_id = request.data.get("razorpay_order_id", "")
        payment_id = request.data.get("razorpay_payment_id", "")
        signature = request.data.get("razorpay_signature", "")
        payment_mode = request.data.get("payment_mode", "Online")
        if not intent_id or not order_id or not payment_id or not signature:
            return Response({"error": "Missing verification fields."}, status=400)

        if not verify_signature(order_id, payment_id, signature):
            return Response({"error": "Invalid payment signature."}, status=400)

        intent = ParentPaymentIntent.objects.filter(id=intent_id, school=school).select_related("student_fee").first()
        if not intent:
            return Response({"error": "Intent not found."}, status=404)

        intent.status = "paid"
        intent.paid_at = timezone.now()
        intent.save()

        tx = intent.transactions.order_by("-created_at").first()
        if tx:
            tx.provider_payment_id = payment_id
            tx.provider_signature = signature
            tx.status = "captured"
            tx.raw_payload = request.data
            tx.save()
        else:
            ParentPaymentTransaction.objects.create(
                intent=intent,
                provider_payment_id=payment_id,
                provider_signature=signature,
                amount=intent.amount,
                currency=intent.currency,
                status="captured",
                raw_payload=request.data,
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
                created_by=request.user,
            )
            created_fee_payment.receipt_number = f"RCP-{school.id}-{created_fee_payment.id:06d}"
            created_fee_payment.save()

        return Response(
            {
                "message": "Parent payment captured.",
                "intent_id": intent.id,
                "fee_payment": FeePaymentSerializer(created_fee_payment).data if created_fee_payment else None,
            }
        )


class FeeCollectionCreateOrderView(APIView):
    """Create a Razorpay order for Dashboard fee collection (monthly / all pending / full year)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from schools.bulk_fee_collection import (
            compute_razorpay_amount_pay_all_pending,
            compute_razorpay_amount_pay_all_year,
            parse_fee_structure_ids,
        )

        school = request.user.school
        if not school:
            return Response({"error": "No school assigned."}, status=400)

        collection_mode = (request.data.get("collection_mode") or "").strip().lower()
        if collection_mode not in ("monthly", "yearly", "all_pending"):
            return Response({"error": "collection_mode must be monthly, yearly, or all_pending."}, status=400)

        student_id = request.data.get("student_id")
        month = request.data.get("month")
        year = request.data.get("year")
        payment_date = request.data.get("payment_date")
        if not student_id or month is None or not year or not payment_date:
            return Response({"error": "student_id, month, year, and payment_date are required."}, status=400)

        notes_base = (request.data.get("notes") or "").strip()

        selected_fee_structure_ids, perr = parse_fee_structure_ids(request.data.get("fee_structure_ids"))
        if perr:
            return perr

        month, year = int(month), int(year)
        student_id = int(student_id)
        only_this_month = collection_mode == "monthly"

        adjustment_data = {
            k: request.data.get(k)
            for k in ("adjustment_type", "adjustment_amount", "adjustment_notes")
            if request.data.get(k) not in (None, "")
        }

        if collection_mode == "yearly":
            amount, err = compute_razorpay_amount_pay_all_year(
                school, student_id, month, year, selected_fee_structure_ids, adjustment_data=adjustment_data or None
            )
        else:
            amount, err = compute_razorpay_amount_pay_all_pending(
                school,
                student_id,
                month,
                year,
                only_this_month,
                selected_fee_structure_ids,
                adjustment_data=adjustment_data or None,
            )

        if err:
            return Response({"error": err}, status=400)
        if not amount or amount <= 0:
            return Response({"error": "Invalid amount."}, status=400)

        cfg, _ = SchoolPaymentConfig.objects.get_or_create(school=school)
        transfers = None
        if cfg.razorpay_route_account_id:
            transfers = [
                {
                    "account": cfg.razorpay_route_account_id,
                    "amount": to_paise(amount),
                    "currency": "INR",
                    "notes": {"school_id": str(school.id), "type": "fee_collection"},
                }
            ]

        payload = {
            "student_id": student_id,
            "month": month,
            "year": year,
            "payment_date": str(payment_date),
            "collection_mode": collection_mode,
            "only_this_month": only_this_month,
            "fee_structure_ids": selected_fee_structure_ids,
            "notes_base": notes_base,
        }
        payload.update(adjustment_data)

        receipt = f"fc{uuid.uuid4().hex}"[:40]
        try:
            order = create_order(
                amount=amount,
                receipt=receipt,
                notes={"school_id": str(school.id), "type": "fee_collection"},
                transfers=transfers,
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=503)

        oid = order.get("id") or ""
        if not oid:
            return Response({"error": "Razorpay did not return an order id."}, status=503)

        amount_paise = int(order.get("amount") or to_paise(amount))
        session = FeeCollectionCheckoutSession.objects.create(
            school=school,
            created_by=request.user,
            provider_order_id=oid,
            amount_inr=amount,
            amount_paise=amount_paise,
            collection_mode=collection_mode,
            payload=payload,
            status=FeeCollectionCheckoutSession.STATUS_PENDING,
        )
        return Response(
            {
                "checkout_session_id": session.id,
                "order_id": oid,
                "amount_paise": amount_paise,
                "currency": order.get("currency", "INR"),
            },
            status=status.HTTP_201_CREATED,
        )


class FeeCollectionVerifyView(APIView):
    """Verify Razorpay signature and record school fee payments for a checkout session."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from schools.bulk_fee_collection import pay_all_pending_operation, pay_all_year_operation

        school = request.user.school
        if not school:
            return Response({"error": "No school assigned."}, status=400)

        checkout_session_id = request.data.get("checkout_session_id")
        order_id = request.data.get("razorpay_order_id", "")
        payment_id = request.data.get("razorpay_payment_id", "")
        signature = request.data.get("razorpay_signature", "")
        if checkout_session_id is None or not order_id or not payment_id or not signature:
            return Response({"error": "Missing checkout_session_id or Razorpay verification fields."}, status=400)

        if not verify_signature(order_id, payment_id, signature):
            return Response({"error": "Invalid payment signature."}, status=400)

        try:
            sid = int(checkout_session_id)
        except (TypeError, ValueError):
            return Response({"error": "Invalid checkout_session_id."}, status=400)

        resp = None
        try:
            with db_transaction.atomic():
                session = (
                    FeeCollectionCheckoutSession.objects.select_for_update()
                    .filter(id=sid, school=school, status=FeeCollectionCheckoutSession.STATUS_PENDING)
                    .first()
                )
                if not session:
                    return Response({"error": "Checkout session not found or already used."}, status=404)
                if session.provider_order_id != order_id:
                    return Response({"error": "Order mismatch for this checkout session."}, status=400)

                payload = session.payload or {}
                notes_base = (payload.get("notes_base") or "").strip()
                notes = f"{notes_base} | Razorpay: {payment_id}" if notes_base else f"Online fee payment | Razorpay: {payment_id}"

                data = {
                    "student_id": payload["student_id"],
                    "month": payload["month"],
                    "year": payload["year"],
                    "payment_date": payload["payment_date"],
                    "fee_structure_ids": payload.get("fee_structure_ids"),
                    "transaction_id": payment_id,
                    "notes": "",
                }
                for key in ("adjustment_type", "adjustment_amount", "adjustment_notes"):
                    if payload.get(key) not in (None, ""):
                        data[key] = payload[key]
                if session.collection_mode == "yearly":
                    resp = pay_all_year_operation(request.user, data, payment_mode="Online", notes_override=notes)
                else:
                    data["only_this_month"] = bool(payload.get("only_this_month", session.collection_mode == "monthly"))
                    resp = pay_all_pending_operation(request.user, data, payment_mode="Online", notes_override=notes)

                if resp.status_code != status.HTTP_201_CREATED:
                    err = getattr(resp, "data", {}) or {}
                    msg = err.get("error", "Failed to record fee payments after Razorpay success.")
                    raise ValueError(msg)

                session.status = FeeCollectionCheckoutSession.STATUS_COMPLETED
                session.save(update_fields=["status", "updated_at"])
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)

        return resp if resp is not None else Response({"error": "Unexpected server state."}, status=500)
