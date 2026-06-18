# Public School Website — Feature Spec & Cursor Implementation Prompt

> **Purpose of this document:** Hand this file to Cursor (Agent mode) when you are ready to build the **Public School Website** feature. It is the single source of truth for scope, architecture, and acceptance criteria.
>
> **Important:** All backend logic for this feature must live in a **new dedicated Django app** named `public_website`. Do not scatter logic across `schools`, `announcements`, or other apps. Other apps may be **read** via FKs and public-safe queries only.

---

## Product summary

School owners configure a **public marketing website** from the existing dashboard (Settings or a new **Website** nav item). They pick one of **5 themes**, edit content (about, hero, contact, gallery, etc.), preview, and publish. The live site is served from the same SchoolFee Pro platform and reads data from the backend.

**Two URL modes:**

| Mode | Example | Plan |
|------|---------|------|
| **Platform subdomain** (included) | `flynn-school.schoolfeepro.com` | Standard+ |
| **Custom domain** (premium add-on) | `www.shrischool.edu.in` | Premium / paid add-on |

The public site is **read-mostly**. It does **not** replace the private dashboard. It links to the existing parent portal (`/parent/login`) and optionally an enquiry/admission form.

---

## Architecture rules (non-negotiable)

1. **New Django app:** `backend/public_website/` — models, serializers, views, services, URLs, admin, migrations, tests.
2. **Register app** in `config/settings.py` → `INSTALLED_APPS`.
3. **Mount URLs** under `/api/public-website/` (authenticated dashboard APIs) and `/api/public/` (unauthenticated read APIs for the live site).
4. **No business logic in `schools` views** for website features. `schools` may expose read-only helpers if needed, but prefer imports from `public_website.services`.
5. **Frontend:** New route group for the public site (e.g. `frontend/src/app/site/[slug]/`) and dashboard editor (e.g. `frontend/src/app/dashboard/website/` or a section under Settings).
6. **Tenant isolation:** Every row is scoped by `school_id`. Public APIs resolve school by `slug` or `custom_domain` — never leak another school’s data.
7. **Security:** Public APIs return only allowlisted fields. Never expose student PII, fee amounts, staff credentials, or internal IDs beyond what’s needed.

---

## Cursor master prompt (copy-paste to start the build)

```
Build the Public School Website feature for SchoolFee Pro per public_website_for_the_school.md.

Backend:
- Create Django app `public_website` with all models, services, serializers, views, URLs, admin, migrations, and tests.
- Register in INSTALLED_APPS and wire URLs in config/urls.py.
- Implement Phase 1 completely before starting Phase 2.

Frontend:
- Dashboard editor for school owners (theme picker, content form, preview, publish toggle).
- Public site at /site/[slug] using one theme first, then expand to 5.

Constraints:
- Reuse existing School model (FK) — do not duplicate school name/address/logo storage; reference or sync via services.
- Pull published announcements from announcements app for the Notices section.
- Optional enquiry form posts to existing enquiries module if present.
- Match existing code style (SchoolScopedMixin, HasModulePermission, GlassCard dashboard UI, api.ts patterns).
- Add API helpers in frontend/src/lib/api.ts.
- Do not break existing auth, fees, or parent portal flows.

Deliver Phase 1 with tests and a short public_website/README.md in the app folder.
```

---

## Phased rollout

### Phase 1 — MVP (build this first)

**Goal:** One working theme, subdomain slug, dashboard editor, live public page.

| Item | Detail |
|------|--------|
| Theme count | 1 theme (`classic`) — prove pipeline |
| URL | `/{slug}` on main domain OR `site/[slug]` path; store `slug` for future subdomain |
| Sections | Hero, About, Contact, Notices (from announcements), Parent login CTA |
| Dashboard | Owner can edit content, pick publish on/off, copy public URL |
| API | Public read endpoint; authenticated CRUD for owner |

**Phase 1 acceptance criteria:**

- [ ] Owner saves website settings from dashboard without errors.
- [ ] Unauthenticated visitor opens public URL and sees school name, logo, about, contact.
- [ ] Published announcements (status=sent, flagged `show_on_website` or last N) appear on the site.
- [ ] “Parent login” button links to `/parent/login` with school code shown or pre-filled hint.
- [ ] Unpublished site returns 404 or “Coming soon” for public visitors.
- [ ] Another school’s data is never visible when using a slug.

---

### Phase 2 — Five themes + preview

