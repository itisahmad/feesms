# SchoolFee Pro - Fee Management for Bihar Schools

A full-stack SaaS application for school fee management, built for the Bihar market. Built with **Next.js** (frontend) and **Django** (backend).

<!-- Never commit payment secrets in repository -->

## Features

- **School owner signup & login** – Register your school with 30-day free trial
- **Student management** – Add students with name, class, parent phone
- **Fee structure** – Set different fee amounts per class (tuition, transport, books, exam, etc.)
- **Fee collection** – Mark fees as paid/unpaid, record partial payments
- **Dashboard** – Total collected vs pending, student count
- **PDF receipts** – Generate receipts for parents
- **WhatsApp reminder** – Placeholder for unpaid fee reminders (integrate with WhatsApp Business API)

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend**: Django 6, Django REST Framework, JWT (SimpleJWT)
- **Database**: PostgreSQL (via `DATABASE_URL` in `.env`)

## Quick Start

### Backend (Django)

```bash
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\Activate.ps1
# Mac/Linux:
# source venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py seed_fee_types
python manage.py runserver
```

Backend runs at http://localhost:8000

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:3000

## Database Schema

See `DB_SCHEMA.md` for the current backend model relationships, constraints, and schema notes.

## Payments

See `PAYMENT.md` for payment architecture, Razorpay flow separation, APIs, and setup.

### Environment

Create `backend/.env`:

```
DJANGO_SECRET_KEY=your-secret-key
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
```

Create `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

## API Endpoints

Base URL (local): `http://localhost:8000`

| Prefix | Description |
|--------|-------------|
| `/api/` | Schools app (auth, students, fees, expenses, messaging) |
| `/api/payments/` | Razorpay billing & fee-collection checkout |
| `/admin/` | Django admin |

**Authentication:** Most `/api/` routes require `Authorization: Bearer <access_token>`. Public routes are marked below.

---

### Auth & session

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register/` | Public | Register school owner + school |
| POST | `/api/token/` | Public | Login (JWT access + refresh) |
| POST | `/api/token/refresh/` | Refresh token | Refresh access token |
| GET | `/api/auth/me/` | Required | Current user profile |
| POST | `/api/auth/forgot-password/` | Public | Request password reset (returns uid/token) |
| POST | `/api/auth/reset-password/` | Public | Reset password with uid + token |

---

### School & classes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/schools/` | List own school |
| GET | `/api/schools/{id}/` | School details |
| PATCH | `/api/schools/{id}/` | Update school profile |
| POST | `/api/schools/{id}/upgrade_plan/` | Change plan (`basic` \| `standard` \| `premium`) |
| GET | `/api/classes/` | List classes |
| POST | `/api/classes/` | Create class |
| GET | `/api/classes/{id}/` | Class detail |
| PATCH | `/api/classes/{id}/` | Update class |
| DELETE | `/api/classes/{id}/` | Delete class |
| POST | `/api/classes/{id}/add_section/` | Add section (`name`) |
| POST | `/api/classes/{id}/apply_fee/` | Apply fee structure to all students in class |

---

### Students

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/students/` | List students (`?class=`, `?section=`, `?search=`) |
| POST | `/api/students/` | Create student |
| GET | `/api/students/{id}/` | Student detail |
| PATCH | `/api/students/{id}/` | Update student |
| DELETE | `/api/students/{id}/` | Delete student |
| GET | `/api/students/{id}/fee_history/` | Full fee & payment history |

---

### Staff (owner only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/staff-users/` | List staff accounts |
| POST | `/api/staff-users/` | Create staff login |
| GET | `/api/staff-users/{id}/` | Staff detail |
| PATCH | `/api/staff-users/{id}/` | Update staff |
| DELETE | `/api/staff-users/{id}/` | Remove staff |

---

