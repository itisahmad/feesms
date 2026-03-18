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

from .models import (User, School, SchoolClass, Section, Student, FeeType, FeeStructure, 
                     StudentFeeStructureChoice, StudentFee, FeePayment,
                     ExpenseCategory, Vendor, Expense, Budget)
from .messaging import send_sms_message, send_whatsapp_message
from .serializers import (
    UserSerializer, RegisterSerializer, SchoolSerializer, SchoolClassSerializer, SectionSerializer,
    StaffUserCreateSerializer, StaffUserUpdateSerializer, ForgotPasswordSerializer, ResetPasswordSerializer,
    StudentSerializer, FeeTypeSerializer, FeeStructureSerializer,
    StudentFeeSerializer, StudentFeeCreateSerializer, FeePaymentSerializer,
    ExpenseCategorySerializer, VendorSerializer, ExpenseSerializer, BudgetSerializer, ExpenseReportSerializer
)


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            from rest_framework_simplejwt.tokens import RefreshToken
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CurrentUserView(APIView):
    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class StaffUserViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        school = self.request.user.school
        if not school or self.request.user.role != 'owner':
            return User.objects.none()
        return User.objects.filter(school=school).exclude(role='owner').order_by('username')

    def get_serializer_class(self):
        if self.action == 'create':
            return StaffUserCreateSerializer
        if self.action in ('update', 'partial_update'):
            return StaffUserUpdateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        from rest_framework.exceptions import ValidationError

        owner = self.request.user
        school = owner.school
        if owner.role != 'owner' or not school:
            raise ValidationError('Only school owner can create staff logins.')

        current_staff = User.objects.filter(school=school).exclude(role='owner').count()
        if current_staff >= school.max_staff_logins:
            raise ValidationError(f'Max staff logins reached ({school.max_staff_logins}). Upgrade plan to add more.')

        serializer.save(school=school)

    def perform_update(self, serializer):
        from rest_framework.exceptions import ValidationError

        owner = self.request.user
        if owner.role != 'owner':
            raise ValidationError('Only school owner can update staff logins.')
        serializer.save()

    def perform_destroy(self, instance):
        from rest_framework.exceptions import ValidationError

        owner = self.request.user
        if owner.role != 'owner':
            raise ValidationError('Only school owner can remove staff logins.')
        if instance.role == 'owner':
            raise ValidationError('Owner account cannot be removed.')
        instance.delete()


class ForgotPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        value = serializer.validated_data['username_or_email'].strip()
        if not value:
            return Response({'error': 'username_or_email is required'}, status=400)

        user = User.objects.filter(Q(username__iexact=value) | Q(email__iexact=value)).first()
        if not user:
            return Response({'message': 'If account exists, reset instructions have been generated.'})

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_path = f'/reset-password?uid={uid}&token={token}'

        return Response({
            'message': 'Reset instructions generated.',
            'uid': uid,
            'token': token,
            'reset_path': reset_path,
        })


class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uid = serializer.validated_data['uid']
        token = serializer.validated_data['token']
        password = serializer.validated_data['password']

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = get_user_model().objects.get(pk=user_id)
        except Exception:
            return Response({'error': 'Invalid reset link.'}, status=400)

        if not default_token_generator.check_token(user, token):
            return Response({'error': 'Invalid or expired reset token.'}, status=400)

        user.set_password(password)
        user.save(update_fields=['password'])
        return Response({'message': 'Password reset successful. Please login again.'})


class SchoolViewSet(viewsets.ModelViewSet):
    serializer_class = SchoolSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.school:
            return School.objects.filter(id=self.request.user.school_id)
        return School.objects.none()


