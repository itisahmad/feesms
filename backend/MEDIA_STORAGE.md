# Media uploads on Vercel

Vercel serverless functions use a **read-only filesystem**. Django cannot save uploaded files to `/var/task/media/`.

Configure **S3-compatible object storage** (recommended: [Cloudflare R2](https://developers.cloudflare.com/r2/) — free tier, no egress fees).

## Environment variables (Vercel project → Settings → Environment Variables)

| Variable | Example | Required |
|----------|---------|----------|
| `AWS_STORAGE_BUCKET_NAME` | `feesms-media` | Yes |
| `AWS_ACCESS_KEY_ID` | R2 access key ID | Yes |
| `AWS_SECRET_ACCESS_KEY` | R2 secret | Yes |
| `AWS_S3_ENDPOINT_URL` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | Yes for R2 |
| `AWS_S3_REGION_NAME` | `auto` | R2 |
| `AWS_S3_CUSTOM_DOMAIN` | `pub-xxxx.r2.dev` or your CDN domain | Yes for public image URLs |

Local development **without** these variables keeps using `backend/media/` on disk (unchanged).

## Cloudflare R2 quick setup

1. Cloudflare dashboard → **R2** → Create bucket (e.g. `feesms-media`).
2. **Manage R2 API tokens** → Create token with Object Read & Write on that bucket.
3. Enable **public access** for the bucket (R2.dev subdomain or custom domain).
4. Add the env vars above to Vercel (Production + Preview).
5. Redeploy the backend.

## AWS S3

Omit `AWS_S3_ENDPOINT_URL`. Set `AWS_S3_REGION_NAME` to your region (e.g. `ap-south-1`).  
Make the bucket public for read, or use CloudFront + `AWS_S3_CUSTOM_DOMAIN`.

## What uses cloud storage

- School logo (`/api/schools/{id}/`)
- Expense receipts
- Receipt signature images

After configuration, existing DB paths still work; only **new uploads** go to the bucket.