### Fee types & structures

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fee-types/` | List fee types (school + system) |
| POST | `/api/fee-types/` | Create custom fee type |
| PATCH | `/api/fee-types/{id}/` | Update fee type |
| DELETE | `/api/fee-types/{id}/` | Delete fee type |
| GET | `/api/fee-structures/` | List structures (`?school_class=`) |
| POST | `/api/fee-structures/` | Create fee structure |
| GET | `/api/fee-structures/{id}/` | Structure detail |
| PATCH | `/api/fee-structures/{id}/` | Update structure |
| DELETE | `/api/fee-structures/{id}/` | Delete structure |

---

### Student fees & collection

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/student-fees/` | List fees (`?student=`, `?month=`, `?year=`) |
| POST | `/api/student-fees/` | Create student fee record |
| GET | `/api/student-fees/{id}/` | Fee detail |
| PATCH | `/api/student-fees/{id}/` | Update fee |
| DELETE | `/api/student-fees/{id}/` | Delete fee |
| GET | `/api/student-fees/collection_summary/` | Class/student-wise summary (`?month=`, `?year=`) |
| GET | `/api/student-fees/dashboard/` | Dashboard totals & defaulters |
| GET | `/api/student-fees/payment_preview/` | Monthly/yearly preview (`?student_id=`, `?month=`, `?year=`, `?fee_structure_ids=`) |
| POST | `/api/student-fees/pay_all_pending/` | Record all pending for a student |
| POST | `/api/student-fees/pay_full_year/` | Pay one fee type for full academic year |
| POST | `/api/student-fees/pay_all_year/` | Pay all fee types for full academic year |
| POST | `/api/student-fees/generate_fees/` | Generate fee rows for month/year |
| POST | `/api/student-fees/send_reminder/` | SMS/WhatsApp reminders (`channel`: `sms` \| `whatsapp` \| `both`) |
| POST | `/api/student-fees/{id}/add_payment/` | Add payment to a fee |
| GET | `/api/student-fees/{id}/receipt/` | Download PDF receipt |

---

### Expenses & budgets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expense-categories/` | List categories |
| POST | `/api/expense-categories/` | Create category |
| PATCH | `/api/expense-categories/{id}/` | Update category |
| DELETE | `/api/expense-categories/{id}/` | Delete category |
| GET | `/api/vendors/` | List vendors |
| POST | `/api/vendors/` | Create vendor |
| PATCH | `/api/vendors/{id}/` | Update vendor |
| DELETE | `/api/vendors/{id}/` | Delete vendor |
| GET | `/api/expenses/` | List expenses |
| POST | `/api/expenses/` | Create expense |
| PATCH | `/api/expenses/{id}/` | Update expense |
| DELETE | `/api/expenses/{id}/` | Delete expense |
| GET | `/api/expenses/reports/` | P&L report (`?start_date=`, `?end_date=`) |
| GET | `/api/budgets/` | List budgets |
| POST | `/api/budgets/` | Create budget |
| PATCH | `/api/budgets/{id}/` | Update budget |
| DELETE | `/api/budgets/{id}/` | Delete budget |

---

### Messaging (SMS / WhatsApp)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/messaging/settings/` | Messaging settings for school |
| PATCH | `/api/messaging/settings/` | Update settings (owner only) |
| POST | `/api/messaging/send/` | Send message to students (`channel`, `message_type`, `student_ids`, …) |

---

### Maintenance & booking

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/maintenance/` | Public | Maintenance mode status |
| GET | `/api/booking/slots/` | Required | Available demo booking slots |
| POST | `/api/booking/book/` | Required | Book a slot (`date`, `time`) |

---

### Payments (Razorpay) — `/api/payments/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payments/config/` | School payment config |
| PATCH | `/api/payments/config/` | Update payment config |
| GET | `/api/payments/platform/summary/` | Platform billing summary & invoices |
| POST | `/api/payments/platform/create-order/` | Create platform subscription order |
| POST | `/api/payments/platform/verify/` | Verify platform payment |
| POST | `/api/payments/parent/create-intent/` | Parent online payment intent |
| POST | `/api/payments/parent/verify/` | Verify parent payment |
| POST | `/api/payments/fee-collection/create-order/` | Razorpay order for dashboard fee collection |
| POST | `/api/payments/fee-collection/verify/` | Verify fee-collection payment |

See `PAYMENT.md` for request/response payloads and Razorpay setup.

---

### Django admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/` | Django admin UI (session login) |

## Pricing Plans (Bihar Market)

| Plan | Price | Students | Features |
|------|-------|----------|----------|
| Basic | ₹299/month | 100 | Tuition + 2 fee types, basic dashboard |
| Standard | ₹599/month | 300 | All fee types, WhatsApp reminders, receipts |
| Premium | ₹999/month | Unlimited | Multi-branch, Excel export, 5 logins |

**Launch offer**: Build Standard first, offer at ₹299 for first 6 months.
