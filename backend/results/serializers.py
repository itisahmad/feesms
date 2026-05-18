from rest_framework import serializers

from schools.models import SchoolClass

from .grading import DEFAULT_BANDS, normalize_bands
from .models import ExamResult, SchoolGradingSettings, StudentExamMark


class ExamResultListSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='school_class.name', read_only=True)
    marks_count = serializers.SerializerMethodField()
    students_count = serializers.SerializerMethodField()

    class Meta:
        model = ExamResult
        fields = [
            'id', 'name', 'school_class', 'class_name', 'exam_date', 'max_marks',
            'status', 'marks_count', 'students_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_marks_count(self, obj):
        return obj.marks.count()

    def get_students_count(self, obj):
        return obj.marks.values('student_id').distinct().count()


class ExamResultSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='school_class.name', read_only=True)

    class Meta:
        model = ExamResult
        fields = [
            'id', 'name', 'school_class', 'class_name', 'exam_date', 'max_marks',
            'status', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate_school_class(self, school_class):
        school = self.context.get('school')
        if school and school_class.school_id != school.id:
            raise serializers.ValidationError('Class does not belong to your school.')
        return school_class


class StudentExamMarkSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    subject_name = serializers.CharField(source='class_subject.name', read_only=True)

    class Meta:
        model = StudentExamMark
        fields = [
            'id', 'student', 'student_name', 'class_subject', 'subject_name',
            'marks_obtained', 'max_marks', 'is_absent', 'grade', 'remarks', 'updated_at',
        ]


class BulkMarkEntrySerializer(serializers.Serializer):
    student_id = serializers.IntegerField()
    class_subject_id = serializers.IntegerField()
    marks_obtained = serializers.DecimalField(
        max_digits=8, decimal_places=2, required=False, allow_null=True,
    )
    is_absent = serializers.BooleanField(required=False, default=False)
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=255)


class BulkMarksSerializer(serializers.Serializer):
    marks = BulkMarkEntrySerializer(many=True)


class GradingBandSerializer(serializers.Serializer):
    grade = serializers.CharField(max_length=8)
    min_percentage = serializers.FloatField(min_value=0, max_value=100)


class SchoolGradingSettingsSerializer(serializers.ModelSerializer):
    default_bands = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SchoolGradingSettings
        fields = ['absent_grade', 'bands', 'default_bands', 'updated_at']
        read_only_fields = ['updated_at']

    def get_default_bands(self, obj):
        return DEFAULT_BANDS

    def validate_absent_grade(self, value):
        label = (value or '').strip()
        if not label:
            raise serializers.ValidationError('Absent grade label is required.')
        return label[:8]

    def validate_bands(self, value):
        try:
            return normalize_bands(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
