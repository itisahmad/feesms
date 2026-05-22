"""
REST API Serializers
"""
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.db.models import Q
from datetime import date
from .models import (
    User,
    School,
    SchoolClass,
    Section,
    ClassSubject,
    Student,
    FeeType,
    FeeStructure,
    StudentFeeStructureChoice,
    StudentFee,
    FeePayment,
    ExpenseCategory,
    Vendor,
    Expense,
    Budget,
    AdmissionEnquiry,
)
from .default_fee_types import ensure_default_fee_types_for_school
from .module_permissions import (
    MODULE_DEFINITIONS,
    PERMISSION_KEYS,
    normalize_module_permissions,
    permissions_payload_for_user,
)


class ModulePermissionsField(serializers.JSONField):
    def to_representation(self, value):
        return normalize_module_permissions(value)

    def to_internal_value(self, data):
        if data is None:
            return {}
        if not isinstance(data, dict):
            raise serializers.ValidationError("module_permissions must be an object.")
        return normalize_module_permissions(data)


class UserSerializer(serializers.ModelSerializer):
    school_name = serializers.CharField(source='school.name', read_only=True)
    school_plan = serializers.CharField(source='school.plan', read_only=True)
    module_permissions = ModulePermissionsField(required=False)
    allowed_modules = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'role',
            'phone',
            'is_active',
            'school',
            'school_name',
            'school_plan',
            'module_permissions',
            'allowed_modules',
            'is_owner',
        ]
        read_only_fields = ['school', 'allowed_modules', 'is_owner']

    def get_allowed_modules(self, obj):
        return permissions_payload_for_user(obj)["allowed_modules"]

    def get_is_owner(self, obj):
        return obj.role == "owner"


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)
    school_name = serializers.CharField(write_only=True)
    school_city = serializers.CharField(write_only=True, required=False, default='Muzaffarpur')
    school_phone = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['email', 'password', 'password2', 'first_name', 'last_name', 'phone',
                  'school_name', 'school_city', 'school_phone']

    def validate_email(self, value):
        email = (value or '').strip().lower()
        if not email:
            raise serializers.ValidationError('Email is required.')
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return email

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Passwords don't match."})
        return attrs

    def create(self, validated_data):
        school_name = validated_data.pop('school_name')
        school_city = validated_data.pop('school_city', 'Muzaffarpur')
        school_phone = validated_data.pop('school_phone', '')
        validated_data.pop('password2')

        school = School.objects.create(
            name=school_name,
            city=school_city,
            phone=school_phone,
            plan='standard',
            max_students=300,
            max_staff_logins=2,
        )

        from datetime import timedelta
        from django.utils import timezone
        school.trial_ends_at = timezone.now() + timedelta(days=30)
        school.save()
        ensure_default_fee_types_for_school(school)

        # Create default classes for Bihar schools
        from .models import Section
        default_classes = ['Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10']
        for i, name in enumerate(default_classes):
            sc = SchoolClass.objects.create(school=school, name=name, display_order=i)
            Section.objects.create(school_class=sc, name='A', display_order=0)

        from .auth_utils import make_unique_username_for_email

        email = validated_data['email']
        user = User.objects.create_user(
            username=make_unique_username_for_email(email),
            email=email,
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            phone=validated_data.get('phone', ''),
            role='owner',
            school=school,
        )
        return user


class StaffUserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)
    module_permissions = ModulePermissionsField(required=False)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'first_name',
            'last_name',
            'phone',
            'password',
            'password2',
            'module_permissions',
        ]

    def validate_username(self, value):
        username = (value or '').strip()
        if not username:
            raise serializers.ValidationError('Username is required.')
        if '@' in username:
            raise serializers.ValidationError('Staff username cannot be an email address.')
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError('This username is already taken.')
        return username

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password': "Passwords don't match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        password = validated_data.pop('password')
        validated_data.setdefault('role', 'staff')
        validated_data['email'] = ''
        return User.objects.create_user(password=password, **validated_data)


