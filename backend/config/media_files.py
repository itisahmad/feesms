"""Helpers for serving and reading uploaded media (local disk or cloud storage)."""
from __future__ import annotations

import os
import tempfile
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from django.core.files import File
    from django.db.models.fields.files import FieldFile


def absolute_media_url(file_field: FieldFile | File | None, request=None) -> str | None:
    if not file_field:
        return None
    url = file_field.url
    if url.startswith(("http://", "https://")):
        return url
    if request is not None:
        return request.build_absolute_uri(url)
    return url


def local_file_path(file_field: FieldFile | File | None) -> str | None:
    """Filesystem path for ReportLab etc.; downloads remote files to a temp path."""
    if not file_field:
        return None
    try:
        return file_field.path
    except (NotImplementedError, ValueError, AttributeError):
        pass

    suffix = os.path.splitext(file_field.name)[-1] or ".bin"
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    with file_field.open("rb") as src, open(path, "wb") as dst:
        dst.write(src.read())
    return path
