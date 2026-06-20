# Media uploads on Vercel (Cloudinary)

Vercel serverless functions use a **read-only filesystem**. User uploads (school logos, receipt signatures, expense receipts) are stored in **Cloudinary**.

Django admin / API static assets continue to use **WhiteNoise** at build time.

## Environment variables

Set **one** of these on Vercel (Settings → Environment Variables) and in local `backend/.env`:

### Option A — single URL (recommended)

```
CLOUDINARY_URL=cloudinary://<API_KEY>:<API_SECRET>@<CLOUD_NAME>
```

Example (replace with your values from the Cloudinary dashboard):

```
CLOUDINARY_URL=cloudinary://171419331137431:YOUR_API_SECRET@dwysuowan
```

### Option B — separate variables

| Variable | Value |
|----------|--------|
| `CLOUDINARY_CLOUD_NAME` | `dwysuowan` |
| `CLOUDINARY_API_KEY` | Your API key |
| `CLOUDINARY_API_SECRET` | Your API secret |

## Local development

- **With** `CLOUDINARY_URL` in `backend/.env` → uploads go to Cloudinary (same as production).
- **Without** Cloudinary env vars → uploads save to `backend/media/` on disk.

## After setup

1. Add `CLOUDINARY_URL` to Vercel (Production + Preview).
2. Redeploy the backend.
3. Upload a school logo in Settings — the image URL should be `https://res.cloudinary.com/dwysuowan/...`.

## Upload folders (dynamic)

Django `upload_to` paths map to Cloudinary folders:

| Model field | Folder |
|-------------|--------|
| School logo | `school_logos/` |
| Expense receipt | `expense_receipts/` |
| Receipt signature | `receipt_signatures/` |

## Security

Never commit API secrets to git. Keep them only in `.env` (local) and Vercel environment variables.