class StaffUserUpdateSerializer(serializers.ModelSerializer):
    module_permissions = ModulePermissionsField(required=False)

    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'phone', 'is_active', 'module_permissions']


class ForgotPasswordSerializer(serializers.Serializer):
    username_or_email = serializers.CharField()


class ResetPasswordSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password': "Passwords don't match."})
        return attrs


class SchoolSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = School
        fields = [
            'id',
            'name',
            'address',
            'city',
            'state',
            'phone',
            'email',
            'logo',
            'logo_url',
            'plan',
            'max_students',
            'max_staff_logins',
            'academic_year_start_month',
            'fee_start_day',
            'trial_ends_at',
            'created_at',
        ]
        read_only_fields = [
            'plan',
            'max_students',
            'max_staff_logins',
            'trial_ends_at',
            'created_at',
            'logo_url',
        ]

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.logo.url)
        return obj.logo.url


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ['id', 'name', 'display_order']


class ClassSubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassSubject
        fields = ['id', 'name', 'display_order', 'created_at']


class SchoolClassSerializer(serializers.ModelSerializer):
    sections = SectionSerializer(many=True, read_only=True)
    subjects = ClassSubjectSerializer(many=True, read_only=True)
    section_names = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)

    class Meta:
        model = SchoolClass
        fields = [
            'id', 'name', 'display_order', 'sections', 'subjects',
            'section_names', 'whatsapp_group_name', 'whatsapp_group_link', 'whatsapp_group_id',
            'created_at',
        ]

    def validate_whatsapp_group_link(self, value):
        value = (value or '').strip()
        if not value:
            return ''
        if not value.startswith(('http://', 'https://')):
            raise serializers.ValidationError('Enter a valid URL (https://chat.whatsapp.com/...).')
        return value

    def validate(self, attrs):
        link = (attrs.get('whatsapp_group_link') or '').strip()
        if self.instance:
            link = link or (self.instance.whatsapp_group_link or '').strip()
        group_id = (attrs.get('whatsapp_group_id') or '').strip()
        if self.instance and not group_id:
            group_id = (self.instance.whatsapp_group_id or '').strip()
        if group_id and not link:
            raise serializers.ValidationError({
                'whatsapp_group_link': 'Add the group invite link so parents can join the class group.',
            })
        return attrs

    def create(self, validated_data):
        section_names = validated_data.pop('section_names', None)
        if section_names is None:
            section_names = []
        school_class = SchoolClass.objects.create(**validated_data)
        for i, name in enumerate(section_names):
            cleaned = (name or '').strip()
            if cleaned:
                Section.objects.create(school_class=school_class, name=cleaned, display_order=i)
        return school_class


class StudentSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='get_class_display', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True, allow_null=True)
    class_whatsapp_group_name = serializers.SerializerMethodField()
    class_whatsapp_group_link = serializers.SerializerMethodField()
    fee_structure_choices = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model = Student
        fields = [
            'id', 'name', 'school_class', 'section', 'class_name', 'section_name',
            'class_whatsapp_group_name', 'class_whatsapp_group_link',
            'admission_date', 'charges_effective_from', 'uses_transport', 'parent_name', 'parent_phone', 'parent_email',
            'admission_number', 'roll_number', 'is_active', 'fee_structure_choices', 'created_at',
        ]

    def get_class_whatsapp_group_name(self, obj):
        if obj.school_class_id and obj.school_class:
            return obj.school_class.whatsapp_group_name or ''
        return ''

    def get_class_whatsapp_group_link(self, obj):
        if obj.school_class_id and obj.school_class:
            return obj.school_class.whatsapp_group_link or ''
        return ''
        read_only_fields = ['admission_number']

    def _get_school(self, attrs):
        school = attrs.get('school') or getattr(self.instance, 'school', None)
        if school:
            return school
        request = self.context.get('request')
        if request and getattr(request.user, 'is_authenticated', False):
            return getattr(request.user, 'school', None)
        return None

    def _generate_admission_number(self, school):
        next_num = Student.objects.filter(school=school).exclude(admission_number='').count() + 1
        while True:
            candidate = f"ADM-{next_num:05d}"
            if not Student.objects.filter(school=school, admission_number=candidate).exists():
                return candidate
            next_num += 1

    def _generate_roll_number(self, school, school_class, section):
        qs = Student.objects.filter(
            school=school,
            school_class=school_class,
            section=section,
        ).exclude(roll_number='')

        max_roll = 0
        for rn in qs.values_list('roll_number', flat=True):
            if str(rn).isdigit():
                max_roll = max(max_roll, int(rn))

        candidate = max_roll + 1
        while qs.filter(roll_number=str(candidate)).exists():
            candidate += 1
        return str(candidate)

    def validate(self, attrs):
        if 'roll_number' in attrs:
            attrs['roll_number'] = (attrs.get('roll_number') or '').strip()
        if 'parent_phone' in attrs:
            raw_phone = (attrs.get('parent_phone') or '').strip()
            digits = ''.join(ch for ch in raw_phone if ch.isdigit())
            if digits.startswith('91') and len(digits) == 12:
                digits = digits[2:]
            if len(digits) != 10:
                raise serializers.ValidationError({'parent_phone': 'Enter a valid 10-digit parent phone number.'})
            if digits[0] not in '6789':
                raise serializers.ValidationError({'parent_phone': 'Parent phone number must start with 6, 7, 8, or 9.'})
            attrs['parent_phone'] = digits

        school = self._get_school(attrs)
        school_class = attrs.get('school_class') or getattr(self.instance, 'school_class', None)
        section = attrs.get('section') or getattr(self.instance, 'section', None)
        roll_number = attrs.get('roll_number', getattr(self.instance, 'roll_number', ''))
        admission_date = attrs.get('admission_date', getattr(self.instance, 'admission_date', None))
        charges_effective_from = attrs.get('charges_effective_from', getattr(self.instance, 'charges_effective_from', None))

        if admission_date and not charges_effective_from:
            fee_start_day = getattr(school, 'fee_start_day', 1) if school else 1
            if admission_date.day <= fee_start_day:
                attrs['charges_effective_from'] = admission_date
            else:
                if admission_date.month == 12:
                    attrs['charges_effective_from'] = date(admission_date.year + 1, 1, min(fee_start_day, 28))
                else:
                    attrs['charges_effective_from'] = date(admission_date.year, admission_date.month + 1, min(fee_start_day, 28))

        if roll_number and school and school_class and section:
            qs = Student.objects.filter(
                school=school,
                school_class=school_class,
                section=section,
                roll_number=roll_number,
            )
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({'roll_number': 'Roll number must be unique in the selected class and section.'})

        return attrs

    def create(self, validated_data):
        choices = validated_data.pop('fee_structure_choices', [])
        validated_data.pop('admission_number', None)

        school = validated_data.get('school') or self._get_school(validated_data)
        if school:
            validated_data['admission_number'] = self._generate_admission_number(school)

        roll_number = (validated_data.get('roll_number') or '').strip()
        validated_data['roll_number'] = roll_number
        if not roll_number and school and validated_data.get('school_class') and validated_data.get('section'):
            validated_data['roll_number'] = self._generate_roll_number(
                school,
                validated_data['school_class'],
                validated_data['section'],
            )

        student = Student.objects.create(**validated_data)
        for c in choices:
            fs_id = c.get('fee_structure_id')
            effective_from = c.get('effective_from')
            if fs_id:
                from datetime import datetime
                eff_date = None
                if effective_from:
                    try:
                        eff_date = datetime.strptime(effective_from, '%Y-%m-%d').date()
                    except (ValueError, TypeError):
                        pass
                StudentFeeStructureChoice.objects.get_or_create(
                    student=student,
                    fee_structure_id=fs_id,
                    defaults={'effective_from': eff_date}
                )
        return student

    def update(self, instance, validated_data):
        choices = validated_data.pop('fee_structure_choices', None)
        validated_data.pop('admission_number', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if not (instance.roll_number or '').strip() and instance.school and instance.school_class and instance.section:
            instance.roll_number = self._generate_roll_number(instance.school, instance.school_class, instance.section)

        instance.save()
        if choices is not None:
            from datetime import datetime
            existing_ids = set()
            for c in choices:
                fs_id = c.get('fee_structure_id')
                effective_from = c.get('effective_from')
                if fs_id:
                    eff_date = None
                    if effective_from:
                        try:
                            eff_date = datetime.strptime(effective_from, '%Y-%m-%d').date()
                        except (ValueError, TypeError):
                            pass
                    obj, _ = StudentFeeStructureChoice.objects.update_or_create(
                        student=instance,
                        fee_structure_id=fs_id,
                        defaults={'effective_from': eff_date}
                    )
                    existing_ids.add(obj.fee_structure_id)
            StudentFeeStructureChoice.objects.filter(student=instance).exclude(fee_structure_id__in=existing_ids).delete()
        return instance


class StudentListSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='get_class_display', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True, allow_null=True)
    pending_amount = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = ['id', 'name', 'school_class', 'section', 'class_name', 'section_name', 'parent_name', 'parent_phone', 'pending_amount']

    def get_pending_amount(self, obj):
        # Could be optimized with annotations
        return 0  # Placeholder - calculated in view


