# Attendance Management & Custom Staff Roles — Feature Spec & Cursor Implementation Prompt

> **Purpose of this document:** Hand this file to Cursor (Agent mode) when you are ready to build **Attendance Management** and **Custom Staff Roles**. It is the single source of truth for scope, architecture, and acceptance criteria.
>
> **Important:** All attendance business logic must live in a **new dedicated Django app** named `attendance`. Custom role definitions may extend `schools` (User/staff models) but attendance marking, reports, and class-teacher assignments stay inside `attendance`.

---

## Product summary

School owners need to:

1. **Create custom staff roles** (e.g. Teacher, Clerk, Accountant) with module permissions — not only the fixed `staff` / `accountant` labels.
2. **Assign teachers to classes/sections** they are responsible for.
3. **Let teachers log in** (school code + username, same as staff login at `/login/staff`) and **mark daily attendance** only for their assigned classes.
4. **View attendance reports** — by class, by student, by date; monthly presence %.

Owners and permitted staff see everything; teachers see only assigned classes.

**Scope note:** A teacher belongs to **one school** (same as all staff today) but can be assigned to **multiple classes/sections** within that school. Cross-school teacher accounts are **out of scope** for Phase 1.

---

## Architecture rules (non-negotiable)

1. **New Django app:** `backend/attendance/` — models, serializers, views, services, URLs, admin, migrations, tests.
2. **Register app** in `config/settings.py` → `INSTALLED_APPS`.
3. **Mount URLs** under `/api/attendance/`.
4. **Do not put attendance logic in `schools/views/`** — only read `Student`, `SchoolClass`, `Section`, `User` via FKs and scoped querysets.
5. **Frontend:** New sidebar nav item **Attendance** (`moduleKey: attendance`) and pages under `frontend/src/app/dashboard/attendance/`.
6. **Components:** Reusable UI in `frontend/src/components/attendance/` (not inline-only in page files).
7. **Tenant isolation:** Every attendance row scoped by `school_id`. Teachers filtered by class assignments.
8. **Permissions:** New module `attendance` in staff permission matrix; custom roles store default permissions including this module.

---

## Cursor master prompt (copy-paste to start the build)

```
Build Attendance Management and Custom Staff Roles for SchoolFee Pro per attendance_management.md.

Backend:
- Create Django app `attendance` with models, services, serializers, views, URLs, admin, migrations, and tests.
- Extend schools app for SchoolStaffRole + user staff_role FK + role CRUD (minimal changes only).
- Register attendance in INSTALLED_APPS; wire /api/attendance/ in config/urls.py.
- Implement Phase 1 completely before Phase 2.

Frontend:
- Add Attendance to dashboard sidebar nav (layout.tsx) and staff-modules.ts / module_permissions.py.
- Build dashboard/attendance pages and components/attendance/* per this spec.
- Extend dashboard/staff for custom roles and class assignments for teachers.

Constraints:
- Teachers log in via existing /login/staff (school code + username) — no new auth flow.
- Reuse SchoolScopedMixin, HasModulePermission, GlassCard, PageHeader, api.ts patterns.
- Student list for attendance comes from schools.Student (is_active=True) for the selected class+section+date.
- Do not break existing fee, results, or staff modules.

Deliver Phase 1 with tests and attendance/README.md in the app folder.
```

---

## Phased rollout

### Phase 1 — Core attendance + teacher class assignment (build first)

| Item | Detail |
|------|--------|
| Custom roles | Owner creates roles (name + module permissions); assign role when creating/editing staff |
| Class assignment | Owner assigns staff (especially Teacher role) to one or more class+section pairs |
| Mark attendance | Pick date + class + section → student list with Present / Absent / Late / Leave |
| Bulk actions | Mark all present, save draft, submit/finalize day |
| Teacher view | Teacher sees only assigned classes in attendance UI |
| Owner view | Owner sees all classes |

**Phase 1 acceptance criteria:**

- [ ] Owner creates role “Teacher” with only `attendance.view` + `attendance.edit` (+ optional `students.view`).
- [ ] Owner creates staff user with Teacher role and assigns Class 10-A, Class 10-B.
- [ ] Teacher logs in at `/login/staff` and sees Attendance nav only (plus dashboard if permitted).
- [ ] Teacher can mark attendance for Class 10-A on today’s date; cannot access Class 9.
- [ ] Owner can view and edit any class attendance.
- [ ] Re-opening a finalized day requires `attendance.actions` or owner.
- [ ] Attendance saved per student per date per school (unique constraint).

---

### Phase 2 — Reports & parent visibility (optional later)

