# Payment Architecture

This document explains the dedicated `payments` module and how payment flows are separated.

## Why Separate Module

The app has two distinct money flows and they must remain isolated:

1. **Platform billing** (school pays your SaaS)
   - Money should settle to your platform account.
2. **Parent-to-school collection** (parent pays school fees)
   - Money should settle to the respective school account.

The `payments` Django app owns gateway orchestration, verification, and payment tracking for both flows.

## Backend Module

Location: `backend/payments`

### Models

- `SchoolPaymentConfig`
  - One per school.
  - Stores platform billing preference and optional Razorpay Route account id for school settlement.

- `PlatformInvoice`
  - Invoice for school subscription charges.

- `PlatformPaymentTransaction`
  - Gateway transaction records for platform invoices.

- `ParentPaymentIntent`
  - Intent/order to collect parent payment for a specific student fee row.

- `ParentPaymentTransaction`
  - Gateway transaction records for parent payment intents.

## API Endpoints

Base path: `/api/payments/`

- `GET /config/`
- `PATCH /config/`

- `GET /platform/summary/`
- `POST /platform/create-order/`
- `POST /platform/verify/`

- `POST /parent/create-intent/`
- `POST /parent/verify/`

## Razorpay Flow

### Platform billing

1. Frontend calls `platform/create-order`.
2. Backend creates `PlatformInvoice` + Razorpay order.
3. Frontend opens Razorpay checkout.
4. Frontend sends payment ids/signature to `platform/verify`.
5. Backend verifies signature and marks invoice as paid.

### Parent-to-school flow

1. Frontend calls `parent/create-intent` with `student_fee_id` and amount.
2. Backend creates `ParentPaymentIntent` and Razorpay order.
3. If school Route account id is configured, order is created with transfers for school settlement.
4. Frontend opens checkout.
5. Frontend sends ids/signature to `parent/verify`.
6. Backend verifies signature, marks intent as paid, and creates a `FeePayment` entry in school fee ledger.

## Frontend Integration

- Added dashboard page: `/dashboard/payments`
- Added API helpers in `frontend/src/lib/api.ts`
- Added Payments menu item in dashboard sidebar.

The page supports:
- saving payment config
- paying platform charges
- starting parent payment by `student_fee_id`

## Environment Variables

Backend:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

Frontend:

- `NEXT_PUBLIC_RAZORPAY_KEY_ID`

## Migration and Setup

Run:

```bash
cd backend
source venv/bin/activate
python manage.py migrate
```

## Notes and Next Hardening Steps

- Add webhook endpoint and reconciliation for async updates/refunds.
- Add idempotency keys for repeated verify calls.
- Add school payout reconciliation report.
- Add role-based access restrictions for payment actions.
- Replace manual `student_fee_id` entry in UI with searchable student fee picker.