| Item | Detail |
|------|--------|
| Themes | `classic`, `modern`, `academic`, `bold`, `minimal` — same content slots, different layout/CSS |
| Preview | “Preview” button in dashboard opens draft in new tab (token or `?preview=1` with owner session) |
| Gallery | Up to 12 images (upload to `public_website/gallery/`) |
| Social links | Facebook, Instagram, YouTube, WhatsApp (optional) |
| SEO | `meta_title`, `meta_description`, `og_image` |

---

### Phase 3 — Subdomain + custom domain

| Item | Detail |
|------|--------|
| Platform subdomain | `slug.schoolfeepro.com` via wildcard DNS (document Vercel/Cloudflare steps in README) |
| Custom domain | Owner enters domain; system shows CNAME instructions; `custom_domain` field + verification status |
| Domain states | `pending`, `verified`, `failed` |
| Premium gate | Custom domain only if `school.plan == premium` or `website_custom_domain_enabled` flag |

---

### Phase 4 — Monetization & premium content

| Feature | Basic | Standard | Premium |
|---------|-------|----------|---------|
| Public website | ❌ or placeholder | ✅ 1 theme + subdomain | ✅ all 5 themes |
| Extra pages | ❌ | Principal message | Gallery + Facilities + Admissions |
| Custom domain | ❌ | ❌ | ✅ |
| Remove branding | ❌ | ❌ | ✅ “Powered by SchoolFee Pro” optional |
| Enquiry form | ❌ | ✅ basic | ✅ + email notify owner |

Implement plan checks in `public_website.services.plan_gates`.

---

## Django app structure (`backend/public_website/`)

```
public_website/
├── __init__.py
├── apps.py
├── admin.py
├── models.py
├── serializers.py
├── views/
│   ├── __init__.py
│   ├── dashboard.py      # authenticated owner/staff APIs
│   └── public.py         # AllowAny read APIs
├── services/
│   ├── __init__.py
│   ├── content.py        # merge school + website settings + announcements
│   ├── slug.py           # generate unique slug from school name
│   ├── plan_gates.py     # plan / feature flags
│   └── domain.py           # custom domain verification helpers (Phase 3)
├── urls.py
├── migrations/
├── tests/
│   ├── test_models.py
│   ├── test_public_api.py
│   └── test_dashboard_api.py
└── README.md
```

---

## Data models

### `SchoolWebsite` (one-to-one with `schools.School`)

| Field | Type | Notes |
|-------|------|-------|
| `school` | OneToOneField → School | CASCADE |
| `slug` | CharField, unique | URL identifier, e.g. `flynn-kinney-school` |
| `theme_key` | CharField | `classic`, `modern`, `academic`, `bold`, `minimal` |
| `is_published` | Boolean | default False |
| `custom_domain` | CharField, blank | e.g. `www.shrischool.edu.in` |
| `domain_status` | CharField | `none`, `pending`, `verified`, `failed` |
| `content` | JSONField | structured content (see schema below) |
| `seo_title` | CharField, blank | |
| `seo_description` | TextField, blank | |
| `show_powered_by` | Boolean | default True; Premium can set False |
| `created_at` / `updated_at` | DateTime | |

**Do not duplicate** `School.name`, `address`, `city`, `state`, `phone`, `email`, `logo` — read from `School` at render time. Store only website-specific overrides in `content` if needed (e.g. `hero_title` overrides default school name).

### `WebsiteGalleryImage` (optional Phase 2)

| Field | Type |
|-------|------|
| `website` | FK → SchoolWebsite |
| `image` | ImageField |
| `caption` | CharField, blank |
| `display_order` | Integer |

### `WebsiteEnquiry` (optional Phase 4 — or reuse `schools` Enquiry)

If reusing existing Enquiry model, add `source=website` field there via migration in the appropriate app; **website submission endpoint stays in `public_website`**.

---

## `content` JSON schema (versioned)

```json
{
  "version": 1,
  "hero": {
    "title": "Welcome to Flynn Kinney School",
    "subtitle": "Excellence in education since 1998",
    "banner_image": null
  },
  "about": {
    "heading": "About us",
    "body_html": "<p>...</p>"
  },
  "principal_message": {
    "enabled": false,
    "name": "",
    "photo": null,
    "body_html": ""
  },
  "contact": {
    "show_map": true,
    "map_embed_url": "",
    "whatsapp_number": ""
  },
  "social": {
    "facebook": "",
    "instagram": "",
    "youtube": ""
  },
  "sections_enabled": {
    "notices": true,
    "gallery": true,
    "enquiry_form": false
  },
  "cta": {
    "parent_portal_label": "Parent login",
    "admission_label": "Admission enquiry"
  }
}
```

Validate JSON in serializer; reject unknown keys in strict mode or strip extras.

---

## API design

