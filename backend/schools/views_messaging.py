"""
Messaging settings and outbound send API (SMS / WhatsApp).
"""
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MessageLog, MessageUsage, SchoolMessagingSettings, Student
from .payment_links import generate_payment_link
from .serializers import SchoolMessagingSettingsSerializer, SendMessageSerializer
from .services.messaging_service import send_sms, send_whatsapp
from .messaging import normalize_phone


def _get_or_create_messaging_settings(school):
    settings_obj, _ = SchoolMessagingSettings.objects.get_or_create(school=school)
    return settings_obj


def _build_message_body(*, school, student: Student, message_type: str, custom_message: str, invoice_id: int | None):
    if message_type == MessageLog.TYPE_CUSTOM:
        return (custom_message or "").strip()

    if message_type == MessageLog.TYPE_PAYMENT:
        if invoice_id is not None:
            link = generate_payment_link(invoice_id)
            return (
                f"Dear Parent, payment is due for {student.name}. "
                f"You can pay online here: {link} — {school.name}"
            )
        return (
            f"Dear Parent, this is a payment notice for {student.name}. "
            f"Please clear pending fees at your earliest convenience. — {school.name}"
        )

    if message_type == MessageLog.TYPE_RESULT:
        return (
            f"Dear Parent, academic result update for {student.name}: "
            f"detailed marks will be available in the parent portal shortly. — {school.name}"
        )

    # reminder
    return (
        f"Dear Parent, gentle reminder regarding school fees / notices for {student.name}. "
        f"Please contact the school office if you need assistance. — {school.name}"
    )


from .permissions import IsSchoolStaff


class SchoolMessagingSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSchoolStaff]

    def get(self, request):
        school = request.user.school
        if not school:
            return Response({"error": "No school assigned."}, status=400)
        obj = _get_or_create_messaging_settings(school)
        return Response(SchoolMessagingSettingsSerializer(obj).data)

    def patch(self, request):
        school = request.user.school
        if not school:
            return Response({"error": "No school assigned."}, status=400)
        if request.user.role != "owner":
            return Response({"error": "Only school owner can update messaging settings."}, status=403)
        obj = _get_or_create_messaging_settings(school)
        ser = SchoolMessagingSettingsSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class SendMessageView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSchoolStaff]

    def post(self, request):
        school = request.user.school
        if not school:
            return Response({"error": "No school assigned."}, status=400)

        ser = SendMessageSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        settings_obj = _get_or_create_messaging_settings(school)
        channel = data["channel"]
        if channel == "sms" and not settings_obj.sms_enabled:
            return Response({"error": "SMS is disabled for this school. Enable it in messaging settings."}, status=400)
        if channel == "whatsapp" and not settings_obj.whatsapp_enabled:
            return Response(
                {"error": "WhatsApp is disabled for this school. Enable it in messaging settings."},
                status=400,
            )

        message_type = data["message_type"]
        custom_message = data.get("custom_message") or ""
        invoice_id = data.get("invoice_id")

        if message_type == MessageLog.TYPE_PAYMENT and invoice_id is not None:
            from payments.models import PlatformInvoice

            inv = PlatformInvoice.objects.filter(id=invoice_id, school=school).first()
            if not inv:
                return Response({"error": "invoice_id not found for this school."}, status=400)

        student_ids = data["student_ids"]
        students = list(Student.objects.filter(school=school, is_active=True, id__in=student_ids))
        found_ids = {s.id for s in students}
        missing = [sid for sid in student_ids if sid not in found_ids]
        if missing:
            return Response({"error": f"Unknown or inactive student ids: {missing}"}, status=400)

        send_fn = send_sms if channel == "sms" else send_whatsapp
        results = []
        sent_count = 0
        failed_count = 0

        for student in students:
            raw_phone = (student.parent_phone or "").strip()
            if not raw_phone:
                log = MessageLog.objects.create(
                    school=school,
                    student=student,
                    phone_number="",
                    channel=channel,
                    message_type=message_type,
                    content="(skipped — no parent phone)",
                    status=MessageLog.STATUS_FAILED,
                    provider_response={"error": "Missing parent phone number."},
                )
                results.append({"student_id": student.id, "status": "failed", "error": "Missing parent phone number."})
                failed_count += 1
                continue

            phone_display = normalize_phone(raw_phone) or raw_phone
            body = _build_message_body(
                school=school,
                student=student,
                message_type=message_type,
                custom_message=custom_message,
                invoice_id=invoice_id,
            )

            log = MessageLog.objects.create(
                school=school,
                student=student,
                phone_number=phone_display,
                channel=channel,
                message_type=message_type,
                content=body,
                status=MessageLog.STATUS_PENDING,
            )

            out = send_fn(raw_phone, body)
            now = timezone.now()
            if out.get("success"):
                log.status = MessageLog.STATUS_SENT
                log.provider_response = out.get("provider_response")
                log.sent_at = now
                sent_count += 1
                results.append({"student_id": student.id, "status": "sent", "error": None})
            else:
                log.status = MessageLog.STATUS_FAILED
                log.provider_response = {"error": out.get("error"), **(out.get("provider_response") or {})}
                log.sent_at = now
                failed_count += 1
                results.append({"student_id": student.id, "status": "failed", "error": out.get("error")})
            log.save(update_fields=["status", "provider_response", "sent_at"])

        total_attempts = len(students)
        if total_attempts > 0:
            MessageUsage.objects.create(school=school, channel=channel, message_count=total_attempts)

        return Response(
            {
                "summary": {
                    "total": total_attempts,
                    "sent": sent_count,
                    "failed": failed_count,
                },
                "results": results,
            },
            status=status.HTTP_200_OK,
        )
