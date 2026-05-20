"""
REST API Views for School Fee Management
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Sum, Q
from django.utils import timezone
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth import get_user_model
from datetime import datetime
from decimal import Decimal
from django.utils.encoding import force_bytes, force_str

from ..models import (User, School, SchoolClass, Section, Student, FeeType, FeeStructure, 
                     StudentFeeStructureChoice, StudentFee, FeePayment,
                     ExpenseCategory, Vendor, Expense, Budget)
from ..messaging import send_sms_message, send_whatsapp_message
from ..serializers import (
    UserSerializer, RegisterSerializer, SchoolSerializer, SchoolClassSerializer, SectionSerializer,
    StaffUserCreateSerializer, StaffUserUpdateSerializer, ForgotPasswordSerializer, ResetPasswordSerializer,
    StudentSerializer, FeeTypeSerializer, FeeStructureSerializer,
    StudentFeeSerializer, StudentFeeCreateSerializer, FeePaymentSerializer,
    ExpenseCategorySerializer, VendorSerializer, ExpenseSerializer, BudgetSerializer, ExpenseReportSerializer
)
from ..default_fee_types import ensure_default_fee_types_for_school
from ..fee_periods import is_struct_billable_for_period
from ..yearly_fee_preview import build_yearly_preview_breakdown
from ..bulk_fee_collection import (
    get_paid_fee_structure_ids_for_monthly,
    get_payable_fee_structure_ids_for_monthly,
    pay_all_pending_operation,
    pay_all_year_operation,
)
from ..mixins import SchoolNestedMixin, SchoolScopedMixin
from ..permissions import HasModulePermission, IsSchoolOwner
from ..services.fee_collection import (
    build_collection_summary,
    build_dashboard_stats,
    build_student_fee_history,
)


class StudentFeeViewSet(SchoolNestedMixin, viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    module_key = "fee_collection"
    action_module_map = {"dashboard": "dashboard"}
    school_lookup = "student__school"

    def get_serializer_class(self):
        if self.action == 'create':
            return StudentFeeCreateSerializer
        return StudentFeeSerializer

    def get_queryset(self):
        school = self.get_user_school()
        if not school:
            return StudentFee.objects.none()
        return (
            StudentFee.objects.for_school(school)
            .select_related('student', 'fee_structure', 'fee_structure__fee_type')
            .prefetch_related('payments')
        )

    def get_queryset_filtered(self):
        qs = self.get_queryset()
        student_id = self.request.query_params.get('student')
        if student_id:
            qs = qs.filter(student_id=student_id)
        month = self.request.query_params.get('month')
        year = self.request.query_params.get('year')
        if month:
            qs = qs.filter(month=int(month))
        if year:
            qs = qs.filter(year=int(year))
        return qs

    def list(self, request, *args, **kwargs):
        self.queryset = self.get_queryset_filtered()
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def collection_summary(self, request):
        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        if not month or not year:
            now = timezone.now()
            month, year = now.month, now.year
        else:
            month, year = int(month), int(year)
        return Response(build_collection_summary(school, month, year))

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)
        now = timezone.now()
        return Response(build_dashboard_stats(school, now.month, now.year))

    @action(detail=False, methods=['get'])
    def payment_preview(self, request):
        """Get monthly (this month only) and yearly (full academic year) amounts for a student"""
        from datetime import date
        import calendar

        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)
        student_id = request.query_params.get('student_id')
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        if not student_id or not month or not year:
            return Response({'error': 'student_id, month, year required'}, status=400)
        meta_only = str(request.query_params.get('meta_only', '')).lower() in ('1', 'true', 'yes')
        breakup_mode = str(request.query_params.get('breakup_mode', 'both')).lower()
        if breakup_mode not in ('monthly', 'yearly', 'both'):
            breakup_mode = 'both'
        raw_selected_ids = request.query_params.get('fee_structure_ids')
        selected_fee_structure_ids = None
        if raw_selected_ids:
            try:
                selected_fee_structure_ids = [int(x) for x in str(raw_selected_ids).split(',') if str(x).strip()]
            except (ValueError, TypeError):
                return Response({'error': 'fee_structure_ids must be comma-separated integers'}, status=400)
        month, year = int(month), int(year)
        student = Student.objects.filter(school=school, id=student_id).prefetch_related('fee_structure_choices').first()
        if not student:
            return Response({'error': 'Student not found'}, status=404)

        monthly_breakdown = []
        monthly_total = 0
        if breakup_mode in ('monthly', 'both'):
            monthly_fees = StudentFee.objects.filter(
                student_id=student_id,
                student__school=school,
                month=month,
                year=year,
            ).select_related('fee_structure__fee_type').prefetch_related('payments')
            if selected_fee_structure_ids is not None:
                monthly_fees = monthly_fees.filter(fee_structure_id__in=selected_fee_structure_ids)
            for sf in monthly_fees:
                paid = sum(float(p.amount) for p in sf.payments.all())
                balance = float(sf.total_amount) - paid
                if balance > 0:
                    monthly_breakdown.append({
                        'fee_type': sf.fee_structure.fee_type.name,
                        'fee_structure_id': sf.fee_structure_id,
                        'month': sf.month,
                        'year': sf.year,
                        'balance': round(balance, 2),
                    })
                    monthly_total += balance

        # Yearly: full academic year (same logic as pay_all_year but read-only)
        start_month = getattr(school, 'academic_year_start_month', 4) or 4
        if month >= start_month:
            start_year, end_year = year, year + 1
        else:
            start_year, end_year = year - 1, year
        end_month = start_month - 1 if start_month > 1 else 12
        months_years = []
        if start_month > 1:
            for m in range(start_month, 13):
                months_years.append((m, start_year))
            for m in range(1, end_month + 1):
                months_years.append((m, end_year))
        else:
            for m in range(1, 13):
                months_years.append((m, start_year))

        academic_year_str = f'{start_year}-{str(end_year)[-2:]}'
        structures = FeeStructure.objects.filter(
            school=school,
            academic_year=academic_year_str,
        ).select_related('fee_type')
        if student.school_class:
            structures = structures.filter(school_class=student.school_class)
        else:
            structures = structures.filter(school_class__isnull=True)
        choices = {c.fee_structure_id: c for c in student.fee_structure_choices.all()}
        if choices:
            structs_to_use = [s for s in structures if s.id in choices]
        else:
            structs_to_use = [s for s in structures if not s.fee_type.name.lower().startswith('transport') or getattr(student, 'uses_transport', True)]

        # Fallback: if no structures for this academic year, use structures from student's existing fees or class
        if not structs_to_use:
            existing_fee_struct_ids = StudentFee.objects.filter(
                student_id=student_id,
                student__school=school,
            ).values_list('fee_structure_id', flat=True).distinct()
            if existing_fee_struct_ids:
                fallback_structs = list(FeeStructure.objects.filter(
                    id__in=existing_fee_struct_ids,
                    school=school,
                ).select_related('fee_type'))
            else:
                fallback_structs = []
            if not fallback_structs and student.school_class:
                fallback_structs = list(FeeStructure.objects.filter(
                    school=school,
                    school_class=student.school_class,
                ).select_related('fee_type').order_by('-academic_year')[:20])
            if not fallback_structs:
                fallback_structs = list(FeeStructure.objects.filter(
                    school=school,
                    school_class__isnull=True,
                ).select_related('fee_type').order_by('-academic_year')[:20])
            # Apply same transport filter when no choices
            if fallback_structs and not choices:
                fallback_structs = [s for s in fallback_structs if not s.fee_type.name.lower().startswith('transport') or getattr(student, 'uses_transport', True)]
            structs_to_use = fallback_structs

        structures_for_meta = list(structs_to_use)

        if selected_fee_structure_ids is not None:
            selected_qs = FeeStructure.objects.filter(
                school=school,
                id__in=selected_fee_structure_ids,
            ).select_related('fee_type')
            if student.school_class:
                selected_qs = selected_qs.filter(Q(school_class=student.school_class) | Q(school_class__isnull=True))
            else:
                selected_qs = selected_qs.filter(school_class__isnull=True)
            structs_to_use = list(selected_qs)

        payable_fee_structure_ids = get_payable_fee_structure_ids_for_monthly(
            student, school, month, year, structures_for_meta
        )
        paid_fee_structure_ids = get_paid_fee_structure_ids_for_monthly(
            student, school, month, year, structures_for_meta
        )

        if meta_only:
            return Response({
                'monthly': {'amount': 0, 'breakdown': []},
                'yearly': {
                    'amount': 0,
                    'amount_before_discount': 0,
                    'breakdown': [],
                },
                'payable_fee_structure_ids': payable_fee_structure_ids,
                'paid_fee_structure_ids': paid_fee_structure_ids,
            })

        if breakup_mode == 'monthly':
            return Response({
                'monthly': {'amount': round(monthly_total, 2), 'breakdown': monthly_breakdown},
                'yearly': {
                    'amount': 0,
                    'amount_before_discount': 0,
                    'breakdown': [],
                },
                'payable_fee_structure_ids': payable_fee_structure_ids,
                'paid_fee_structure_ids': paid_fee_structure_ids,
            })

        yearly_breakdown, yearly_total, yearly_total_before_discount = build_yearly_preview_breakdown(
            student,
            int(student_id),
            structs_to_use,
            months_years,
            choices,
        )

        return Response({
            'monthly': {'amount': round(monthly_total, 2), 'breakdown': monthly_breakdown},
            'yearly': {
                'amount': round(yearly_total, 2),
                'amount_before_discount': round(yearly_total_before_discount, 2),
                'breakdown': yearly_breakdown,
            },
            'payable_fee_structure_ids': payable_fee_structure_ids,
            'paid_fee_structure_ids': paid_fee_structure_ids,
        })

    @action(detail=False, methods=['post'])
    def pay_all_pending(self, request):
        """Pay all unpaid fees for a student up to the given month in one go"""
        return pay_all_pending_operation(request.user, request.data)

    @action(detail=False, methods=['post'])
    def pay_full_year(self, request):
        """Pay full academic year for a fee type at once with discount"""
        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)
        student_id = request.data.get('student_id')
        fee_structure_id = request.data.get('fee_structure_id')
        payment_date = request.data.get('payment_date')
        payment_mode = request.data.get('payment_mode', 'Cash')
        notes = request.data.get('notes', '') or 'Full year payment'
        if not student_id or not fee_structure_id or not payment_date:
            return Response({'error': 'student_id, fee_structure_id, payment_date required'}, status=400)
        try:
            from datetime import date
            payment_date = date.fromisoformat(str(payment_date))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid payment_date'}, status=400)
        struct = FeeStructure.objects.filter(school=school, id=fee_structure_id).select_related('fee_type').first()
        if not struct:
            return Response({'error': 'Fee structure not found'}, status=404)
        if not struct.allow_yearly_payment:
            return Response({'error': 'This fee does not allow full year payment'}, status=400)
        student = Student.objects.filter(school=school, id=student_id).first()
        if not student:
            return Response({'error': 'Student not found'}, status=404)
        start_month = getattr(school, 'academic_year_start_month', 4) or 4
        ay = struct.academic_year
        try:
            start_year = int(ay.split('-')[0])
        except (ValueError, IndexError):
            return Response({'error': 'Invalid academic year'}, status=400)
        end_year = start_year + 1 if start_month > 1 else start_year
        end_month = start_month - 1 if start_month > 1 else 12
        months_years = []
        if start_month > 1:
            for m in range(start_month, 13):
                months_years.append((m, start_year))
            for m in range(1, end_month + 1):
                months_years.append((m, end_year))
        else:
            for m in range(1, 13):
                months_years.append((m, start_year))
        import calendar
        from django.db import transaction
        to_pay = []
        with transaction.atomic():
            for m, y in months_years:
                if not is_struct_billable_for_period(struct, m, y, student):
                    continue
                eff_from = getattr(student, 'charges_effective_from', None) or student.admission_date
                if eff_from:
                    try:
                        _, last_day = calendar.monthrange(y, m)
                        if eff_from > date(y, m, last_day):
                            continue
                    except (ValueError, TypeError):
                        pass
                sf, _ = StudentFee.objects.get_or_create(
                    student_id=student_id,
                    fee_structure_id=fee_structure_id,
                    month=m,
                    year=y,
                    defaults={
                        'amount': struct.amount,
                        'late_fine': 0,
                        'total_amount': struct.amount,
                        'due_date': date(y, m, min(struct.due_day, 28)),
                    }
                )
                paid = sum(float(p.amount) for p in sf.payments.all())
                balance = float(sf.total_amount) - paid
                if balance > 0:
                    to_pay.append((sf, balance))
            if not to_pay:
                return Response({'error': 'No unpaid fees for this fee type in the academic year'}, status=400)
            total = sum(b for _, b in to_pay)
            discount_pct = float(struct.yearly_discount_percent or 0) / 100
            amount_to_pay = total * (1 - discount_pct)
            created = 0
            for sf, balance in to_pay:
                discount_amt = Decimal(str(balance * discount_pct))
                payment = FeePayment.objects.create(
                    student_fee=sf,
                    amount=sf.total_amount,
                    discount=discount_amt,
                    payment_date=payment_date,
                    payment_mode=payment_mode,
                    notes=notes,
                    created_by=request.user,
                )
                payment.receipt_number = f"RCP-{school.id}-{payment.id:06d}"
                payment.save()
                created += 1
        return Response({
            'message': f'Recorded full year payment for {created} months',
            'total_amount': float(total),
            'discount_percent': float(struct.yearly_discount_percent or 0),
            'amount_paid': float(amount_to_pay),
            'months_cleared': created,
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def pay_all_year(self, request):
        """Pay full academic year for ALL fee types (Transport, Tuition, etc.) in one go"""
        return pay_all_year_operation(request.user, request.data)

    @action(detail=True, methods=['post'])
    def add_payment(self, request, pk=None):
        """Add payment to a student fee"""
        student_fee = self.get_object()
        serializer = FeePaymentSerializer(data=request.data)
        if serializer.is_valid():
            payment = serializer.save(student_fee=student_fee, created_by=request.user)
            payment.assign_receipt_number()
            return Response(FeePaymentSerializer(payment).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def receipt(self, request, pk=None):
        """Generate PDF receipt for a student fee"""
        from ..utils import generate_receipt_pdf
        from django.http import HttpResponse
        student_fee = self.get_object()
        pdf = generate_receipt_pdf(student_fee)
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="receipt-{student_fee.student.name}-{student_fee.month}-{student_fee.year}.pdf"'
        return response

    @action(detail=False, methods=['post'])
    def generate_fees(self, request):
        """Generate fee records for current or future months (allows advance payment). Past months blocked. Uses admission_date to skip students who joined after the month."""
        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)
        month = request.data.get('month')
        year = request.data.get('year')
        if not month or not year:
            return Response({'error': 'month and year required'}, status=400)
        month, year = int(month), int(year)
        from datetime import date
        now = timezone.now()
        if year < now.year or (year == now.year and month < now.month):
            return Response({
                'error': 'Generate fees is not allowed for past months. Select current or future month.',
            }, status=400)
        try:
            due_base = date(year, month, 1)
        except ValueError:
            return Response({'error': 'Invalid month/year'}, status=400)
        import calendar
        _, last_day_num = calendar.monthrange(year, month)
        last_day_of_month = date(year, month, last_day_num)

        start_month = getattr(school, 'academic_year_start_month', 4) or 4
        ay_start_year = year if month >= start_month else year - 1
        academic_year = f'{ay_start_year}-{str(ay_start_year + 1)[-2:]}'
        students = Student.objects.filter(school=school, is_active=True).select_related('school_class').prefetch_related('fee_structure_choices')
        structures = FeeStructure.objects.filter(school=school, academic_year=academic_year).select_related('school_class', 'fee_type')
        used_fallback_year = False
        if not structures.exists():
            latest = FeeStructure.objects.filter(school=school).values_list('academic_year', flat=True).order_by('-academic_year').first()
            if latest:
                structures = FeeStructure.objects.filter(school=school, academic_year=latest).select_related('school_class', 'fee_type')
                academic_year = latest
                used_fallback_year = True
            else:
                return Response({
                    'error': 'No fee structures found. Please create fee structures (Fee Structure page) for your classes first.',
                    'debug': {'academic_year_sought': f'{ay_start_year}-{str(ay_start_year + 1)[-2:]}'},
                }, status=400)
        created = 0
        debug = {'academic_year': academic_year, 'students_count': students.count(), 'structures_count': structures.count(),
                 'skipped_no_class': 0, 'skipped_admission': 0, 'skipped_no_structs': 0, 'already_existed': 0}
        for student in students:
            if not student.school_class:
                debug['skipped_no_class'] += 1
                continue
            # Use charges_effective_from if set, else admission_date. Skip if month is before charges apply.
            effective_from = getattr(student, 'charges_effective_from', None) or student.admission_date
            if effective_from and last_day_of_month < effective_from:
                debug['skipped_admission'] += 1
                continue
            class_structs = structures.filter(school_class=student.school_class)
            if not class_structs.exists():
                class_structs = structures.filter(school_class__isnull=True)  # generic structures
            choices = {c.fee_structure_id: c for c in student.fee_structure_choices.all()}
            if choices:
                structs_to_use = [s for s in class_structs if s.id in choices]
            else:
                structs_to_use = [s for s in class_structs if not s.fee_type.name.lower().startswith('transport') or getattr(student, 'uses_transport', True)]
            if not structs_to_use:
                debug['skipped_no_structs'] += 1
            for struct in structs_to_use:
                choice = choices.get(struct.id)
                if choice and choice.effective_from:
                    if year < choice.effective_from.year or (year == choice.effective_from.year and month < choice.effective_from.month):
                        continue
                if not is_struct_billable_for_period(struct, month, year, student, choice):
                    continue
                _, was_created = StudentFee.objects.get_or_create(
                    student=student,
                    fee_structure=struct,
                    month=month,
                    year=year,
                    defaults={
                        'amount': struct.amount,
                        'late_fine': 0,
                        'total_amount': struct.amount,
                        'due_date': due_base.replace(day=min(struct.due_day, 28)),
                    }
                )
                if was_created:
                    created += 1
                else:
                    debug['already_existed'] += 1
        msg = f'Created {created} fee records'
        if used_fallback_year:
            msg += f' (using fee structure from {academic_year})'
        resp = {'message': msg, 'created': created}
        if created == 0:
            resp['debug'] = debug
        return Response(resp)

    @action(detail=False, methods=['post'])
    def send_reminder(self, request):
        """Send payment reminders via WhatsApp/SMS for current month unpaid fees."""
        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)

        channel = (request.data.get('channel') or 'both').strip().lower()
        if channel not in ('whatsapp', 'sms', 'both'):
            return Response({'error': 'Invalid channel. Use whatsapp, sms, or both.'}, status=400)

        now = timezone.now()
        month, year = now.month, now.year

        pending_by_student = {}
        student_fees = StudentFee.objects.filter(
            student__school=school,
            month=month,
            year=year
        ).select_related('student').prefetch_related('payments')

        for sf in student_fees:
            paid = sum(p.amount for p in sf.payments.all())
            balance = float(sf.total_amount) - float(paid)
            if balance <= 0:
                continue

            sid = sf.student_id
            if sid not in pending_by_student:
                pending_by_student[sid] = {
                    'student': sf.student.name,
                    'parent_phone': sf.student.parent_phone,
                    'pending': 0,
                }
            pending_by_student[sid]['pending'] += balance

        recipients = [
            s for s in pending_by_student.values()
            if (s.get('parent_phone') or '').strip()
        ]

        month_name = now.strftime('%b')
        sent_sms = 0
        sent_whatsapp = 0
        failed = []

        for item in recipients:
            amount = round(float(item['pending']), 2)
            message = (
                f"Dear Parent, {item['student']} has pending school fee of Rs {amount:.2f} "
                f"for {month_name} {year}. Please pay soon. - {school.name}"
            )

            if channel in ('sms', 'both'):
                ok, err, _ = send_sms_message(item['parent_phone'], message)
                if ok:
                    sent_sms += 1
                else:
                    failed.append({
                        'student': item['student'],
                        'parent_phone': item['parent_phone'],
                        'channel': 'sms',
                        'error': err,
                    })

            if channel in ('whatsapp', 'both'):
                ok, err, _ = send_whatsapp_message(item['parent_phone'], message)
                if ok:
                    sent_whatsapp += 1
                else:
                    failed.append({
                        'student': item['student'],
                        'parent_phone': item['parent_phone'],
                        'channel': 'whatsapp',
                        'error': err,
                    })

        message = (
            f"Reminders processed for {len(recipients)} parents. "
            f"SMS sent: {sent_sms}, WhatsApp sent: {sent_whatsapp}, failures: {len(failed)}"
        )

        return Response({
            'message': message,
            'month': month,
            'year': year,
            'channel': channel,
            'parents_with_pending': len(recipients),
            'sent_sms': sent_sms,
            'sent_whatsapp': sent_whatsapp,
            'failures': failed,
        })


# Expense Management ViewSets
