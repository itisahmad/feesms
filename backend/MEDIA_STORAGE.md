# Media uploads on Vercel (Cloudinary)

## Root cause

Vercel serverless functions use a **read-only filesystem**. Django's default `FileSystemStorage` writes to `MEDIA_ROOT` (`/var/task/media` on Vercel), which raises:

```
OSError: [Errno 30] Read-only file system: '/var/task/media'
```

This happens on `PATCH /api/schools/<id>/` when an `ImageField` (school logo) is saved.

## Fix

1. **Production** uses **Cloudinary** via `django-cloudinary-storage` (`STORAGES['default']`).
2. **Local dev** without `CLOUDINARY_URL` keeps using `backend/media/`.
3. **Partial PATCH** only saves fields that changed (`update_fields`) so existing logos are not re-written when updating name/city/etc.

## Required Vercel environment variable

```
CLOUDINARY_URL=cloudinary://<API_KEY>:<API_SECRET>@dwysuowan
```

Or separate vars: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

Production **fails at startup** if Cloudinary is not configured (`ImproperlyConfigured`).

## Upload folders

| Field | Cloudinary folder |
|-------|-------------------|
| School logo | `school_logos/` |
| Expense receipt | `expense_receipts/` |
| Receipt signature | `receipt_signatures/` |

## Testing

### Local (with Cloudinary in `.env`)

```bash
cd backend && source venv/bin/activate
python manage.py check
python manage.py test schools.tests.test_school_upload
```

### Verify storage backend

```bash
python -c "import django; import os; os.environ['DJANGO_SETTINGS_MODULE']='config.settings'; django.setup(); from django.conf import settings; print(settings.STORAGES['default'])"
```

### Manual API checks

1. **PATCH without image** — update name only → `200`, logo unchanged.
2. **PATCH with image** — multipart `logo` file → `200`, `logo_url` is `https://res.cloudinary.com/dwysuowan/...`.
3. **PATCH academic fields** — JSON `academic_year_start_month` → `200`, no file write.

## Migration impact

**None.** Storage backend is a deployment setting; database columns are unchanged. Existing local paths in DB continue to work for reads until re-uploaded to Cloudinary.
