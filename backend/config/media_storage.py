"""Cloud media storage for serverless (Vercel) — local disk in development."""
from __future__ import annotations

import os
from typing import Any


def apply_media_storage_settings(globals_dict: dict[str, Any]) -> bool:
    """
    When AWS_STORAGE_BUCKET_NAME is set, store uploads in S3-compatible object storage
    (AWS S3, Cloudflare R2, etc.). Otherwise keep Django's default local filesystem.
    """
    bucket = os.getenv("AWS_STORAGE_BUCKET_NAME", "").strip()
    if not bucket:
        globals_dict["USE_CLOUD_MEDIA"] = False
        return False

    installed = list(globals_dict.get("INSTALLED_APPS", []))
    if "storages" not in installed:
        globals_dict["INSTALLED_APPS"] = installed + ["storages"]

    endpoint = os.getenv("AWS_S3_ENDPOINT_URL", "").strip() or None
    custom_domain = os.getenv("AWS_S3_CUSTOM_DOMAIN", "").strip() or None

    options: dict[str, Any] = {
        "access_key": os.getenv("AWS_ACCESS_KEY_ID", ""),
        "secret_key": os.getenv("AWS_SECRET_ACCESS_KEY", ""),
        "bucket_name": bucket,
        "region_name": os.getenv("AWS_S3_REGION_NAME", "auto"),
        "default_acl": None,
        "querystring_auth": False,
        "file_overwrite": False,
    }
    if endpoint:
        options["endpoint_url"] = endpoint
    if custom_domain:
        options["custom_domain"] = custom_domain

    static_backend = (
        globals_dict.get("STORAGES", {})
        .get("staticfiles", {})
        .get("BACKEND", "django.contrib.staticfiles.storage.StaticFilesStorage")
    )

    globals_dict["STORAGES"] = {
        "default": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": options,
        },
        "staticfiles": {
            "BACKEND": static_backend,
        },
    }

    if custom_domain:
        globals_dict["MEDIA_URL"] = f"https://{custom_domain}/"

    globals_dict["USE_CLOUD_MEDIA"] = True
    return True
