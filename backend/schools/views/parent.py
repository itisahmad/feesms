"""Parent portal API views."""
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from results.models import ExamResult

from ..parent_auth import (
    get_parent_child_or_none,
    make_parent_username,
    parent_phone_linked_to_students,
    resolve_parent_for_login,
    resolve_school_by_public_code,
)
from ..parent_services import build_parent_child_profile
from ..permissions import IsParent
from ..phone_otp import (
    PhoneOTPError,
    confirm_parent_register_otp,
    confirm_parent_reset_otp,
    has_recent_parent_register_verification,
    has_recent_parent_reset_verification,
    normalize_parent_phone,
    send_parent_register_otp,
    send_parent_reset_otp,
)
from ..models import Student, StudentFee
from payments.models import ParentPaymentIntent
from payments.parent_intent_service import ParentPaymentError, capture_parent_payment_intent, create_parent_payment_intent_for_fee

User = get_user_model()


class ParentChildSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source="get_class_display", read_only=True)
    section_name = serializers.CharField(source="section.name", read_only=True, allow_null=True)

    class Meta:
        model = Student
        fields = [
            "id",
            "name",
            "class_name",
            "section_name",
            "admission_number",
            "roll_number",
        ]


class ParentSendOTPView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        school_code = request.data.get("school_code", "")
        phone = request.data.get("phone", "")
        school = resolve_school_by_public_code(school_code)
        if not school:
            return Response({"error": "Invalid school code."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            normalized = normalize_parent_phone(phone)
        except PhoneOTPError as exc:
            return Response({"error": exc.message}, status=exc.status_code)

        if User.objects.filter(school=school, role="parent", phone=normalized).exists():
            return Response({"error": "Account already exists. Sign in instead."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = send_parent_register_otp(school, normalized)
            return Response(result)
        except PhoneOTPError as exc:
            return Response({"error": exc.message}, status=exc.status_code)


class ParentForgotPasswordSendOTPView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        school_code = request.data.get("school_code", "")
        phone = request.data.get("phone", "")
        school = resolve_school_by_public_code(school_code)
        if not school:
            return Response({"error": "Invalid school code."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            normalized = normalize_parent_phone(phone)
        except PhoneOTPError as exc:
            return Response({"error": exc.message}, status=exc.status_code)

        try:
            result = send_parent_reset_otp(school, normalized)
            return Response(result)
        except PhoneOTPError as exc:
            return Response({"error": exc.message}, status=exc.status_code)


class ParentResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        school_code = (request.data.get("school_code") or "").strip()
        raw_phone = request.data.get("phone", "")
        otp = request.data.get("otp", "")
        password = request.data.get("password", "")
        password2 = request.data.get("password2", password)

        school = resolve_school_by_public_code(school_code)
        if not school:
            return Response({"error": "Invalid school code."}, status=status.HTTP_400_BAD_REQUEST)

        if password != password2:
            return Response({"error": "Passwords do not match."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            phone = normalize_parent_phone(raw_phone)
        except PhoneOTPError as exc:
            return Response({"error": exc.message}, status=exc.status_code)

        user = User.objects.filter(school=school, role="parent", phone=phone, is_active=True).first()
        if not user:
            return Response({"error": "No parent account found. Register first with OTP."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            confirm_parent_reset_otp(school, phone, otp)
        except PhoneOTPError as exc:
            return Response({"error": exc.message}, status=exc.status_code)

        if not has_recent_parent_reset_verification(school.id, phone):
            return Response({"error": "Verify phone with OTP before resetting password."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(password, user)
        except DjangoValidationError as exc:
            return Response({"error": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(password)
        user.save(update_fields=["password"])

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "message": "Password reset successful.",
                "role": user.role,
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            },
        )


class ParentRegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        school_code = (request.data.get("school_code") or "").strip()
        raw_phone = request.data.get("phone", "")
        otp = request.data.get("otp", "")
        password = request.data.get("password", "")
        password2 = request.data.get("password2", password)

        school = resolve_school_by_public_code(school_code)
        if not school:
            return Response({"error": "Invalid school code."}, status=status.HTTP_400_BAD_REQUEST)

        if password != password2:
            return Response({"error": "Passwords do not match."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            phone = normalize_parent_phone(raw_phone)
        except PhoneOTPError as exc:
            return Response({"error": exc.message}, status=exc.status_code)

        if User.objects.filter(school=school, role="parent", phone=phone).exists():
            return Response({"error": "Account already exists. Sign in instead."}, status=status.HTTP_400_BAD_REQUEST)

        if not parent_phone_linked_to_students(school, phone):
            return Response({"error": "No student found with this phone at this school."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            confirm_parent_register_otp(school, phone, otp)
        except PhoneOTPError as exc:
            return Response({"error": exc.message}, status=exc.status_code)

        if not has_recent_parent_register_verification(school.id, phone):
            return Response({"error": "Verify phone with OTP before registering."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(password)
        except DjangoValidationError as exc:
            return Response({"error": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user = User(
            username=make_parent_username(school.id, phone),
            role="parent",
            school=school,
            phone=phone,
            is_active=True,
        )
        user.set_password(password)
        user.save()

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "message": "Parent account created.",
                "role": user.role,
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            },
            status=status.HTTP_201_CREATED,
        )


class ParentLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        school_code = request.data.get("school_code", "")
        phone = request.data.get("phone", "")
        password = request.data.get("password", "")

        user, err = resolve_parent_for_login(school_code, phone, password)
        if err:
            return Response({"error": err}, status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "role": user.role,
            }
        )


class ParentChildrenView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsParent]

    def get(self, request):
        user = request.user
        children = (
            Student.objects.filter(
                school_id=user.school_id,
                parent_phone=user.phone,
                is_active=True,
            )
            .select_related("school_class", "section")
            .order_by("school_class__display_order", "school_class__name", "name")
        )
        return Response(ParentChildSerializer(children, many=True).data)


class ParentChildDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsParent]

    def get(self, request, student_id: int):
        student = get_parent_child_or_none(request.user, student_id)
        if not student:
            raise Http404
        return Response(build_parent_child_profile(student))


class ParentChildExamReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsParent]

    def get(self, request, student_id: int):
        student = get_parent_child_or_none(request.user, student_id)
        if not student:
            raise Http404

        exam_id = request.query_params.get("exam_id")
        if not exam_id:
            return Response({"error": "exam_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            exam = ExamResult.objects.get(
                pk=int(exam_id),
                school_id=student.school_id,
                school_class_id=student.school_class_id,
                status=ExamResult.STATUS_PUBLISHED,
            )
        except (ExamResult.DoesNotExist, ValueError, TypeError):
            raise Http404

        from results.services import student_result_card

        return Response(student_result_card(exam, student))


class ParentChildReceiptsListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsParent]

    def get(self, request, student_id: int):
        student = get_parent_child_or_none(request.user, student_id)
        if not student:
            raise Http404

        fees = (
            StudentFee.objects.filter(student=student)
            .select_related("fee_structure__fee_type")
            .prefetch_related("payments")
            .order_by("-year", "-month")
        )
        rows = []
        for fee in fees:
            paid = float(fee.paid_amount())
            if paid <= 0:
                continue
            rows.append({
                "student_fee_id": fee.id,
                "fee_type": fee.fee_structure.fee_type.name,
                "month": fee.month,
                "year": fee.year,
                "total": float(fee.total_amount),
                "paid": paid,
                "balance": float(fee.balance),
            })
        return Response(rows)


class ParentChildReceiptDownloadView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsParent]

    def get(self, request, student_id: int, student_fee_id: int):
        from django.http import HttpResponse
        from ..utils import generate_receipt_pdf

        student = get_parent_child_or_none(request.user, student_id)
        if not student:
            raise Http404

        student_fee = (
            StudentFee.objects.filter(pk=student_fee_id, student=student)
            .select_related("student", "fee_structure__fee_type")
            .prefetch_related("payments")
            .first()
        )
        if not student_fee:
            raise Http404

        if student_fee.paid_amount() <= 0:
            return Response(
                {"error": "No payment recorded for this fee yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pdf = generate_receipt_pdf(student_fee)
        response = HttpResponse(pdf, content_type="application/pdf")
        name = student.name.replace(" ", "-")
        response["Content-Disposition"] = (
            f'attachment; filename="receipt-{name}-{student_fee.month}-{student_fee.year}.pdf"'
        )
        return response


class ParentChildMonthReceiptDownloadView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsParent]

    def get(self, request, student_id: int):
        from django.http import HttpResponse
        from receipts.context import RECEIPT_MONTHLY
        from receipts.services import generate_receipt_pdf_for_period

        student = get_parent_child_or_none(request.user, student_id)
        if not student:
            raise Http404

        month = request.query_params.get('month')
        year = request.query_params.get('year')
        if month is None or year is None:
            return Response(
                {'error': 'month and year are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            month_i, year_i = int(month), int(year)
        except (TypeError, ValueError):
            return Response({'error': 'Invalid month or year.'}, status=status.HTTP_400_BAD_REQUEST)

        from schools.models import StudentFee

        fees = (
            StudentFee.objects.filter(student=student, month=month_i, year=year_i)
            .prefetch_related('payments')
        )
        if not any(fee.paid_amount() > 0 for fee in fees):
            return Response(
                {'error': 'No payment recorded for this month yet.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pdf = generate_receipt_pdf_for_period(
            student,
            receipt_type=RECEIPT_MONTHLY,
            month=month_i,
            year=year_i,
        )
        response = HttpResponse(pdf, content_type='application/pdf')
        name = student.name.replace(' ', '-')
        response['Content-Disposition'] = (
            f'attachment; filename="receipt-{name}-{month_i}-{year_i}.pdf"'
        )
        return response


class ParentChildPayView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsParent]

    def post(self, request, student_id: int):
        student = get_parent_child_or_none(request.user, student_id)
        if not student:
            raise Http404

        student_fee_id = request.data.get("student_fee_id")
        if not student_fee_id:
            return Response({"error": "student_fee_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        student_fee = (
            StudentFee.objects.filter(pk=student_fee_id, student=student)
            .select_related("student", "fee_structure__fee_type")
            .first()
        )
        if not student_fee:
            raise Http404

        try:
            result = create_parent_payment_intent_for_fee(
                school=request.user.school,
                student_fee=student_fee,
                created_by=request.user,
                notes=request.data.get("notes", "Parent portal online payment"),
            )
        except ParentPaymentError as exc:
            return Response({"error": exc.message}, status=exc.status_code)

        return Response(result, status=status.HTTP_201_CREATED)


class ParentChildPayVerifyView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsParent]

    def post(self, request, student_id: int):
        student = get_parent_child_or_none(request.user, student_id)
        if not student:
            raise Http404

        intent_id = request.data.get("intent_id")
        if not intent_id:
            return Response({"error": "intent_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        intent = (
            ParentPaymentIntent.objects.filter(
                id=intent_id,
                school_id=request.user.school_id,
                student=student,
            )
            .select_related("student_fee")
            .first()
        )
        if not intent:
            raise Http404

        try:
            result = capture_parent_payment_intent(
                school=request.user.school,
                intent=intent,
                order_id=request.data.get("razorpay_order_id", ""),
                payment_id=request.data.get("razorpay_payment_id", ""),
                signature=request.data.get("razorpay_signature", ""),
                payment_mode=request.data.get("payment_mode", "Online (Razorpay)"),
                created_by=request.user,
            )
        except ParentPaymentError as exc:
            return Response({"error": exc.message}, status=exc.status_code)

        return Response(result)