### Authenticated (dashboard) — `/api/public-website/`

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/me/` | Owner or staff with `website` module view | Get or create `SchoolWebsite` for user's school |
| PATCH | `/me/` | Owner or staff with `website` edit | Update theme, content, publish |
| POST | `/me/preview-token/` | Owner | Short-lived token for draft preview (Phase 2) |
| POST | `/me/gallery/` | Owner | Upload gallery image (Phase 2) |
| DELETE | `/me/gallery/{id}/` | Owner | Remove gallery image |
| GET | `/themes/` | Authenticated | List available themes + plan availability |
| POST | `/me/verify-domain/` | Owner, Premium | Start custom domain verification (Phase 3) |

Use `SchoolScopedMixin` pattern from `schools` app. Add `module_key = "website"` to staff permissions matrix (`frontend/src/lib/staff-modules.ts` + `schools/module_permissions.py`).

### Public (no auth) — `/api/public/schools/`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/{slug}/` | Full public payload for rendering site |
| GET | `/{slug}/notices/` | Paginated announcements for website |
| POST | `/{slug}/enquiry/` | Submit admission enquiry (Phase 4, rate-limited) |

**Public payload shape (allowlist only):**

```json
{
  "slug": "flynn-kinney-school",
  "theme_key": "classic",
  "school": {
    "name": "...",
    "address": "...",
    "city": "...",
    "state": "...",
    "phone": "...",
    "email": "...",
    "logo_url": "...",
    "public_code": "ABC123"
  },
  "content": { },
  "notices": [ { "title", "body", "category", "sent_at" } ],
  "gallery": [ { "url", "caption" } ],
  "parent_portal_url": "/parent/login",
  "show_powered_by": true
}
```

**Rate limiting:** Apply throttle on public enquiry POST (e.g. 5/hour per IP per slug).

---

## Integrations with existing apps

| Existing module | How `public_website` uses it |
|-----------------|------------------------------|
| `schools.School` | FK; read name, address, logo, `public_code`, plan |
| `announcements.Announcement` | Read `status=sent` rows for school; add optional `show_on_website` Boolean on Announcement (migration in `announcements` app) OR filter by category/date in service |
| `schools` Enquiries | POST new enquiry with `source=website` if module exists |
| `receipts` / branding | Reuse `header_color` idea for theme accent if desired (optional) |

**Cross-app migration rule:** If `Announcement` needs `show_on_website`, add field in `announcements` app but **no view logic there** — `public_website.services.content` queries it.

---

## Frontend — dashboard editor

**Location:** `frontend/src/app/dashboard/website/page.tsx` (or Settings tab “Website”).

**UI sections:**

1. **Status bar** — Published / Draft, public URL, copy link, open in new tab.
2. **Theme picker** — 5 cards with screenshot thumbnail; disabled themes show upgrade badge.
3. **Content editor** — Tabs: Hero, About, Contact, Social, SEO, Gallery.
4. **Notices** — Toggle “Show announcements on website”; link to Announcements page to create content.
5. **Parent portal** — Read-only display of `public_code` + share message (reuse pattern from Settings page).
6. **Domain** (Phase 3) — Slug editor, custom domain input, DNS instructions accordion.
7. **Actions** — Save, Preview, Publish / Unpublish.

**Components to extract:**

- `website-theme-picker.tsx`
- `website-content-form.tsx`
- `website-preview-frame.tsx`

**API helpers in `frontend/src/lib/api.ts`:**

- `getSchoolWebsite()`
- `updateSchoolWebsite(data)`
- `getPublicSchoolWebsite(slug)` — for SSR/ISR on public pages
- `getWebsiteThemes()`

---

## Frontend — public site

**Location:** `frontend/src/app/site/[slug]/page.tsx` (path-based MVP) or middleware for subdomain (Phase 3).

**Rendering:**

- Server Component fetches `GET /api/public/schools/{slug}/`.
- Switch layout by `theme_key` → import theme components from `frontend/src/components/school-website/themes/`.
- 404 if not published (unless preview token valid).
- Mobile-first; Hindi-friendly typography option (future).

**Theme components (one folder per theme):**

```
frontend/src/components/school-website/
├── themes/
│   ├── classic/
│   ├── modern/
│   ├── academic/
│   ├── bold/
│   └── minimal/
├── sections/
│   ├── hero.tsx
│   ├── about.tsx
│   ├── notices.tsx
│   ├── gallery.tsx
│   ├── contact.tsx
│   ├── enquiry-form.tsx
│   └── parent-cta.tsx
└── types.ts
```

Each theme wraps the same sections with different layout tokens (colors, fonts, spacing).

---

## Slug generation rules

