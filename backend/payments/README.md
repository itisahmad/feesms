# Payments App

Django app for **Razorpay integration** and payment orchestration in SchoolFee Pro. Mounted at **`/api/payments/`** from `config/urls.py`.

**Related docs:** `PAYMENT.md` (detailed flows & env setup), root `README.md` (API table), `schools/README.md` (fee ledger & bulk pay logic).

---

## What this module does

This app handles **money movement through Razorpay** — not day-to-day fee CRUD (that lives in `schools`).

| Flow | Who pays | Money settles to | Records created here |
|------|----------|------------------|----------------------|
| **Platform billing** | School owner → SaaS | Platform Razorpay account | `PlatformInvoice`, `PlatformPaymentTransaction` |
| **Parent payment** | Parent → school (one fee row) | School Route account (if configured) | `ParentPaymentIntent`, `ParentPaymentTransaction` → `schools.FeePayment` |
| **Fee collection checkout** | Staff/parent via dashboard (bulk) | School Route account (if configured) | `FeeCollectionCheckoutSession` → `schools` bulk pay ops |

Cash/offline payments (`add_payment`, `pay_all_pending` without Razorpay) stay in **`schools`** only.

---

## Design principle: two money flows, one gateway

```
                    ┌─────────────────────────────────────┐
                    │         payments (this app)          │
                    │  services.py → Razorpay Orders API   │
                    └─────────────────────────────────────┘
                           │                    │
              Platform billing              Parent / Fee collection
                           │                    │
                           ▼                    ▼
              PlatformInvoice            schools.FeePayment
              (SaaS subscription)        (student fee ledger)
```

- **Never mix** platform subscription charges with parent fee settlement in one order type.
- **Always verify** `razorpay_signature` server-side before marking paid.
- **Delegate fee math** to `schools.bulk_fee_collection` so online and offline rules match.

---

## Folder structure

```
payments/
├── models.py       # Config, invoices, intents, checkout sessions, transactions
├── serializers.py  # API response shapes
├── views.py        # All payment endpoints (APIView classes)
├── services.py     # Razorpay HTTP client: create_order, verify_signature, to_paise
├── urls.py         # Route definitions
├── admin.py        # Django admin for config, invoices, intents (not checkout sessions)
└── README.md       # This file
```

Small, focused app — no `views/` package yet because all endpoints fit in one module (~480 lines).

---

## Models

### `SchoolPaymentConfig` (1:1 with `schools.School`)

Per-school payment settings:

| Field | Purpose |
|-------|---------|
| `platform_billing_cycle` | `monthly` or `yearly` preference |
| `razorpay_route_account_id` | Razorpay Route linked account — parent/fee money routes to school |
| `active` | Enable/disable payment features |

Created on first access via `get_or_create` in views.

### Platform billing (SaaS revenue)

| Model | Purpose |
|-------|---------|
| `PlatformInvoice` | Subscription charge for a school (`basic` / `standard` / `premium` pricing) |
| `PlatformPaymentTransaction` | Razorpay order/payment tied to an invoice |

**Pricing** (in `views.py` → `PLAN_MONTHLY_AMOUNT`):

| Plan | Monthly | Yearly (×12) |
|------|---------|--------------|
| basic | ₹299 | ₹3,588 |
| standard | ₹599 | ₹7,188 |
| premium | ₹999 | ₹11,988 |

### Parent-to-school (single fee row)

| Model | Purpose |
|-------|---------|
| `ParentPaymentIntent` | Intent to pay a specific `StudentFee` amount |
| `ParentPaymentTransaction` | Gateway capture record for that intent |

On successful verify → creates **`schools.FeePayment`** with `transaction_id` = Razorpay payment id.

### Dashboard fee collection (bulk Razorpay)

| Model | Purpose |
|-------|---------|
| `FeeCollectionCheckoutSession` | Pending checkout; stores `collection_mode` + payload until verify |

**`collection_mode` values:**

| Mode | Meaning | After verify calls |
|------|---------|-------------------|
| `monthly` | Pay current month pending only | `pay_all_pending_operation(..., only_this_month=True)` |
| `all_pending` | Pay all pending up to month/year | `pay_all_pending_operation(..., only_this_month=False)` |
| `yearly` | Full academic year (with discounts) | `pay_all_year_operation(...)` |

Amount is computed **before** order creation via `compute_razorpay_amount_*` in `schools/bulk_fee_collection.py`.

---

## API surface (`urls.py`)

Base: **`/api/payments/`** — all routes require JWT (`IsAuthenticated`) and a user with `school` assigned.

### Config

| Method | Path | Description |
|--------|------|-------------|
| GET | `config/` | Get school's payment config |
| PATCH | `config/` | Update billing cycle, Route account id, active flag |

### Platform billing (school pays SaaS)

| Method | Path | Description |
|--------|------|-------------|
| GET | `platform/summary/` | Plan, next amount, recent invoices |
| POST | `platform/create-order/` | Body: `{ "billing_cycle": "monthly" \| "yearly" }` → Razorpay `order_id` |
| POST | `platform/verify/` | Body: `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` |

### Parent payment (online pay one fee)

| Method | Path | Description |
|--------|------|-------------|
| POST | `parent/create-intent/` | Body: `student_fee_id`, `amount`, optional `notes` |
| POST | `parent/verify/` | Body: `intent_id`, Razorpay ids + signature, optional `payment_mode` |

### Fee collection checkout (dashboard bulk pay)

