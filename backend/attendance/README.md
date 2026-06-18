# Attendance app

Daily class attendance for SchoolFee Pro. Teachers mark attendance only for assigned class+section pairs; owners see and edit all classes.

## Models

| Model | Purpose |
|-------|---------|
| `ClassTeacherAssignment` | Links a staff user to a class+section within a school |
| `AttendanceSession` | One row per school / class / section / date (draft or finalized) |
| `AttendanceRecord` | Per-student status for a session (present, absent, late, leave) |

Unique constraint: one record per student per session.

## Permissions (`attendance` module)

| Action | Permission |
|--------|------------|
| View attendance UI, sessions, assignments | `attendance.view` |
| Create/update sessions, mark records | `attendance.edit` |
| Finalize, reopen, mark-all-present | `attendance.actions` (owners always allowed) |

Custom roles live in `schools.SchoolStaffRole`; staff users may reference a role or use manual module overrides.

## API (`/api/attendance/`)

| Endpoint | Description |
|----------|-------------|
| `GET my-classes/` | Classes the current user may mark (all for owner; assigned only for teachers) |
| `GET/POST sessions/` | List or create session for date + class + section |
| `GET/PATCH sessions/{id}/` | Load or save draft records |
| `POST sessions/{id}/finalize/` | Lock the day |
| `POST sessions/{id}/reopen/` | Unlock (requires `attendance.actions` or owner) |
| `POST sessions/{id}/mark-all-present/` | Bulk mark present |
| `GET assignments/?staff_user=` | Class assignments (filter by staff) |
| `POST assignments/bulk-set/` | Replace all assignments for a staff user (owner only) |

## Phase 1 flow

1. Owner creates a **Teacher** role with `attendance.view` + `attendance.edit`.
2. Owner creates staff with that role and uses **Staff → Assign classes**.
3. Teacher signs in at `/login/staff` and opens **Attendance**.
4. Owner can view/edit any class; teachers are scoped to assignments.

## Phase 2 — Reports & parent visibility

| Endpoint | Description |
|----------|-------------|
| `GET reports/class/` | Class summaries with per-student presence % (filters: date range, class, section, status) |
| `GET reports/student/{id}/` | Student attendance history + summary |
| `GET reports/export/` | CSV download with same filters |

Parent child profile (`GET /api/parent/children/{id}/`) includes `attendance_summary` for the current month (read-only).

Presence % counts present + late as full days, half-day as 0.5.

SMS/WhatsApp absent notifications are **not** implemented (premium / later).
