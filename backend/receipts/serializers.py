from rest_framework import serializers

from .models import SchoolReceiptSettings
from .templates_registry import TEMPLATE_CATALOG, TEMPLATE_KEYS


class ReceiptTemplateSerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()
    supports_a4 = serializers.BooleanField()
    supports_thermal = serializers.BooleanField()


class SchoolReceiptSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolReceiptSettings
        fields = [
            'template_key',
            'print_format',
            'school_name',
            'address',
            'phone',
            'email',
            'header_color',
            'footer_text',
            'signature_label',
            'stamp_text',
            'show_logo',
            'updated_at',
        ]
        read_only_fields = ['updated_at']

    def validate_template_key(self, value):
        if value not in TEMPLATE_KEYS:
            raise serializers.ValidationError('Invalid template.')
        return value

    def validate_header_color(self, value):
        v = (value or '').strip()
        if not v.startswith('#') or len(v) not in (4, 7):
            raise serializers.ValidationError('Use a hex color like #0d9488.')
        return v


def catalog_serializer_data():
    return ReceiptTemplateSerializer(TEMPLATE_CATALOG, many=True).data