| Method | Path | Description |
|--------|------|-------------|
| POST | `fee-collection/create-order/` | Body: `student_id`, `month`, `year`, `payment_date`, `collection_mode`, optional `fee_structure_ids`, `notes` |
| POST | `fee-collection/verify/` | Body: `checkout_session_id`, Razorpay ids + signature |

---

## Razorpay service layer (`services.py`)

Thin wrapper around Razorpay REST API (stdlib `urllib`, no official SDK):

| Function | Purpose |
|----------|---------|
| `create_order(amount, receipt, notes, transfers?)` | POST `/v1/orders` |
| `verify_signature(order_id, payment_id, signature)` | HMAC-SHA256 check |
| `to_paise(amount)` | INR → paise for Route transfers |

**Environment variables (required):**

```env
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

Frontend checkout uses `NEXT_PUBLIC_RAZORPAY_KEY_ID` (see `PAYMENT.md`).

---

## End-to-end flows

### 1. Platform subscription payment

```
Client                    payments/views              Razorpay           DB
  │  POST platform/create-order                         │                │
  │ ─────────────────────────────────────────────────►│                │
  │                        create PlatformInvoice       │                │
  │                        create_order() ───────────►│                │
  │◄── order_id, amount_paise ─────────────────────────│                │
  │  [Razorpay Checkout UI]                            │                │
  │  POST platform/verify                             │                │
  │ ─────────────────────────────────────────────────►│                │
  │                        verify_signature()         │                │
  │                        invoice.status = paid      │                │
```

No Route transfers — full amount to platform account.

### 2. Parent pays one student fee

Same pattern as platform, plus:

- Optional **`transfers`** to `razorpay_route_account_id` on the order.
- Verify creates **`FeePayment`** on linked `StudentFee`.

### 3. Dashboard fee collection (monthly / all pending / yearly)

```
1. POST fee-collection/create-order
   → compute amount (schools.bulk_fee_collection)
   → create Razorpay order + FeeCollectionCheckoutSession (pending)

2. User completes Razorpay checkout

3. POST fee-collection/verify
   → verify signature
   → select_for_update session (idempotent: pending only)
   → pay_all_pending_operation OR pay_all_year_operation (schools)
   → session.status = completed
```

Uses **database transaction** so fee rows are not double-recorded if verify is retried after success (session already completed → 404).

---

## Dependencies on `schools` app

| payments imports from schools | Why |
|------------------------------|-----|
| `StudentFee`, `FeePayment` | Parent verify records payment |
| `FeePaymentSerializer` | Response after parent verify |
| `pay_all_pending_operation`, `pay_all_year_operation` | Fee collection verify |
| `compute_razorpay_amount_pay_all_pending`, `compute_razorpay_amount_pay_all_year` | Order amount before checkout |
| `parse_fee_structure_ids` | Filter which fee structures to include |

**Rule:** Amount calculation and fee ledger writes stay in **`schools`**. This app only creates Razorpay orders and verifies signatures.

---

## Frontend integration

| UI | API used |
|----|----------|
| `/dashboard/payments` | `config`, `platform/summary`, `platform/create-order`, `platform/verify`, `parent/create-intent`, `parent/verify` |
| Fee collection screens | `fee-collection/create-order`, `fee-collection/verify` |

Helpers: `frontend/src/lib/api.ts` (`getPaymentConfig`, `createFeeCollectionOrder`, etc.).

---

## Django admin

Registered: `SchoolPaymentConfig`, `PlatformInvoice`, `PlatformPaymentTransaction`, `ParentPaymentIntent`, `ParentPaymentTransaction`.

**Not registered:** `FeeCollectionCheckoutSession` (debug via DB or add admin if needed).

---

## Security notes

1. **Secrets** — only on backend; never expose `RAZORPAY_KEY_SECRET` to frontend.
2. **Signature verify** — required on every `*/verify/` endpoint before updating status.
3. **School scoping** — all queries filter by `request.user.school`.
4. **Checkout session** — `provider_order_id` must match verify payload; session locked with `select_for_update`.
5. **Route account** — misconfigured `razorpay_route_account_id` can break transfers; validate in Razorpay dashboard.

---

## Known gaps / next steps

(from `PAYMENT.md` and code review)

- [ ] Razorpay **webhooks** for async payment/refund events
- [ ] **Idempotency** keys on verify endpoints (partially handled for fee-collection via session status)
- [ ] Register `FeeCollectionCheckoutSession` in admin
- [ ] Extract `PLAN_MONTHLY_AMOUNT` to settings or `School.PLAN_LIMITS`-style config
- [ ] Role checks (e.g. only owner can change Route account)
- [ ] Payout reconciliation report per school

---

## Conventions for contributors

1. **New payment flow?** Add models + two endpoints: `create-order` and `verify` (never trust client-only success).
2. **Fee amounts** — compute in `schools.bulk_fee_collection`, not in `payments/views.py`.
3. **After successful pay** — write `FeePayment` through existing school operations when possible.
4. **Testing** — mock `services.create_order` and `verify_signature`; use Razorpay test keys.

---

## Quick test flow (Razorpay test mode)

1. Set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in `backend/.env`.
2. Login as school owner → `POST /api/token/`.
3. `GET /api/payments/platform/summary/`.
4. `POST /api/payments/platform/create-order/` → open checkout with test card.
5. `POST /api/payments/platform/verify/` with returned ids.
6. Confirm `PlatformInvoice.status == paid`.

For fee collection, ensure student has pending fees, then use `fee-collection/create-order` + verify with `collection_mode` matching the UI action.