| Item | Detail |
|------|--------|
| Reports | Monthly class summary, student attendance %, export CSV |
| Filters | Date range, class, section, status |
| Parent portal | Read-only attendance summary on parent child profile (optional) |
| Notifications | SMS/WhatsApp on absent (optional, premium) |

---

### Phase 3 — Advanced (optional later)

| Item | Detail |
|------|--------|
| Period-wise attendance | Multiple sessions per day (Period 1, Period 2) |
| Holiday calendar | School holidays auto-mark as non-working |
| Biometric / import | CSV import of attendance |
| Integration | Link low attendance to announcements or fee reminders |

---

## Part A — Custom staff roles (extends `schools` app)

Today `User.role` is fixed: `owner`, `accountant`, `staff`, `parent`. Extend with **school-defined roles** without breaking login.

### New model: `SchoolStaffRole` (in `schools` app)

| Field | Type | Notes |
|-------|------|-------|
| `school` | FK → School | CASCADE |
| `name` | CharField | e.g. "Teacher", "Accountant", "Receptionist" |
| `slug` | CharField | unique per school, auto from name |
| `description` | TextField, blank | |
| `module_permissions` | JSONField | Same shape as `User.module_permissions` today |
| `is_system` | Boolean | True for seeded Accountant template; non-deletable |
| `created_at` | DateTime | |

**Unique:** `(school, name)` and `(school, slug)`.

### Change `User` model

| Field | Type | Notes |
|-------|------|-------|
| `staff_role` | FK → SchoolStaffRole, null=True, blank=True | Replaces ad-hoc permission guessing for staff |

**Permission resolution order:**

1. Owner → full access (unchanged).
2. If `user.staff_role` set → start from `staff_role.module_permissions`, then apply per-user overrides if any stored on `User.module_permissions`.
3. Else → legacy `User.module_permissions` JSON (backward compatible).

Keep `User.role` as `staff` or `accountant` for JWT/login; `staff_role` is the **display and permission template**. Optionally map `accountant` to a system `SchoolStaffRole` on migration.

### Staff UI changes (`/dashboard/staff`)

**New sub-sections:**

1. **Roles** tab — list/create/edit/delete custom roles (permission matrix per role).
2. **Staff users** tab — existing list; add **Role** dropdown when creating user.
3. **Class assignments** — on staff edit modal or separate “Assign classes” for users with attendance permission.

**API (schools app):**

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/staff-roles/` | List/create roles |
| GET/PATCH/DELETE | `/api/staff-roles/{id}/` | Manage role |
| GET/PATCH | `/api/staff-users/{id}/` | Include `staff_role` id |

Owner-only for role CRUD. Staff cannot manage roles.

### Seed default roles (data migration)

On school creation or migration, seed:

| Name | Typical permissions |
|------|---------------------|
| Accountant | fee_collection, fee_structure, expenses (if exists), students.view |
| Teacher | attendance.view, attendance.edit, students.view |
| General Staff | students.view, enquiries.view |

---

## Part B — Attendance app (`backend/attendance/`)

### App structure

```
attendance/
├── __init__.py
├── apps.py
├── admin.py
├── models.py
├── serializers.py
├── views/
│   ├── __init__.py
│   ├── sessions.py       # mark attendance for a class/date
│   ├── assignments.py    # teacher ↔ class assignments
│   └── reports.py        # Phase 2
├── services/
│   ├── __init__.py
│   ├── marking.py        # create/update attendance rows
│   ├── access.py         # can user access this class?
│   └── summary.py        # aggregates for reports
├── permissions.py        # AttendanceModulePermission helpers
├── urls.py
├── migrations/
├── tests/
│   ├── test_marking.py
│   ├── test_teacher_scope.py
│   └── test_roles_integration.py
└── README.md
```

---

## Data models (`attendance` app)

### `ClassTeacherAssignment`

Links staff users to classes they may mark attendance for.

| Field | Type | Notes |
|-------|------|-------|
| `school` | FK → School | |
| `staff_user` | FK → User | role in staff/accountant; not owner |
| `school_class` | FK → SchoolClass | |
| `section` | FK → Section | |
| `assigned_at` | DateTime | auto |
| `assigned_by` | FK → User, null=True | owner who assigned |

**Unique:** `(staff_user, school_class, section)`.

### `AttendanceSession`

One row per class + section + calendar date (the “roll call” header).

| Field | Type | Notes |
|-------|------|-------|
| `school` | FK → School | |
| `school_class` | FK → SchoolClass | |
| `section` | FK → Section | |
| `date` | DateField | |
| `status` | CharField | `draft`, `finalized` |
| `marked_by` | FK → User | last editor |
| `finalized_at` | DateTime, null=True | |
| `notes` | TextField, blank | optional class-level note |

**Unique:** `(school, school_class, section, date)`.

### `AttendanceRecord`

One row per student per session.

| Field | Type | Notes |
|-------|------|-------|
| `session` | FK → AttendanceSession | CASCADE |
| `student` | FK → Student | PROTECT |
| `status` | CharField | see choices below |
| `remark` | CharField, blank | optional |

**Unique:** `(session, student)`.

**Status choices:**

| Value | Label |
|-------|------|
| `present` | Present |
| `absent` | Absent |
| `late` | Late |
| `leave` | On leave (approved) |
| `half_day` | Half day |

Default when creating session: `present` or unset until marked.

---

## Access control rules

```text
Owner → all classes in school.

