from rest_framework import serializers

from schools.models import SchoolClass, Section, Student, User

from .models import AttendanceRecord, AttendanceSession, ClassTeacherAssignment


class ClassTeacherAssignmentSerializer(serializers.ModelSerializer):
    staff_username = serializers.CharField(source='staff_user.username', read_only=True)
    staff_name = serializers.SerializerMethodField()
    class_name = serializers.CharField(source='school_class.name', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)

    class Meta:
        model = ClassTeacherAssignment
        fields = [
            'id',
            'staff_user',
            'staff_username',
            'staff_name',
            'school_class',
            'class_name',
            'section',
            'section_name',
            'assigned_at',
        ]
        read_only_fields = ['assigned_at']

    def get_staff_name(self, obj):
        name = f'{obj.staff_user.first_name} {obj.staff_user.last_name}'.strip()
        return name or obj.staff_user.username


class BulkAssignmentSerializer(serializers.Serializer):
    staff_user_id = serializers.IntegerField()
    assignments = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=True,
    )


class AttendanceRecordSerializer(serializers.ModelSerializer):
    student_id = serializers.IntegerField(source='student.id', read_only=True)
    student_name = serializers.CharField(source='student.name', read_only=True)
    roll_number = serializers.CharField(source='student.roll_number', read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = ['id', 'student_id', 'student_name', 'roll_number', 'status', 'remark']


class AttendanceSessionSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='school_class.name', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    records = AttendanceRecordSerializer(many=True, read_only=True)
    marked_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceSession
        fields = [
            'id',
            'school_class',
            'section',
            'class_name',
            'section_name',
            'date',
            'status',
            'notes',
            'finalized_at',
            'marked_by',
            'marked_by_name',
            'records',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['status', 'finalized_at', 'marked_by', 'created_at', 'updated_at']

    def get_marked_by_name(self, obj):
        if not obj.marked_by_id:
            return ''
        u = obj.marked_by
        return (f'{u.first_name} {u.last_name}'.strip() or u.username)


class AttendanceSessionListSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='school_class.name', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    present_count = serializers.SerializerMethodField()
    absent_count = serializers.SerializerMethodField()
    total_count = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceSession
        fields = [
            'id',
            'school_class',
            'section',
            'class_name',
            'section_name',
            'date',
            'status',
            'present_count',
            'absent_count',
            'total_count',
        ]

    def get_present_count(self, obj):
        return obj.records.filter(status=AttendanceRecord.STATUS_PRESENT).count()

    def get_absent_count(self, obj):
        return obj.records.exclude(status=AttendanceRecord.STATUS_PRESENT).count()

    def get_total_count(self, obj):
        return obj.records.count()


class CreateSessionSerializer(serializers.Serializer):
    school_class = serializers.IntegerField()
    section = serializers.IntegerField()
    date = serializers.DateField()


class UpdateRecordsSerializer(serializers.Serializer):
    records = serializers.ListField(child=serializers.DictField())
    notes = serializers.CharField(required=False, allow_blank=True)
