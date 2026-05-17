# Schools App

Core Django app for **SchoolFee Pro** — multi-tenant school fee management, student records, fee collection, expenses, and messaging. All dashboard APIs under `/api/` (except payments) live here.

**Related docs:** project root `README.md` (full API list), `DB_SCHEMA.md` (database), `PAYMENT.md` (Razorpay — `payments` app).

---

## What this module does

| Area | Responsibility |
|------|----------------|
| **Tenancy & auth** | School owners, staff logins, JWT login, registration, password reset |
| **School setup** | School profile, classes, sections, subscription plan limits |
| **Students** | Enrollment, parent contact, fee-structure choices, fee history |
| **Fees** | Fee types, class-wise structures, monthly records, payments, receipts, reminders |
| **Expenses** | Categories, vendors, expenses, budgets, P&L reports |
| **Messaging** | SMS/WhatsApp settings, outbound messages, automated fee-start reminders |
| **Ops** | Maintenance flag, demo booking slots |

Online card/UPI checkout for fees is handled by the separate **`payments`** app (`/api/payments/`), which calls into `bulk_fee_collection.py` for recording payments after Razorpay verification.

---

## Multi-tenancy

Every school is an isolated tenant. Data is scoped by `school` (or `student__school`):

- Each `User` belongs to one `School` (`owner`, `accountant`, or `staff`).
- API views use **`SchoolScopedMixin`** / **`SchoolNestedMixin`** so users only see their school’s rows.
- **`IsSchoolOwner`** restricts staff-user management and messaging settings updates to owners.

```
User (JWT) ──► School ──► Students, Classes, Fees, Expenses, …
```

---

## Folder structure

```
schools/
├── models.py              # All domain models + reusable methods (balance, apply_plan, …)
├── serializers.py         # DRF serializers (request/response shapes)
├── urls.py                # Router + auth/maintenance/booking/messaging paths
├── mixins.py              # SchoolScopedMixin, SchoolNestedMixin
├── permissions.py         # IsSchoolOwner, IsSchoolMember
├── querysets.py           # for_school(), up_to_month(), with_payment_totals()
├── views/                 # HTTP layer — thin, delegates to services/models
│   ├── auth.py            # Register, login helpers, staff CRUD
│   ├── school.py          # School + classes (+ add_section, apply_fee)
│   ├── students.py        # Students, fee types, fee structures
│   ├── fees.py            # Student fees, collection, dashboard, payments
│   └── expenses.py        # Expense categories, vendors, expenses, budgets
├── services/
│   ├── fee_collection.py  # collection_summary, dashboard, fee_history builders
│   ├── fee_start_reminders.py  # Cron/command: fee-cycle SMS/WhatsApp
│   └── messaging_service.py    # Twilio SMS / WhatsApp send
├── bulk_fee_collection.py # pay_all_pending, pay_all_year (REST + payments app)
├── fee_periods.py         # Wrapper → FeeStructure.is_billable_for_period()
├── default_fee_types.py   # Seed tuition, transport, etc. per school
├── messaging.py           # Phone normalize + low-level send helpers
├── payment_links.py       # Parent payment URL builder
├── utils.py               # PDF receipt generation
├── auth_views.py          # JWT token view (includes school in payload)
├── views_messaging.py     # Messaging settings + send API
├── views_maintenance.py   # Public maintenance check
├── views_booking.py       # Demo booking slots
├── signals.py             # Auto-create messaging settings on new school
├── admin.py               # Django admin registrations
├── management/commands/   # seed_fee_types, seed_dummy_data, send_fee_start_reminders, …
└── tests/                 # Unit tests (e.g. test_models.py)
```

---

## Models (summary)

### Core tenancy & users

| Model | Purpose |
|-------|---------|
| `User` | Custom user (`AUTH_USER_MODEL`); `role` + `school` FK |
| `School` | Tenant; plan limits, academic year start, `apply_plan()`, `academic_year_label()` |
| `SchoolClass` | Grade/name per school (Nursery, Class 1, …) |
| `Section` | Sections within a class (A, B, C) |

### Students & fees

| Model | Purpose |
|-------|---------|
| `Student` | Enrollment, parent phone, admission/charges dates |
| `FeeType` | Tuition, transport, etc. (school-specific or system-wide) |
| `FeeStructure` | Amount per class + academic year; `is_billable_for_period()`, `due_date_for()` |
| `StudentFeeStructureChoice` | Which structures apply to a student (optional `effective_from`) |
| `StudentFee` | One row per student × structure × month/year; `balance`, `paid_amount()`, `ensure_for_period()` |
| `FeePayment` | Payment against a `StudentFee`; `assign_receipt_number()` |
| `Subscription` | Legacy/plan subscription metadata (Razorpay fields) |

### Expenses

| Model | Purpose |
|-------|---------|
| `ExpenseCategory` | Custom expense labels |
| `Vendor` | Suppliers |
| `Expense` | Individual expense lines |
| `Budget` | Planned vs spent per category/year (`spent_amount` property) |

### Messaging

