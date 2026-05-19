from rest_framework import serializers

from schools.models import SchoolClass

from .models import Announcement, AnnouncementDelivery, AnnouncementGroupDelivery
from .services import preview_recipient_count, preview_whatsapp_group_count


class AnnouncementGroupDeliverySerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = AnnouncementGroupDelivery
        fields = [
            'id',
            'class_name',
            'whatsapp_group_link',
            'status',
            'status_display',
            'error_message',
            'created_at',
        ]


class AnnouncementDeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = AnnouncementDelivery
        fields = [
            'id',
            'parent_phone',
            'student_name',
            'class_name',
            'channel',
            'status',
            'error_message',
            'created_at',
        ]


class AnnouncementListSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    audience_label = serializers.CharField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    channel_display = serializers.CharField(source='get_channel_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            'id',
            'title',
            'category',
            'category_display',
            'audience_type',
            'audience_label',
            'target_class_ids',
            'channel',
            'channel_display',
            'status',
            'status_display',
            'recipient_count',
            'post_to_whatsapp_groups',
            'sent_sms',
            'sent_whatsapp',
            'failed_count',
            'whatsapp_groups_targeted',
            'whatsapp_groups_posted',
            'whatsapp_groups_failed',
            'whatsapp_groups_link_only',
            'sent_at',
            'created_by_name',
            'created_at',
        ]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.email
        return ''


class AnnouncementSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    audience_label = serializers.CharField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    channel_display = serializers.CharField(source='get_channel_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    deliveries = AnnouncementDeliverySerializer(many=True, read_only=True)
    group_deliveries = AnnouncementGroupDeliverySerializer(many=True, read_only=True)
    target_class_names = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            'id',
            'title',
            'body',
            'category',
            'category_display',
            'audience_type',
            'audience_label',
            'target_class_ids',
            'target_class_names',
            'channel',
            'channel_display',
            'post_to_whatsapp_groups',
            'status',
            'status_display',
            'recipient_count',
            'sent_sms',
            'sent_whatsapp',
            'failed_count',
            'whatsapp_groups_targeted',
            'whatsapp_groups_posted',
            'whatsapp_groups_failed',
            'whatsapp_groups_link_only',
            'sent_at',
            'created_by_name',
            'created_at',
            'updated_at',
            'deliveries',
            'group_deliveries',
        ]
        read_only_fields = [
            'status',
            'recipient_count',
            'sent_sms',
            'sent_whatsapp',
            'failed_count',
            'whatsapp_groups_targeted',
            'whatsapp_groups_posted',
            'whatsapp_groups_failed',
            'whatsapp_groups_link_only',
            'sent_at',
            'created_at',
            'updated_at',
        ]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.email
        return ''

    def get_target_class_names(self, obj):
        ids = obj.target_class_ids or []
        if not ids:
            return []
        return list(
            SchoolClass.objects.filter(school_id=obj.school_id, id__in=ids)
            .order_by('display_order', 'name')
            .values_list('name', flat=True)
        )

    def validate(self, attrs):
        audience_type = attrs.get(
            'audience_type',
            getattr(self.instance, 'audience_type', Announcement.AUDIENCE_ALL),
        )
        class_ids = attrs.get('target_class_ids')
        if class_ids is None and self.instance:
            class_ids = self.instance.target_class_ids or []
        class_ids = class_ids or []

        if audience_type == Announcement.AUDIENCE_CLASSES and not class_ids:
            raise serializers.ValidationError({'target_class_ids': 'Select at least one class.'})

        school = self.context['request'].user.school
        if class_ids and school:
            valid = set(SchoolClass.objects.filter(school=school, id__in=class_ids).values_list('id', flat=True))
            invalid = [cid for cid in class_ids if cid not in valid]
            if invalid:
                raise serializers.ValidationError({'target_class_ids': 'One or more classes are invalid.'})

        if self.instance and self.instance.status == Announcement.STATUS_SENT:
            raise serializers.ValidationError('Sent announcements cannot be edited.')

        return attrs

class RecipientPreviewSerializer(serializers.Serializer):
    audience_type = serializers.ChoiceField(choices=Announcement.AUDIENCE_CHOICES)
    target_class_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
        default=list,
    )

    def validate(self, attrs):
        if attrs['audience_type'] == Announcement.AUDIENCE_CLASSES and not attrs.get('target_class_ids'):
            raise serializers.ValidationError({'target_class_ids': 'Select at least one class.'})
        return attrs

    def save(self, **kwargs):
        school = self.context['request'].user.school
        audience_type = self.validated_data['audience_type']
        class_ids = self.validated_data.get('target_class_ids') or []
        return {
            'recipient_count': preview_recipient_count(school, audience_type, class_ids),
            'whatsapp_group_count': preview_whatsapp_group_count(school, audience_type, class_ids),
        }
