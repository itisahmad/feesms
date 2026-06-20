"""Cloud media storage — Cloudinary on serverless (Vercel), local disk in development."""
from __future__ import annotations

import os
import re
from typing import Any
from urllib.parse import unquote


def _cloudinary_credentials() -> tuple[str, str, str] | None:
    """Read Cloudinary credentials from CLOUDINARY_URL or separate env vars."""
    url = os.getenv("CLOUDINARY_URL", "").strip()
    if url:
        match = re.match(r"cloudinary://([^:]+):([^@]+)@(.+)", url)
        if match:
            api_key, api_secret, cloud_name = match.groups()
            return unquote(api_key), unquote(api_secret), unquote(cloud_name)

    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
    api_key = os.getenv("CLOUDINARY_API_KEY", "").strip()
    api_secret = os.getenv("CLOUDINARY_API_SECRET", "").strip()
    if cloud_name and api_key and api_secret:
        return api_key, api_secret, cloud_name
    return None


def apply_media_storage_settings(globals_dict: dict[str, Any]) -> bool:
    """
    When Cloudinary credentials are set, store uploads in Cloudinary.
    Otherwise keep Django's default local filesystem (local dev).
    """
    creds = _cloudinary_credentials()
    if not creds:
        globals_dict["USE_CLOUD_MEDIA"] = False
        return False

    api_key, api_secret, cloud_name = creds

    installed = list(globals_dict.get("INSTALLED_APPS", []))
    for app in ("cloudinary_storage", "cloudinary"):
        if app not in installed:
            installed.append(app)
    globals_dict["INSTALLED_APPS"] = installed

    globals_dict["CLOUDINARY_STORAGE"] = {
        "CLOUD_NAME": cloud_name,
        "API_KEY": api_key,
        "API_SECRET": api_secret,
        "SECURE": True,
    }

    static_backend = (
        globals_dict.get("STORAGES", {})
        .get("staticfiles", {})
        .get("BACKEND", "django.contrib.staticfiles.storage.StaticFilesStorage")
    )

    globals_dict["STORAGES"] = {
        "default": {
            "BACKEND": "cloudinary_storage.storage.MediaCloudinaryStorage",
        },
        "staticfiles": {
            "BACKEND": static_backend,
        },
    }

    globals_dict["MEDIA_URL"] = f"https://res.cloudinary.com/{cloud_name}/"
    globals_dict["USE_CLOUD_MEDIA"] = True
    return True