class FeeTypeSerializer(serializers.ModelSerializer):
    billing_period_display = serializers.CharField(source='get_billing_period_display', read_only=True)
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = FeeType
        fields = [
            'id', 'name', 'billing_period', 'billing_period_display', 'is_system', 'description', 'can_edit',
        ]

    def get_can_edit(self, obj):
        if obj.is_system and obj.school_id is None:
            return False
        request = self.context.get('request')
        if not request or not getattr(request.user, 'school_id', None):
            return False
        return obj.school_id == request.user.school_id

    def validate_name(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Fee type name is required.')
        return value

    def validate(self, attrs):
        request = self.context.get('request')
        school = getattr(request.user, 'school', None) if request else None
        if not school:
            return attrs
        name = attrs.get('name')
        if name is None and self.instance:
            name = self.instance.name
        if name:
            qs = FeeType.objects.filter(school=school, name__iexact=name.strip())
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({'name': 'A fee type with this name already exists for your school.'})
        return attrs


class FeeStructureSerializer(serializers.ModelSerializer):
    fee_type_name = serializers.CharField(source='fee_type.name', read_only=True)
    class_name = serializers.CharField(source='get_class_display', read_only=True)
    billing_period_display = serializers.CharField(source='fee_type.get_billing_period_display', read_only=True)
    fee_type_billing_period = serializers.CharField(source='fee_type.billing_period', read_only=True)
    is_locked = serializers.SerializerMethodField()

    class Meta:
        model = FeeStructure
        fields = ['id', 'fee_type', 'fee_type_name', 'school_class', 'class_name', 'amount', 
                  'billing_period_display', 'fee_type_billing_period', 'due_day', 'late_fine_per_day', 'academic_year', 'allow_yearly_payment',
                  'yearly_discount_percent', 'is_locked', 'created_at']

    def get_is_locked(self, obj):
        return (
            StudentFeeStructureChoice.objects.filter(fee_structure=obj).exists() or
            StudentFee.objects.filter(fee_structure=obj).exists()
        )


class FeeStructureBulkCreateSerializer(serializers.Serializer):
    """Create the same fee structure for multiple classes in one request."""

    fee_type = serializers.PrimaryKeyRelatedField(queryset=FeeType.objects.none())
    school_class_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        min_length=1,
    )
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    due_day = serializers.IntegerField(min_value=1, max_value=28, default=5)
    late_fine_per_day = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, default=0)
    academic_year = serializers.CharField(max_length=20)
    allow_yearly_payment = serializers.BooleanField(default=True)
    yearly_discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, default=0)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        school = getattr(request.user, 'school', None) if request else None
        if school:
            self.fields['fee_type'].queryset = FeeType.objects.filter(
                Q(school=school) | Q(school__isnull=True, is_system=True)
            )

    def validate_fee_type(self, value):
        school = self.context['request'].user.school
        if not school:
            raise serializers.ValidationError('Invalid fee type.')
        if not FeeType.objects.filter(
            Q(school=school) | Q(school__isnull=True, is_system=True),
            id=value.id,
        ).exists():
            raise serializers.ValidationError('Invalid fee type.')
        return value

    def validate_school_class_ids(self, value):
        school = self.context['request'].user.school
        if not school:
            raise serializers.ValidationError('No school assigned.')
        valid_ids = set(
            SchoolClass.objects.filter(school=school, id__in=value).values_list('id', flat=True)
        )
        invalid = [cid for cid in value if cid not in valid_ids]
        if invalid:
            raise serializers.ValidationError(f'Invalid class id(s): {", ".join(str(i) for i in invalid)}')
        return list(dict.fromkeys(value))

    def create(self, validated_data):
        school = self.context['request'].user.school
        class_ids = validated_data['school_class_ids']
        fee_type = validated_data['fee_type']
        academic_year = validated_data['academic_year']

        created = []
        skipped = []

        for class_id in class_ids:
            if FeeStructure.objects.filter(
                school=school,
                fee_type=fee_type,
                school_class_id=class_id,
                academic_year=academic_year,
            ).exists():
                school_class = SchoolClass.objects.filter(pk=class_id).first()
                skipped.append({
                    'school_class_id': class_id,
                    'class_name': school_class.name if school_class else str(class_id),
                    'reason': 'Fee structure already exists for this class and academic year.',
                })
                continue
            structure = FeeStructure.objects.create(
                school=school,
                fee_type=fee_type,
                school_class_id=class_id,
                amount=validated_data['amount'],
                due_day=validated_data['due_day'],
                late_fine_per_day=validated_data['late_fine_per_day'],
                academic_year=academic_year,
                allow_yearly_payment=validated_data['allow_yearly_payment'],
                yearly_discount_percent=validated_data['yearly_discount_percent'],
            )
            created.append(structure)

        if not created and skipped:
            raise serializers.ValidationError({
                'school_class_ids': 'Fee already exists for all selected classes in this academic year.',
            })
        if not created:
            raise serializers.ValidationError('No fee structures were created.')

        return {'created': created, 'skipped': skipped}


class FeePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeePayment
        fields = ['id', 'amount', 'discount', 'payment_date', 'payment_mode', 'transaction_id',
                  'receipt_number', 'notes', 'created_at']


class StudentFeeSerializer(serializers.ModelSerializer):
    fee_type_name = serializers.CharField(source='fee_structure.fee_type.name', read_only=True)
    student_name = serializers.CharField(source='student.name', read_only=True)
    class_name = serializers.CharField(source='student.get_class_display', read_only=True)
    paid_amount = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    payments = FeePaymentSerializer(many=True, read_only=True)

    class Meta:
        model = StudentFee
        fields = ['id', 'student', 'student_name', 'class_name', 'fee_structure', 'fee_type_name',
                  'month', 'year', 'amount', 'late_fine', 'total_amount', 'paid_amount', 'balance',
                  'due_date', 'payments', 'created_at']

    def get_paid_amount(self, obj):
        return sum(p.amount for p in obj.payments.all())

    def get_balance(self, obj):
        paid = sum(p.amount for p in obj.payments.all())
        return float(obj.total_amount) - paid


class StudentFeeCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentFee
        fields = ['student', 'fee_structure', 'month', 'year', 'amount', 'late_fine', 'total_amount', 'due_date']


# Expense Management Serializers

class ExpenseCategorySerializer(serializers.ModelSerializer):
    expense_count = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseCategory
        fields = ['id', 'name', 'description', 'color', 'icon', 'is_active', 'expense_count', 'created_at', 'updated_at']

    def get_expense_count(self, obj):
        return obj.expenses.count()


