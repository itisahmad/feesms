"""
Vercel serverless entrypoint — exposes Django as a WSGI application.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings_production")

from django.core.wsgi import get_wsgi_application

app = get_wsgi_application()