class SchoolClassViewSet(viewsets.ModelViewSet):
    serializer_class = SchoolClassSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        school = self.request.user.school
        if not school:
            return SchoolClass.objects.none()
        return SchoolClass.objects.filter(school=school).prefetch_related('sections').order_by('display_order', 'name')

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)

    @action(detail=True, methods=['post'])
    def add_section(self, request, pk=None):
        school_class = self.get_object()
        name = request.data.get('name', '').strip()
        if not name:
            return Response({'error': 'Section name required'}, status=status.HTTP_400_BAD_REQUEST)
        if Section.objects.filter(school_class=school_class, name=name).exists():
            return Response({'error': f'Section "{name}" already exists'}, status=status.HTTP_400_BAD_REQUEST)
        order = school_class.sections.count()
        section = Section.objects.create(school_class=school_class, name=name, display_order=order)
        return Response(SectionSerializer(section).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def apply_fee(self, request, pk=None):
        """Apply a fee structure to all students in this class. Central/class-wise fee assignment."""
        from datetime import datetime
        school_class = self.get_object()
        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)
        fee_structure_id = request.data.get('fee_structure_id')
        if not fee_structure_id:
            return Response({'error': 'fee_structure_id required'}, status=400)
        try:
            fs = FeeStructure.objects.get(id=fee_structure_id, school=school, school_class=school_class)
        except FeeStructure.DoesNotExist:
            return Response({'error': 'Fee structure not found or does not belong to this class'}, status=400)
        effective_from = request.data.get('effective_from')
        eff_date = None
        if effective_from:
            try:
                eff_date = datetime.strptime(effective_from, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass
        students = Student.objects.filter(school=school, school_class=school_class, is_active=True)
        created = 0
        for student in students:
            _, was_created = StudentFeeStructureChoice.objects.update_or_create(
                student=student,
                fee_structure=fs,
                defaults={'effective_from': eff_date}
            )
            if was_created:
                created += 1
        return Response({
            'message': f'Applied {fs.fee_type.name} to {students.count()} students in {school_class.name}',
            'students_updated': students.count(),
            'newly_added': created,
        })


class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        school = self.request.user.school
        if not school:
            return Student.objects.none()
        qs = Student.objects.filter(school=school, is_active=True).select_related('school_class', 'section')
        class_id = self.request.query_params.get('class')
        section_id = self.request.query_params.get('section')
        if class_id:
            qs = qs.filter(school_class_id=class_id)
        if section_id:
            qs = qs.filter(section_id=section_id)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(parent_name__icontains=search) |
                Q(parent_phone__icontains=search)
            )
        return qs.order_by('school_class', 'name')

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)

    @action(detail=True, methods=['get'])
    def fee_history(self, request, pk=None):
        """Full fee history for student: admission, months, payments, dues"""
        from datetime import date
        student = self.get_object()
        student_fees = StudentFee.objects.filter(student=student).select_related(
            'fee_structure', 'fee_structure__fee_type'
        ).prefetch_related('payments').order_by('-year', '-month')

        yearly_groups = {}
        by_month = {}
        for sf in student_fees:
            key = (sf.year, sf.month)
            if key not in by_month:
                by_month[key] = {'year': sf.year, 'month': sf.month, 'fees': [], 'total_due': 0, 'total_paid': 0}
            payments_list = []
            for p in sf.payments.all():
                pmt = {'amount': float(p.amount), 'date': str(p.payment_date), 'mode': p.payment_mode, 'notes': p.notes or '', 'is_yearly': 'Full year' in (p.notes or '')}
                payments_list.append(pmt)
                if pmt['is_yearly']:
                    group_key = (sf.fee_structure_id, str(p.payment_date), p.payment_mode)
                    if group_key not in yearly_groups:
                        yearly_groups[group_key] = {'fee_type': sf.fee_structure.fee_type.name, 'total': 0, 'date': str(p.payment_date), 'mode': p.payment_mode}
                    yearly_groups[group_key]['total'] += float(p.amount)
            paid = sum(float(p.amount) for p in sf.payments.all())
            total = float(sf.total_amount)
            by_month[key]['fees'].append({
                'id': sf.id,
                'fee_type': sf.fee_structure.fee_type.name,
                'total': total,
                'paid': paid,
                'balance': total - paid,
                'payments': payments_list,
            })
            by_month[key]['total_due'] += total
            by_month[key]['total_paid'] += paid

        yearly_payments = [{'fee_type': v['fee_type'], 'total': round(v['total'], 2), 'date': v['date'], 'mode': v['mode']} for v in yearly_groups.values()]
        months_completed = len(by_month)
        choices = StudentFeeStructureChoice.objects.filter(student=student).select_related('fee_structure__fee_type')
        fee_choices = [{
            'fee_structure_id': c.fee_structure_id,
            'fee_type': c.fee_structure.fee_type.name,
            'amount': float(c.fee_structure.amount),
            'effective_from': str(c.effective_from) if c.effective_from else None,
        } for c in choices]

        return Response({
            'student': {
                'id': student.id, 'name': student.name, 'class_name': student.get_class_display(),
                'school_class': student.school_class_id, 'section': student.section_id,
                'admission_date': str(student.admission_date) if student.admission_date else None,
                'charges_effective_from': str(student.charges_effective_from) if student.charges_effective_from else None,
                'parent_name': student.parent_name, 'parent_phone': student.parent_phone,
                'parent_email': student.parent_email or '', 'admission_number': student.admission_number or '',
                'roll_number': student.roll_number or '',
            },
            'admission_date': str(student.admission_date) if student.admission_date else None,
            'months_with_fees': months_completed,
            'fee_choices': fee_choices,
            'yearly_payments': yearly_payments,
            'monthly_history': sorted(by_month.values(), key=lambda x: (-x['year'], -x['month'])),
        })