Staff with attendance.view + no assignments → treat as all classes (configurable; default: all classes for non-teachers).

Staff with Teacher role (or explicit assignments) → only assigned class+section pairs.

attendance.edit → can save draft records.
attendance.actions → finalize, re-open finalized session, delete session.
attendance.create → start new session for a date/class if not exists.
```

Implement in `attendance.services.access.user_can_access_class(user, school_class_id, section_id)`.

---

## API design — `/api/attendance/`

### Class assignments (owner / admin staff)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/assignments/` | `attendance.view` or owner | List assignments (filter by staff_user, class) |
| POST | `/assignments/` | owner or `attendance.actions` | Assign staff to class+section |
| DELETE | `/assignments/{id}/` | owner or `attendance.actions` | Remove assignment |
| POST | `/assignments/bulk/` | owner | Set all assignments for one staff user |

### Sessions & marking

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/sessions/` | `attendance.view` | List sessions (filters: date, class, section, status) |
| POST | `/sessions/` | `attendance.create` | Create session for date+class+section; pre-fill students |
| GET | `/sessions/{id}/` | `attendance.view` | Session + all AttendanceRecords |
| PATCH | `/sessions/{id}/` | `attendance.edit` | Update records bulk; body: `{ records: [{ student_id, status, remark }] }` |
| POST | `/sessions/{id}/finalize/` | `attendance.actions` | Lock session |
| POST | `/sessions/{id}/reopen/` | owner or `attendance.actions` | Unlock for corrections |
| POST | `/sessions/mark-all-present/` | `attendance.edit` | Shortcut for draft session |

### Dashboard helper

| Method | Path | Description |
|--------|------|-------------|
| GET | `/my-classes/` | Classes current user may mark (assignments + permissions) |
| GET | `/today-summary/` | Count present/absent today for scoped classes |

### Reports (Phase 2)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/reports/class/` | Monthly % by class |
| GET | `/reports/student/{id}/` | Student history |
| GET | `/reports/export/` | CSV download |

All views use `SchoolScopedMixin` + `HasModulePermission` with `module_key = "attendance"`.

---

## Module registration

Add to **both** backend and frontend module definitions:

```python
# schools/module_permissions.py — add to MODULE_DEFINITIONS
{"key": "attendance", "label": "Attendance", "path": "/dashboard/attendance"},
```

```typescript
// frontend/src/lib/staff-modules.ts
{ key: 'attendance', label: 'Attendance', path: '/dashboard/attendance' },
```

```typescript
// frontend/src/app/dashboard/layout.tsx — add nav item
{ href: '/dashboard/attendance', label: 'Attendance', icon: CalendarCheck, moduleKey: 'attendance' },
```

Import `CalendarCheck` from `lucide-react` (or `ClipboardList`).

---

## Frontend — pages & components

### Routes

| Path | Purpose |
|------|---------|
| `/dashboard/attendance` | Today overview + quick links to mark by class |
| `/dashboard/attendance/mark` | Pick date → class → section → marking grid |
| `/dashboard/attendance/mark/[sessionId]` | Direct link to open session |
| `/dashboard/attendance/reports` | Phase 2 reports |
| `/dashboard/staff/roles` | Custom roles CRUD (or tab on staff page) |

### Components (`frontend/src/components/attendance/`)

| Component | Purpose |
|-----------|---------|
| `attendance-class-picker.tsx` | Date + class + section selectors (respects my-classes) |
| `attendance-marking-table.tsx` | Student rows with status toggles |
| `attendance-status-badge.tsx` | Present/Absent/Late/Leave chips |
| `attendance-summary-cards.tsx` | Today present/absent counts |
| `teacher-class-assignments.tsx` | Owner UI to assign classes to staff |
| `staff-role-form.tsx` | Role create/edit with permission matrix |

