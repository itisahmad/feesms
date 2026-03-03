"""
REST API Serializers
"""
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User, School, SchoolClass, Section, Student, FeeType, FeeStructure, StudentFeeStructureChoice, StudentFee, FeePayment


class UserSerializer(serializers.ModelSerializer):
    school_name = serializers.CharField(source='school.name', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'phone', 'school', 'school_name']
        read_only_fields = ['school']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)
    school_name = serializers.CharField(write_only=True)
    school_city = serializers.CharField(write_only=True, required=False, default='Muzaffarpur')
    school_phone = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'password2', 'first_name', 'last_name', 'phone',
                  'school_name', 'school_city', 'school_phone']

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

        # Create default classes for Bihar schools
        from .models import Section
        default_classes = ['Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10']
        for i, name in enumerate(default_classes):
            sc = SchoolClass.objects.create(school=school, name=name, display_order=i)
            Section.objects.create(school_class=sc, name='A', display_order=0)

        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            phone=validated_data.get('phone', ''),
            role='owner',
            school=school,
        )
        return user


class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = ['id', 'name', 'address', 'city', 'state', 'phone', 'email', 'logo', 'plan',
                  'max_students', 'max_staff_logins', 'academic_year_start_month', 'trial_ends_at', 'created_at']


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ['id', 'name', 'display_order']


class SchoolClassSerializer(serializers.ModelSerializer):
    sections = SectionSerializer(many=True, read_only=True)
    section_names = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)

    class Meta:
        model = SchoolClass
        fields = ['id', 'name', 'display_order', 'sections', 'section_names', 'created_at']

    def create(self, validated_data):
        section_names = validated_data.pop('section_names', ['A'])
        school_class = SchoolClass.objects.create(**validated_data)
        for i, name in enumerate(section_names):
            Section.objects.create(school_class=school_class, name=name.strip(), display_order=i)
        return school_class


class StudentSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='get_class_display', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True, allow_null=True)
    fee_structure_choices = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model = Student
        fields = ['id', 'name', 'school_class', 'section', 'class_name', 'section_name', 'admission_date', 'charges_effective_from', 'uses_transport', 'parent_name', 'parent_phone', 'parent_email',
                  'admission_number', 'roll_number', 'is_active', 'fee_structure_choices', 'created_at']

    def create(self, validated_data):
        choices = validated_data.pop('fee_structure_choices', [])
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
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
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
    class Meta:
        model = FeeType
        fields = ['id', 'name', 'category', 'is_system', 'description']


class FeeStructureSerializer(serializers.ModelSerializer):
    fee_type_name = serializers.CharField(source='fee_type.name', read_only=True)
    class_name = serializers.CharField(source='get_class_display', read_only=True)
    billing_period_display = serializers.CharField(source='get_billing_period_display', read_only=True)
    is_locked = serializers.SerializerMethodField()

    class Meta:
        model = FeeStructure
        fields = ['id', 'fee_type', 'fee_type_name', 'school_class', 'class_name', 'amount', 'billing_period',
                  'billing_period_display', 'due_day', 'late_fine_per_day', 'academic_year', 'allow_yearly_payment',
                  'yearly_discount_percent', 'is_locked', 'created_at']

    def get_is_locked(self, obj):
        return (
            StudentFeeStructureChoice.objects.filter(fee_structure=obj).exists() or
            StudentFee.objects.filter(fee_structure=obj).exists()
        )


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