| Model | Purpose |
|-------|---------|
| `SchoolMessagingSettings` | SMS/WhatsApp toggles per school |
| `MessageLog` | Outbound message audit trail |
| `MessageUsage` | Usage batches per channel |
| `FeeAutomatedReminderLog` | Idempotent log for automated fee-start reminders |

---

## API surface (`urls.py`)

Mounted at **`/api/`** from `config/urls.py`.

| Group | Base path | View module |
|-------|-----------|-------------|
| Auth | `auth/`, `token/` | `views/auth.py`, `auth_views.py` |
| Schools & classes | `schools/`, `classes/` | `views/school.py` |
| Students & structures | `students/`, `fee-types/`, `fee-structures/` | `views/students.py` |
| Fee collection | `student-fees/` | `views/fees.py` |
| Staff | `staff-users/` | `views/auth.py` |
| Expenses | `expense-categories/`, `vendors/`, `expenses/`, `budgets/` | `views/expenses.py` |
| Messaging | `messaging/settings/`, `messaging/send/` | `views_messaging.py` |
| Maintenance / booking | `maintenance/`, `booking/` | `views_maintenance.py`, `views_booking.py` |

### Important custom actions (`student-fees`)

| Action | Method | Role |
|--------|--------|------|
| `collection_summary/` | GET | Class/student-wise dues for a month |
| `dashboard/` | GET | Totals, collection rate, top defaulters |
| `payment_preview/` | GET | Monthly vs yearly amounts before pay |
| `pay_all_pending/` | POST | Cash/offline bulk pay |
| `pay_full_year/` | POST | Single structure, full year + discount |
| `pay_all_year/` | POST | All structures, full year |
| `generate_fees/` | POST | Create fee rows for month/year |
| `send_reminder/` | POST | SMS/WhatsApp for current month pending |
| `{id}/add_payment/` | POST | Partial/full payment on one fee |
| `{id}/receipt/` | GET | PDF receipt |

Heavy reporting logic for `collection_summary`, `dashboard`, and `fee_history` lives in **`services/fee_collection.py`**, not in the view.

---

## Services & shared logic

### `services/fee_collection.py`

Builds JSON for:

- Fee collection screen (class-wise + student-wise + defaulters)
- Dashboard widgets
- Student fee history timeline

Uses `StudentFee.objects.for_school()` / `up_to_month()` and respects fee-structure choices + billing periods.

### `bulk_fee_collection.py`

Shared by:

- `StudentFeeViewSet` (`pay_all_pending`, `pay_all_year`)
- `payments` app (`FeeCollectionCreateOrderView` / verify after Razorpay)

Keeps cash and online checkout on the same business rules.

### `fee_periods.py`

Public function `is_struct_billable_for_period()` delegates to **`FeeStructure.is_billable_for_period()`** on the model (monthly / quarterly / half-yearly / yearly / one-time).

### `default_fee_types.py`

`ensure_default_fee_types_for_school()` — called on `/api/auth/me/` so new schools get standard fee types.

### `services/fee_start_reminders.py`

Used by management command `send_fee_start_reminders` — sends fee-cycle messages when enabled in messaging settings.

---

## Management commands

```bash
python manage.py seed_fee_types          # System + school fee types
python manage.py create_default_classes  # Default class list for a school
python manage.py seed_dummy_data         # Sample data for development
python manage.py send_fee_start_reminders  # Automated fee-start SMS/WhatsApp
```

---

## Signals

On **`School`** create → auto-creates **`SchoolMessagingSettings`** (`signals.py`).

---

## Dependencies on other apps

| Direction | Detail |
|-----------|--------|
| **schools → payments** | `views_messaging` may reference `PlatformInvoice`; fee collection verify uses `bulk_fee_collection` |
| **payments → schools** | Reads `StudentFee`, `FeePayment`, calls `pay_all_pending_operation` / `pay_all_year_operation` |

Keep fee **recording** rules in `schools`; keep Razorpay **orders/signatures** in `payments`.

---

## Conventions for contributors

1. **Put business rules on models** when they are reused (e.g. `StudentFee.balance`, `School.apply_plan`).
2. **Put multi-step workflows in `services/`** or `bulk_fee_collection.py`, not in views.
3. **Use mixins** for school scoping — do not copy `request.user.school` filters into every viewset.
4. **Add new viewsets** under `views/<domain>.py` and export from `views/__init__.py`.
5. **New models** → migration + `admin.py` + serializer + register in `urls.py` router.

---

## Tests

```bash
python manage.py test schools.tests
```

Start with `tests/test_models.py` for plan limits and fee balance behavior.

---

## Quick local flow

1. Register owner → `POST /api/auth/register/`
2. Login → `POST /api/token/`
3. Create classes → `POST /api/classes/`
4. Define fee structures → `POST /api/fee-structures/`
5. Add students → `POST /api/students/`
6. Generate fees → `POST /api/student-fees/generate_fees/`
7. Record payments → `POST /api/student-fees/{id}/add_payment/` or bulk actions

For card/UPI collection from the dashboard, use **`/api/payments/fee-collection/`** (see `PAYMENT.md`).