- On first save / school registration hook: generate from `School.name` → lowercase, hyphenated, ASCII transliteration.
- Reserved slugs: `www`, `api`, `app`, `admin`, `login`, `parent`, `dashboard`, `static`, `media`.
- Collision: append `-2`, `-3`, etc.
- Slug change: owner can edit in dashboard (Phase 2); old slug 301 redirect for 90 days (optional).

Service: `public_website.services.slug.generate_unique_slug(school)`.

---

## Custom domain flow (Phase 3)

1. Owner enters `www.myschool.edu.in`.
2. Backend stores `custom_domain`, `domain_status=pending`.
3. Dashboard shows: `CNAME www → cname.schoolfeepro.com` (or Vercel DNS target).
4. Owner clicks “Verify” → backend DNS lookup or manual admin verify.
5. On success: `domain_status=verified`; frontend middleware resolves Host header → school slug.
6. Document in `public_website/README.md` deployment steps for Vercel wildcard + custom domains.

---

## Security checklist

- [ ] Public endpoints use `AllowAny` but never return private data.
- [ ] No student names, rolls, fee balances, or staff list on public site.
- [ ] Gallery/uploads: validate MIME type, max size 2MB, strip EXIF if needed.
- [ ] `body_html` sanitized (bleach or allowlist tags) on save.
- [ ] CORS: public read OK from main frontend origin.
- [ ] Enquiry endpoint: captcha or honeypot (Phase 4).
- [ ] Dashboard APIs require JWT + school scope + module permission.

---

## Staff permissions

Add module `website` to staff permission matrix:

| Action | Owner | Staff (configurable) |
|--------|-------|----------------------|
| view | ✅ | ✅ |
| edit | ✅ | optional |
| publish | ✅ | optional (default owner only) |

---

## Testing requirements

**Backend (`public_website/tests/`):**

- Slug uniqueness and reserved words.
- Public API returns 404 for unpublished site.
- Public API cannot access other school by wrong slug.
- Dashboard PATCH requires owner or permitted staff.
- Plan gate blocks premium themes on Basic plan.
- Announcements appear only when `sent` and school matches.

**Frontend (manual / optional Playwright later):**

- Editor save → public page reflects changes.
- Theme switch changes layout component.
- Parent CTA URL correct.

---

## Environment variables (add when deploying)

```env
# Phase 3+
PUBLIC_WEBSITE_BASE_HOST=schoolfeepro.com
PUBLIC_WEBSITE_CNAME_TARGET=cname.schoolfeepro.com
NEXT_PUBLIC_PARENT_PORTAL_URL=https://schoolfeepro.com/parent/login
```

---

## Implementation order for Cursor (strict)

1. Create `public_website` Django app + `SchoolWebsite` model + migrations.
2. Dashboard GET/PATCH `/api/public-website/me/`.
3. Public GET `/api/public/schools/{slug}/` + content service merging School data.
4. Frontend dashboard editor (minimal fields).
5. Frontend public page with **classic** theme only.
6. Wire announcements into notices section.
7. Tests for public isolation and publish flag.
8. Add remaining 4 themes (Phase 2).
9. Gallery uploads (Phase 2).
10. Subdomain middleware (Phase 3).
11. Custom domain + plan gates (Phase 3–4).
12. Enquiry form (Phase 4).

**Do not skip step 7 before adding themes.**

---

## Out of scope (do not build unless asked)

- Full drag-and-drop page builder.
- Blog with comments.
- Student result publication on public site.
- E-commerce / online fee payment embedded in public site (link to parent portal only).
- Multi-language CMS (Hindi content entry OK as text; UI i18n later).
- Separate WordPress export.

---

## Success metrics

- Owner can go live in **under 15 minutes** (theme + about + publish).
- Public page Lighthouse performance **> 80** mobile.
- Zero cross-tenant data leaks in security test.
- Premium custom domain verified end-to-end on staging.

---

## Related project files

| File | Relevance |
|------|-----------|
| `backend/schools/models.py` | `School`, `public_code`, `logo`, plan |
| `backend/announcements/models.py` | Notices source |
| `frontend/src/app/dashboard/settings/page.tsx` | Parent code share pattern |
| `frontend/src/lib/staff-modules.ts` | Add `website` module |
| `backend/schools/module_permissions.py` | Permission definitions |
| `DB_SCHEMA.md` | Update after migrations |

---

## One-line pitch for schools

> “Apna school website — fees, notices aur parent login ek hi jagah. 5 designs mein se chuniye, publish kijiye, link parents ko bhejiye.”

---

*Last updated: spec only — not yet implemented. When implementing, create `backend/public_website/README.md` with API examples and deployment notes.*