class FeeTypeViewSet(viewsets.ModelViewSet):
    serializer_class = FeeTypeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        school = self.request.user.school
        if not school:
            return FeeType.objects.none()
        return FeeType.objects.filter(Q(school=school) | Q(school__isnull=True, is_system=True))

    def perform_create(self, serializer):
        from rest_framework.exceptions import ValidationError

        school = self.request.user.school
        if not school:
            raise ValidationError('No school assigned to this user.')
        serializer.save(school=school, is_system=False)

    def perform_update(self, serializer):
        from rest_framework.exceptions import ValidationError

        obj = self.get_object()
        school = self.request.user.school
        if obj.is_system and obj.school_id is None:
            raise ValidationError('System fee types cannot be edited.')
        if not school or obj.school_id != school.id:
            raise ValidationError('You can only edit your school fee types.')
        serializer.save(school=school, is_system=False)

    def perform_destroy(self, instance):
        from rest_framework.exceptions import ValidationError

        school = self.request.user.school
        if instance.is_system and instance.school_id is None:
            raise ValidationError('System fee types cannot be deleted.')
        if not school or instance.school_id != school.id:
            raise ValidationError('You can only delete your school fee types.')
        if FeeStructure.objects.filter(fee_type=instance).exists():
            raise ValidationError('Cannot delete fee type linked to fee structures.')
        instance.delete()


class FeeStructureViewSet(viewsets.ModelViewSet):
    serializer_class = FeeStructureSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        school = self.request.user.school
        if not school:
            return FeeStructure.objects.none()
        qs = FeeStructure.objects.filter(school=school).select_related('fee_type', 'school_class')
        class_id = self.request.query_params.get('school_class')
        if class_id:
            qs = qs.filter(school_class_id=class_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)

    def perform_update(self, serializer):
        obj = self.get_object()
        if StudentFeeStructureChoice.objects.filter(fee_structure=obj).exists() or StudentFee.objects.filter(fee_structure=obj).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Cannot edit fee structure that is already linked to students or fee records.')
        serializer.save()

    def perform_destroy(self, instance):
        if StudentFeeStructureChoice.objects.filter(fee_structure=instance).exists() or StudentFee.objects.filter(fee_structure=instance).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Cannot delete fee structure that is already linked to students or fee records.')
        instance.delete()


class StudentFeeViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return StudentFeeCreateSerializer
        return StudentFeeSerializer

    def get_queryset(self):
        school = self.request.user.school
        if not school:
            return StudentFee.objects.none()
        return StudentFee.objects.filter(
            student__school=school
        ).select_related('student', 'fee_structure', 'fee_structure__fee_type').prefetch_related('payments')

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

    def _is_struct_billable_for_period(self, struct, month, year, student, choice=None):
        """Decide whether a fee structure should be billed for a month/year for a student."""
        start_date = None
        if choice and choice.effective_from:
            start_date = choice.effective_from
        if not start_date:
            start_date = getattr(student, 'charges_effective_from', None) or student.admission_date

        # Fallback to existing class-level rules when no student-specific start date exists.
        if not start_date:
            return struct.should_bill_for_month(month)

        month_diff = (year - start_date.year) * 12 + (month - start_date.month)
        if month_diff < 0:
            return False

        if struct.billing_period == 'monthly':
            return True
        if struct.billing_period == 'quarterly':
            return month_diff % 3 == 0
        if struct.billing_period == 'half_yearly':
            return month_diff % 6 == 0
        if struct.billing_period == 'yearly':
            return month_diff % 12 == 0
        if struct.billing_period == 'one_time':
            return month_diff == 0

        return True

    def list(self, request, *args, **kwargs):
        self.queryset = self.get_queryset_filtered()
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def collection_summary(self, request):
        """Fee collection summary: class-wise pending, student-wise breakdown, defaulters"""
        from datetime import date
        import calendar

        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        if not month or not year:
            from django.utils import timezone
            now = timezone.now()
            month, year = now.month, now.year
        else:
            month, year = int(month), int(year)

        student_fees = StudentFee.objects.filter(
            student__school=school
        ).filter(
            Q(year__lt=year) | Q(year=year, month__lte=month)
        ).select_related('student', 'student__school_class', 'fee_structure__fee_type').prefetch_related('payments').order_by('year', 'month')

        class_data = {}
        student_data = {}
        student_ids = list(student_fees.values_list('student_id', flat=True).distinct())
        choice_ids_map = {}
        choice_map = {}
        if student_ids:
            choices = StudentFeeStructureChoice.objects.filter(student_id__in=student_ids)
            for c in choices:
                choice_ids_map.setdefault(c.student_id, []).append(c.fee_structure_id)
                choice_map[(c.student_id, c.fee_structure_id)] = c

        for sf in student_fees:
            # Only include fee structures that the student has actively chosen
            if sf.fee_structure_id not in choice_ids_map.get(sf.student_id, []):
                continue
            choice = choice_map.get((sf.student_id, sf.fee_structure_id))
            if not self._is_struct_billable_for_period(sf.fee_structure, sf.month, sf.year, sf.student, choice):
                continue
            eff_from = (choice.effective_from if choice and choice.effective_from else None) or getattr(sf.student, 'charges_effective_from', None) or sf.student.admission_date
            if eff_from:
                try:
                    _, last_day = calendar.monthrange(sf.year, sf.month)
                    if eff_from > date(sf.year, sf.month, last_day):
                        continue
                except (ValueError, TypeError):
                    pass

            paid = sum(float(p.amount) for p in sf.payments.all())
            total = float(sf.total_amount)
            balance = total - paid

            class_name = sf.student.school_class.name if sf.student.school_class else sf.student.get_class_display()
            if class_name not in class_data:
                class_data[class_name] = {'total_due': 0, 'total_paid': 0, 'total_pending': 0, 'students': set()}
            class_data[class_name]['total_due'] += total
            class_data[class_name]['total_paid'] += paid
            class_data[class_name]['total_pending'] += balance
            class_data[class_name]['students'].add(sf.student_id)

            sid = sf.student_id
            if sid not in student_data:
                student_data[sid] = {
                    'student_id': sid,
                    'student_name': sf.student.name,
                    'class_name': class_name,
                    'school_class_id': sf.student.school_class_id,
                    'assigned_fee_structure_ids': choice_ids_map.get(sid, []),
                    'parent_phone': sf.student.parent_phone,
                    'fees': [],
                    'total_due': 0,
                    'total_paid': 0,
                    'total_pending': 0,
                }
            student_data[sid]['fees'].append({
                'student_fee_id': sf.id,
                'fee_structure_id': sf.fee_structure_id,
                'fee_type': sf.fee_structure.fee_type.name,
                'month': sf.month,
                'year': sf.year,
                'total': total,
                'paid': paid,
                'balance': balance,
                'status': 'paid' if balance <= 0 else ('partial' if paid > 0 else 'unpaid'),
                'allow_yearly_payment': sf.fee_structure.allow_yearly_payment,
                'yearly_discount_percent': float(sf.fee_structure.yearly_discount_percent or 0),
                'academic_year': sf.fee_structure.academic_year,
                'billing_period': sf.fee_structure.billing_period,
                'amount_per_period': float(sf.fee_structure.amount),
            })
            student_data[sid]['total_due'] += total
            student_data[sid]['total_paid'] += paid
            student_data[sid]['total_pending'] += balance

        class_wise = [
            {
                'class_name': k,
                'total_due': round(v['total_due'], 2),
                'total_paid': round(v['total_paid'], 2),
                'total_pending': round(v['total_pending'], 2),
                'student_count': len(v['students']),
            }
            for k, v in sorted(class_data.items())
        ]

        student_wise = []
        defaulters = []
        for v in student_data.values():
            # Calculate overall status
            overall_status = 'fully_paid' if v['total_pending'] <= 0 else ('partial' if v['total_paid'] > 0 else 'unpaid')
            
            # Calculate detailed status information
            current_month_fees = [f for f in v['fees'] if f['month'] == month and f['year'] == year]
            academic_year_fees = []
            
            # Check if all academic year fees are paid
            if v['fees']:
                # Group by fee structure to check yearly payment status
                fee_structures = {}
                for f in v['fees']:
                    if f['fee_structure_id'] not in fee_structures:
                        fee_structures[f['fee_structure_id']] = []
                    fee_structures[f['fee_structure_id']].append(f)
                
                academic_year_complete = True
                for fs_id, fs_fees in fee_structures.items():
                    if any(f['balance'] > 0 for f in fs_fees):
                        academic_year_complete = False
                        break
                
                # Current month status
                current_month_paid = all(f['balance'] <= 0 for f in current_month_fees) if current_month_fees else True
            else:
                academic_year_complete = True  # No fees to pay
                current_month_paid = True
            
            v['status'] = overall_status
            v['detailed_status'] = {
                'academic_year_complete': academic_year_complete,
                'current_month_paid': current_month_paid,
                'current_month': month,
                'current_year': year,
                'has_current_month_fees': len(current_month_fees) > 0
            }
            v['total_due'] = round(v['total_due'], 2)
            v['total_paid'] = round(v['total_paid'], 2)
            v['total_pending'] = round(v['total_pending'], 2)
            student_wise.append(v)
            if overall_status != 'fully_paid':
                defaulters.append(v)

        return Response({
            'month': month,
            'year': year,
            'academic_year_start_month': getattr(school, 'academic_year_start_month', 4) or 4,
            'class_wise': class_wise,
            'student_wise': sorted(student_wise, key=lambda x: (x['class_name'], x['student_name'])),
            'defaulters': defaulters,
        })

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Dashboard stats: total collected, pending, students count. Includes all fees up to current month (like Fee Collection)."""
        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)

        now = timezone.now()
        month, year = now.month, now.year

        # Include all fees up to and including current month (matches collection_summary - shows full picture)
        student_fees = StudentFee.objects.filter(
            student__school=school
        ).filter(
            Q(year__lt=year) | Q(year=year, month__lte=month)
        ).prefetch_related('payments')

        total_due = sum(float(sf.total_amount) for sf in student_fees)
        total_paid = sum(
            sum(float(p.amount) for p in sf.payments.all())
            for sf in student_fees
        )
        total_pending = total_due - total_paid

        students_count = Student.objects.filter(school=school, is_active=True).count()

        unpaid_student_fees = StudentFee.objects.filter(
            student__school=school
        ).filter(
            Q(year__lt=year) | Q(year=year, month__lte=month)
        ).select_related('student', 'student__school_class').prefetch_related('payments')
        unpaid_count = 0
        class_wise = {}
        class_students = {}
        student_pending = {}
        for sf in unpaid_student_fees:
            paid = sum(float(p.amount) for p in sf.payments.all())
            balance = float(sf.total_amount) - paid
            class_name = sf.student.school_class.name if sf.student.school_class else (sf.student.class_name or 'Unassigned')
            if class_name not in class_wise:
                class_wise[class_name] = {'total_due': 0, 'total_paid': 0, 'total_pending': 0}
                class_students[class_name] = set()
            class_wise[class_name]['total_due'] += float(sf.total_amount)
            class_wise[class_name]['total_paid'] += paid
            class_wise[class_name]['total_pending'] += balance
            class_students[class_name].add(sf.student_id)
            if paid < float(sf.total_amount):
                unpaid_count += 1
                sid = sf.student_id
                if sid not in student_pending:
                    student_pending[sid] = {'student_name': sf.student.name, 'class_name': class_name, 'pending': 0}
                student_pending[sid]['pending'] += balance

        for k in class_wise:
            c = class_wise[k]
            c['total_due'] = round(c['total_due'], 2)
            c['total_paid'] = round(c['total_paid'], 2)
            c['total_pending'] = round(c['total_pending'], 2)
            c['student_count'] = len(class_students.get(k, set()))

        class_wise_list = [{'class_name': k, **v} for k, v in sorted(class_wise.items())]
        defaulters_list = sorted(
            [{'student_id': sid, **v, 'pending': round(v['pending'], 2)} for sid, v in student_pending.items()],
            key=lambda x: -x['pending']
        )[:10]
        collection_rate = round((total_paid / total_due * 100) if total_due > 0 else 100, 1)

        return Response({
            'total_due': total_due,
            'total_collected': total_paid,
            'total_pending': total_pending,
            'students_count': students_count,
            'unpaid_count': unpaid_count,
            'collection_rate': collection_rate,
            'class_wise': class_wise_list,
            'top_defaulters': defaulters_list,
            'current_month': month,
            'current_year': year,
        })

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

        # Monthly: only fees for (month, year)
        monthly_fees = StudentFee.objects.filter(
            student_id=student_id,
            student__school=school,
            month=month,
            year=year,
        ).select_related('fee_structure__fee_type').prefetch_related('payments')
        if selected_fee_structure_ids is not None:
            monthly_fees = monthly_fees.filter(fee_structure_id__in=selected_fee_structure_ids)
        monthly_breakdown = []
        monthly_total = 0
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

        yearly_breakdown = []
        yearly_total = 0
        yearly_total_before_discount = 0
        for struct in structs_to_use:
            choice = choices.get(struct.id)
            if choice and choice.effective_from:
                eff_y, eff_m = choice.effective_from.year, choice.effective_from.month
            else:
                eff_y, eff_m = None, None
            for m, y in months_years:
                if not self._is_struct_billable_for_period(struct, m, y, student, choice):
                    continue
                if eff_y is not None and (y < eff_y or (y == eff_y and m < eff_m)):
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
                    fee_structure_id=struct.id,
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
                    discount_pct = float(struct.yearly_discount_percent or 0) / 100 if struct.allow_yearly_payment else 0
                    discount_pct_display = float(struct.yearly_discount_percent or 0)
                    after_discount = balance * (1 - discount_pct)
                    yearly_breakdown.append({
                        'fee_type': struct.fee_type.name,
                        'fee_structure_id': struct.id,
                        'month': m,
                        'year': y,
                        'balance': round(balance, 2),
                        'after_discount': round(after_discount, 2),
                        'discount_percent': round(discount_pct * 100, 2),
                    })
                    yearly_total += after_discount
                    yearly_total_before_discount += balance

        return Response({
            'monthly': {'amount': round(monthly_total, 2), 'breakdown': monthly_breakdown},
            'yearly': {
                'amount': round(yearly_total, 2),
                'amount_before_discount': round(yearly_total_before_discount, 2),
                'breakdown': yearly_breakdown,
            },
        })

    @action(detail=False, methods=['post'])
    def pay_all_pending(self, request):
        """Pay all unpaid fees for a student up to the given month in one go"""
        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)
        student_id = request.data.get('student_id')
        month = request.data.get('month')
        year = request.data.get('year')
        payment_date = request.data.get('payment_date')
        payment_mode = request.data.get('payment_mode', 'Cash')
        notes = request.data.get('notes', '') or 'All pending payment'
        raw_selected_ids = request.data.get('fee_structure_ids')
        selected_fee_structure_ids = None
        if raw_selected_ids is not None:
            try:
                if isinstance(raw_selected_ids, list):
                    selected_fee_structure_ids = [int(x) for x in raw_selected_ids]
                elif str(raw_selected_ids).strip() == '':
                    selected_fee_structure_ids = []
                else:
                    selected_fee_structure_ids = [int(x) for x in str(raw_selected_ids).split(',') if str(x).strip()]
            except (ValueError, TypeError):
                return Response({'error': 'fee_structure_ids must be a list of integers'}, status=400)
        if not student_id or month is None or not year or not payment_date:
            return Response({'error': 'student_id, month, year, payment_date required'}, status=400)
        try:
            from datetime import date
            payment_date = date.fromisoformat(str(payment_date))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid payment_date'}, status=400)
        month, year = int(month), int(year)
        student = Student.objects.filter(school=school, id=student_id).first()
        if not student:
            return Response({'error': 'Student not found'}, status=404)
        only_this_month = request.data.get('only_this_month', False)
        if only_this_month:
            fee_filter = Q(month=month, year=year)
        else:
            fee_filter = Q(year__lt=year) | Q(year=year, month__lte=month)
        student_fees = StudentFee.objects.filter(
            student_id=student_id,
            student__school=school,
        ).filter(fee_filter).select_related('fee_structure__fee_type').prefetch_related('payments')
        if selected_fee_structure_ids is not None:
            student_fees = student_fees.filter(fee_structure_id__in=selected_fee_structure_ids)
        to_pay = []
        for sf in student_fees:
            paid = sum(float(p.amount) for p in sf.payments.all())
            balance = float(sf.total_amount) - paid
            if balance > 0:
                to_pay.append((sf, balance))
        if not to_pay:
            err = 'No unpaid fees for this student for the selected month' if only_this_month else 'No unpaid fees for this student up to the selected month'
            return Response({'error': err}, status=400)
        total = sum(b for _, b in to_pay)
        created = 0
        for sf, balance in to_pay:
            discount_amt = Decimal('0')
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
            'message': f'Recorded payment for {created} fee(s), total ₹{total:.2f}',
            'total_amount': float(total),
            'fees_cleared': created,
        }, status=status.HTTP_201_CREATED)

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
                if not self._is_struct_billable_for_period(struct, m, y, student):
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
        from datetime import date
        import calendar
        from django.db import transaction

        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)
        student_id = request.data.get('student_id')
        month = request.data.get('month')
        year = request.data.get('year')
        payment_date = request.data.get('payment_date')
        payment_mode = request.data.get('payment_mode', 'Cash')
        notes = request.data.get('notes', '') or 'Full year payment (all fee types)'
        raw_selected_ids = request.data.get('fee_structure_ids')
        selected_fee_structure_ids = None
        if raw_selected_ids is not None:
            try:
                if isinstance(raw_selected_ids, list):
                    selected_fee_structure_ids = [int(x) for x in raw_selected_ids]
                elif str(raw_selected_ids).strip() == '':
                    selected_fee_structure_ids = []
                else:
                    selected_fee_structure_ids = [int(x) for x in str(raw_selected_ids).split(',') if str(x).strip()]
            except (ValueError, TypeError):
                return Response({'error': 'fee_structure_ids must be a list of integers'}, status=400)
        if not student_id or month is None or not year or not payment_date:
            return Response({'error': 'student_id, month, year, payment_date required'}, status=400)
        try:
            payment_date = date.fromisoformat(str(payment_date))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid payment_date'}, status=400)
        month, year = int(month), int(year)
        student = Student.objects.filter(school=school, id=student_id).prefetch_related('fee_structure_choices').first()
        if not student:
            return Response({'error': 'Student not found'}, status=404)

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
            if fallback_structs and not choices:
                fallback_structs = [s for s in fallback_structs if not s.fee_type.name.lower().startswith('transport') or getattr(student, 'uses_transport', True)]
            structs_to_use = fallback_structs

        to_pay = []
        with transaction.atomic():
            for struct in structs_to_use:
                choice = choices.get(struct.id)
                if choice and choice.effective_from:
                    eff_y, eff_m = choice.effective_from.year, choice.effective_from.month
                else:
                    eff_y, eff_m = None, None
                for m, y in months_years:
                    if not self._is_struct_billable_for_period(struct, m, y, student, choice):
                        continue
                    if eff_y is not None and (y < eff_y or (y == eff_y and m < eff_m)):
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
                        fee_structure_id=struct.id,
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
                        discount_pct = float(struct.yearly_discount_percent or 0) / 100 if struct.allow_yearly_payment else 0
                        to_pay.append((sf, balance, discount_pct))

            if not to_pay:
                return Response({'error': 'No unpaid fees for this student in the academic year'}, status=400)
            total = sum(b for _, b, _ in to_pay)
            created = 0
            for sf, balance, discount_pct in to_pay:
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
        amount_after_discount = sum(
            float(b) * (1 - dp) for _, b, dp in to_pay
        ) if to_pay else 0
        return Response({
            'message': f'Recorded full year payment for {created} fee(s), all fee types',
            'total_amount': float(total),
            'amount_paid': float(amount_after_discount),
            'fees_cleared': created,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def add_payment(self, request, pk=None):
        """Add payment to a student fee"""
        student_fee = self.get_object()
        serializer = FeePaymentSerializer(data=request.data)
        if serializer.is_valid():
            payment = serializer.save(
                student_fee=student_fee,
                created_by=request.user
            )
            # Generate receipt number if not provided
            if not payment.receipt_number:
                payment.receipt_number = f"RCP-{student_fee.student.school_id}-{payment.id:06d}"
                payment.save()
            return Response(FeePaymentSerializer(payment).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def receipt(self, request, pk=None):
        """Generate PDF receipt for a student fee"""
        from .utils import generate_receipt_pdf
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
                if not self._is_struct_billable_for_period(struct, month, year, student, choice):
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

class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseCategorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        school = self.request.user.school
        if not school:
            return ExpenseCategory.objects.none()
        return ExpenseCategory.objects.filter(school=school).order_by('name')

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)


class VendorViewSet(viewsets.ModelViewSet):
    serializer_class = VendorSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        school = self.request.user.school
        if not school:
            return Vendor.objects.none()
        return Vendor.objects.filter(school=school).order_by('name')

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        school = self.request.user.school
        if not school:
            return Expense.objects.none()
        return Expense.objects.filter(school=school).select_related('category', 'vendor', 'created_by').order_by('-date', '-created_at')

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school, created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def reports(self, request):
        """Generate comprehensive expense and profit reports"""
        from django.db.models import Sum, Count, Q
        from datetime import date
        import calendar

        school = request.user.school
        if not school:
            return Response({'error': 'No school'}, status=400)

        # Get date range from query params
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        if not start_date or not end_date:
            # Default to current academic year
            today = date.today()
            if today.month >= school.academic_year_start_month:
                start_year = today.year
            else:
                start_year = today.year - 1
            start_date = date(start_year, school.academic_year_start_month, 1)
            end_year = start_year + 1
            end_date = date(end_year, school.academic_year_start_month - 1, calendar.monthrange(end_year, school.academic_year_start_month - 1)[1])
        else:
            try:
                start_date = date.fromisoformat(start_date)
                end_date = date.fromisoformat(end_date)
            except ValueError:
                return Response({'error': 'Invalid date format'}, status=400)

        # Calculate total income from fee payments
        total_income = FeePayment.objects.filter(
            student_fee__student__school=school,
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).aggregate(total=Sum('amount'))['total'] or 0

        # Calculate total expenses
        total_expenses = Expense.objects.filter(
            school=school,
            date__gte=start_date,
            date__lte=end_date
        ).aggregate(total=Sum('amount'))['total'] or 0

        # Expense by category
        expense_by_category = Expense.objects.filter(
            school=school,
            date__gte=start_date,
            date__lte=end_date
        ).values('category__name').annotate(
            total=Sum('amount'),
            count=Count('id')
        ).order_by('-total')

        # Monthly trends
        monthly_trends = []
        current = start_date
        while current <= end_date:
            month_income = FeePayment.objects.filter(
                student_fee__student__school=school,
                created_at__year=current.year,
                created_at__month=current.month
            ).aggregate(total=Sum('amount'))['total'] or 0
            
            month_expenses = Expense.objects.filter(
                school=school,
                date__year=current.year,
                date__month=current.month
            ).aggregate(total=Sum('amount'))['total'] or 0
            
            monthly_trends.append({
                'month': current.strftime('%b %Y'),
                'income': float(month_income),
                'expenses': float(month_expenses),
                'profit': float(month_income - month_expenses)
            })
            
            # Move to next month
            if current.month == 12:
                current = date(current.year + 1, 1, 1)
            else:
                current = date(current.year, current.month + 1, 1)

        # Top vendors
        top_vendors = Expense.objects.filter(
            school=school,
            date__gte=start_date,
            date__lte=end_date,
            vendor__isnull=False
        ).values('vendor__name').annotate(
            total=Sum('amount'),
            count=Count('id')
        ).order_by('-total')[:10]

        # Budget comparison
        budget_comparison = []
        budgets = Budget.objects.filter(
            school=school,
            academic_year=f"{start_date.year}-{(start_date.year + 1) % 100:02d}"
        ).select_related('category')
        
        for budget in budgets:
            budget_comparison.append({
                'category': budget.category.name,
                'budgeted': float(budget.planned_amount),
                'spent': float(budget.spent_amount),
                'remaining': float(budget.remaining_amount),
                'utilization': budget.utilization_percentage
            })

        data = {
            'total_income': float(total_income),
            'total_expenses': float(total_expenses),
            'net_profit': float(total_income - total_expenses),
            'expense_by_category': list(expense_by_category),
            'monthly_trends': monthly_trends,
            'top_vendors': list(top_vendors),
            'budget_comparison': budget_comparison,
            'period': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        }

        serializer = ExpenseReportSerializer(data)
        return Response(serializer.data)


class BudgetViewSet(viewsets.ModelViewSet):
    serializer_class = BudgetSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        school = self.request.user.school
        if not school:
            return Budget.objects.none()
        return Budget.objects.filter(school=school).select_related('category', 'school').order_by('-academic_year', 'category__name')

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)

