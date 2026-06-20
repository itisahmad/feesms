from rest_framework import serializers

from config.media_files import absolute_media_url
from config.serializer_mixins import CloudFileUpdateMixin, OptionalImageField
from .models import SchoolReceiptSettings
from .templates_registry import TEMPLATE_CATALOG, TEMPLATE_KEYS


class ReceiptTemplateSerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()
    supports_a4 = serializers.BooleanField()
    supports_thermal = serializers.BooleanField()


class SchoolReceiptSettingsSerializer(CloudFileUpdateMixin, serializers.ModelSerializer):
    signature_image = OptionalImageField(required=False, allow_null=True)
    signature_image_url = serializers.SerializerMethodField()
    clear_signature_image = serializers.BooleanField(write_only=True, required=False, default=False)

    file_field_names = ('signature_image',)
    clear_field_map = {'clear_signature_image': 'signature_image'}

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
            'signature_image',
            'signature_image_url',
            'clear_signature_image',
            'stamp_text',
            'show_logo',
            'updated_at',
        ]
        read_only_fields = ['updated_at', 'signature_image_url']

    def get_signature_image_url(self, obj):
        return absolute_media_url(obj.signature_image, self.context.get('request'))

    def validate_template_key(self, value):
        if value not in TEMPLATE_KEYS:
            raise serializers.ValidationError('Invalid template.')
        return value

    def validate_header_color(self, value):
        v = (value or '').strip()
        if not v.startswith('#') or len(v) not in (4, 7):
            raise serializers.ValidationError('Use a hex color like #0d9488.')
        return v

    def update(self, instance, validated_data):
        if self.partial:
            return self._apply_cloud_file_update(instance, validated_data)
        return super().update(instance, validated_data)


def catalog_serializer_data():
    return ReceiptTemplateSerializer(TEMPLATE_CATALOG, many=True).data