class VendorSerializer(serializers.ModelSerializer):
    expense_count = serializers.SerializerMethodField()

    class Meta:
        model = Vendor
        fields = ['id', 'name', 'contact_person', 'phone', 'email', 'address', 
                 'gst_number', 'pan_number', 'payment_terms', 'is_active', 
                 'expense_count', 'created_at', 'updated_at']

    def get_expense_count(self, obj):
        return obj.expenses.count()


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    payment_mode_display = serializers.CharField(source='get_payment_mode_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    receipt_url = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = ['id', 'title', 'description', 'amount', 'date', 'payment_mode', 
                 'payment_mode_display', 'reference_number', 'receipt', 'receipt_url',
                 'tags', 'is_recurring', 'recurring_interval', 'recurring_end_date',
                 'category', 'category_name', 'vendor', 'vendor_name', 
                 'created_by', 'created_by_name', 'created_at', 'updated_at']

    def get_receipt_url(self, obj):
        if obj.receipt:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.receipt.url)
        return None


class BudgetSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    spent_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    remaining_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    utilization_percentage = serializers.FloatField(read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = Budget
        fields = ['id', 'academic_year', 'planned_amount', 'spent_amount', 
                 'remaining_amount', 'utilization_percentage', 'status',
                 'alert_threshold_percentage', 'notes', 'category', 'category_name',
                 'created_at', 'updated_at']

    def get_status(self, obj):
        if obj.utilization_percentage >= 100:
            return 'exceeded'
        elif obj.utilization_percentage >= obj.alert_threshold_percentage:
            return 'warning'
        else:
            return 'on_track'


def _normalize_indian_phone(raw_phone: str) -> str:
    """Normalize to 10-digit Indian mobile. Use in field validators with a plain string error."""
    digits = "".join(ch for ch in (raw_phone or "").strip() if ch.isdigit())
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if len(digits) != 10:
        raise serializers.ValidationError("Enter a valid 10-digit phone number.")
    if digits[0] not in "6789":
        raise serializers.ValidationError("Phone number must start with 6, 7, 8, or 9.")
    return digits


class AdmissionEnquirySerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source="school_class.name", read_only=True, allow_null=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    source_display = serializers.CharField(source="get_source_display", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AdmissionEnquiry
        fields = [
            "id",
            "name",
            "phone",
            "parent_name",
            "email",
            "school_class",
            "class_name",
            "enquiry_date",
            "follow_up_date",
            "status",
            "status_display",
            "source",
            "source_display",
            "notes",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_by"]

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return ""
        return obj.created_by.get_full_name() or obj.created_by.username

    def validate_phone(self, value):
        return _normalize_indian_phone(value)

    def validate(self, attrs):
        school = getattr(self.instance, "school", None)
        if not school:
            request = self.context.get("request")
            if request and getattr(request.user, "school", None):
                school = request.user.school
        school_class = attrs.get("school_class") or getattr(self.instance, "school_class", None)
        if school_class and school and school_class.school_id != school.id:
            raise serializers.ValidationError({"school_class": "Class does not belong to your school."})
        return attrs


class ExpenseReportSerializer(serializers.Serializer):
    """Custom serializer for expense reports and analytics"""
    total_expenses = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_income = serializers.DecimalField(max_digits=12, decimal_places=2)
    net_profit = serializers.DecimalField(max_digits=12, decimal_places=2)
    expense_by_category = serializers.ListField()
    monthly_trends = serializers.ListField()
    top_vendors = serializers.ListField()
    budget_comparison = serializers.ListField()


class SchoolMessagingSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import SchoolMessagingSettings

        model = SchoolMessagingSettings
        fields = ["sms_enabled", "whatsapp_enabled", "updated_at"]
        read_only_fields = ["updated_at"]


class SendMessageSerializer(serializers.Serializer):
    channel = serializers.ChoiceField(choices=["sms", "whatsapp"])
    message_type = serializers.ChoiceField(choices=["payment", "result", "reminder", "custom"])
    student_ids = serializers.ListField(child=serializers.IntegerField(), min_length=1)
    custom_message = serializers.CharField(required=False, allow_blank=True, default="")
    invoice_id = serializers.IntegerField(required=False, allow_null=True)
