"""Reusable serializer helpers for cloud-backed ImageField/FileField updates."""
from __future__ import annotations

from rest_framework import serializers


class CloudFileUpdateMixin:
    """
    On partial PATCH, only persist fields present in validated_data so existing
    cloud/local files are not re-written to storage.
    """

    file_field_names: tuple[str, ...] = ()
    clear_field_map: dict[str, str] = {}

    def _apply_cloud_file_update(self, instance, validated_data: dict):
        update_fields: list[str] = []

        for clear_key, field_name in self.clear_field_map.items():
            if validated_data.pop(clear_key, False):
                file_field = getattr(instance, field_name, None)
                if file_field:
                    file_field.delete(save=False)
                    setattr(instance, field_name, None)
                    update_fields.append(field_name)

        for field_name in self.file_field_names:
            if field_name not in validated_data:
                continue
            setattr(instance, field_name, validated_data.pop(field_name))
            update_fields.append(field_name)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
            update_fields.append(attr)

        if update_fields:
            instance.save(update_fields=update_fields)
        return instance


class OptionalImageField(serializers.ImageField):
    """Ignore empty strings from multipart forms; only accept real uploads."""

    def to_internal_value(self, data):
        if data in (None, '', b''):
            return serializers.empty
        return super().to_internal_value(data)
