# SchoolFee Pro - Fee Management for Bihar Schools

A full-stack SaaS application for school fee management, built for the Bihar market. Built with **Next.js** (frontend) and **Django** (backend).

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
- **Database**: SQLite (default, switch to PostgreSQL for production)

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

### Environment

Create `backend/.env`:

```
DJANGO_SECRET_KEY=your-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
```

Create `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register/` | POST | Register school owner |
| `/api/token/` | POST | Login (get JWT) |
| `/api/token/refresh/` | POST | Refresh token |
| `/api/auth/me/` | GET | Current user |
| `/api/students/` | GET, POST | List/create students |
| `/api/fee-types/` | GET | Fee types (tuition, transport, etc.) |
| `/api/fee-structures/` | GET, POST | Fee amounts per class |
| `/api/student-fees/` | GET, POST | Fee records |
| `/api/student-fees/dashboard/` | GET | Dashboard stats |
| `/api/student-fees/generate_fees/` | POST | Generate fees for month |
| `/api/student-fees/{id}/add_payment/` | POST | Record payment |
| `/api/student-fees/{id}/receipt/` | GET | Download PDF receipt |
| `/api/student-fees/send_reminder/` | POST | WhatsApp reminder (placeholder) |

## Pricing Plans (Bihar Market)

| Plan | Price | Students | Features |
|------|-------|----------|----------|
| Basic | ₹299/month | 100 | Tuition + 2 fee types, basic dashboard |
| Standard | ₹599/month | 300 | All fee types, WhatsApp reminders, receipts |
| Premium | ₹999/month | Unlimited | Multi-branch, Excel export, 5 logins |

**Launch offer**: Build Standard first, offer at ₹299 for first 6 months.

## Roadmap

- [x] Week 1-2: Core MVP (auth, students, fee structure, mark paid/unpaid)
- [x] Week 3: Dashboard, PDF receipt, WhatsApp reminder button
- [ ] Week 4: Razorpay subscription, 30-day trial, go talk to 5 schools in Muzaffarpur!

## License

MIT