### Marking UI behavior

1. User opens **Attendance** → sees classes they can access.
2. Select **date** (default today; no future dates unless owner setting).
3. Select **class** and **section**.
4. If session exists → load records; else POST create session (loads active students for that class+section).
5. Grid: Roll no, Name, status selector, optional remark.
6. Buttons: **Mark all present**, **Save draft**, **Finalize** (if permitted).
7. Finalized sessions show read-only for teachers; owner can reopen.

### API helpers (`frontend/src/lib/api.ts`)

- `getAttendanceMyClasses()`
- `getAttendanceSessions(params)`
- `createAttendanceSession(data)`
- `getAttendanceSession(id)`
- `updateAttendanceSession(id, records)`
- `finalizeAttendanceSession(id)`
- `getStaffRoles()` / `createStaffRole()` / `updateStaffRole()`
- `getClassAssignments()` / `createClassAssignment()` / `bulkAssignClasses()`

---

## Login & teacher workflow

Teachers are **staff users** with a Teacher role:

1. Owner creates role **Teacher** with attendance permissions.
2. Owner creates staff login (username + password) and selects Teacher role.
3. Owner assigns classes (e.g. Class 6-A, Class 7-B).
4. Teacher signs in at **`/login/staff`** with **school code + username + password** (already implemented).
5. Dashboard shows **Attendance** in sidebar (if role has `attendance.view`).
6. Teacher marks attendance only for assigned classes.

No separate teacher portal URL required for Phase 1.

---

## Plan / monetization (optional)

| Plan | Attendance |
|------|------------|
| Basic | ❌ or view-only last 7 days |
| Standard | ✅ full marking + 1 term reports |
| Premium | ✅ reports export + parent view |

Gate in `attendance.services.plan_gates` if needed; default: enabled for Standard+.

---

## Security checklist

- [ ] Teacher cannot mark class not in assignments (403).
- [ ] Teacher cannot view other school data (school scope on every queryset).
- [ ] Student inactive (`is_active=False`) excluded from new sessions.
- [ ] Finalized sessions immutable without `attendance.actions`.
- [ ] Audit: `marked_by` and timestamps on session updates.
- [ ] Rate-limit bulk PATCH if needed.

---

## Testing requirements

**Backend:**

- Owner can create role and staff with that role.
- Teacher assigned to Class 10-A only → 403 on Class 9 POST.
- Create session pre-fills correct students.
- Unique session per class+section+date enforced.
- Finalize locks records; reopen works for owner.
- Permission matrix: role without `attendance.edit` cannot PATCH.

**Frontend (manual):**

- Attendance nav hidden without module permission.
- Marking grid saves and reloads correctly.
- Teacher sees subset of classes in picker.

---

## Implementation order for Cursor (strict)

1. Add `SchoolStaffRole` model + migrations + staff-roles API in `schools`.
2. Add `staff_role` FK on User + permission resolution update.
3. Staff UI: roles tab + role dropdown on staff create/edit.
4. Create `attendance` app + `ClassTeacherAssignment`, `AttendanceSession`, `AttendanceRecord`.
5. Assignments API + access service.
6. Sessions API (create, get, patch, finalize).
7. Register `attendance` module in permissions + sidebar nav.
8. Frontend: attendance overview + marking page + components.
9. Teacher class assignment UI on staff page.
10. Tests.
11. Phase 2 reports (later).

**Do not start frontend marking UI before backend session API works.**

---

## Out of scope (Phase 1)

- Teacher working across multiple schools with one login.
- Substitute teacher / temporary assignment dates.
- GPS / selfie verification for attendance.
- Automatic absent SMS to parents.
- Integration with government UDISE formats.

---

## Related files to touch

| Area | Path |
|------|------|
| New app | `backend/attendance/` |
| Roles | `backend/schools/models.py`, `serializers.py`, `views/auth.py` |
| Permissions | `backend/schools/module_permissions.py` |
| Staff UI | `frontend/src/app/dashboard/staff/page.tsx` |
| Nav | `frontend/src/app/dashboard/layout.tsx` |
| Modules | `frontend/src/lib/staff-modules.ts` |
| Staff login | `frontend/src/app/login/staff/page.tsx` (no change expected) |
| Schema doc | `DB_SCHEMA.md` (update after migrations) |

---

## One-line pitch for schools

> “Apne teachers ko class assign kijiye — woh phone se attendance lagayen; owner ko poora record ek jagah.”

---

*Last updated: spec only — not yet implemented. When implementing, create `backend/attendance/README.md` with API examples.*
