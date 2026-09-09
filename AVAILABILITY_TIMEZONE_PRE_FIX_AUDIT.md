# AVAILABILITY / TIMEZONE — PRE-FIX AUDIT

**Date:** 2026-09-06  
**Mode:** READ-ONLY  
**Scope:** Availability, local time, timezone, and their interaction with Specific Teacher, Open Subject, and Group Booking  
**Production writes:** None  
**Schema/RLS/RPC/Trigger changes:** None

## Executive result

```text
Availability storage source: teacher_profiles.available_days / available_from / available_to
Availability timezone source: NOT FOUND
Server-side availability enforcement: NOT FOUND in the inspected API/migrations
Mobile availability filtering: PARTIAL, client-side only
Open Subject availability: PARTIAL / UNVERIFIED
Specific Teacher availability: PARTIAL / UNVERIFIED
Group Booking availability: PARTIAL / BLOCKED for server proof
Production E2E: PRODUCTION BLOCKED
```

The storage contract is identifiable, but the complete booking contract is not closed. No code should claim that a requested instant is in a teacher's local schedule until the timezone/conversion rule is established.

## 1. Evidence inventory

### Source Platform local copy

Inspected:

```text
src/pages/Booking.tsx
src/pages/SearchTeacher.tsx
src/components/teacher/SchedulePricingManager.tsx
src/components/teacher/BookingRequests.tsx
src/integrations/supabase/types.ts
supabase/migrations/*
```

### Git repository available in the workspace

The source workspace is a Git repository at:

```text
.local/conversation-workspace/files/taealam_build
```

HEAD:

```text
8f181e8 Implement learning routes and update booking flow with memory log
```

No separate Mobile repository implementation was found in the previously audited GitHub source; the Mobile comparison remains against the current workspace Mobile artifact.

### Current API/Mobile/OpenAPI

Inspected:

```text
artifacts/api-server/src/routes/directory.ts
artifacts/api-server/src/routes/learning.ts
artifacts/ajyal-mobile/lib/teacherAvailability.ts
artifacts/ajyal-mobile/app/find-teacher.tsx
artifacts/ajyal-mobile/app/booking.tsx
lib/api-spec/openapi.yaml
lib/api-client-react generated teacher contract
```

### Production access

No Production data or schema write was attempted.

The previously recorded Supabase metadata probes returned `403 Forbidden`. This is inconclusive for table/RLS/RPC absence and is not treated as evidence that the objects do not exist.

## 2. Exact Availability source

### Authoritative storage identified from migrations

The original migration creates:

```sql
public.teacher_profiles
```

with:

```sql
available_from TIME,
available_to TIME
```

Migration:

```text
supabase/migrations/20260401042325_27925b75-6765-4168-bb8f-...sql
```

The exact current filename in the source workspace is:

```text
20260401042325_27925b75-6764-4eeb-a8f1-6097309edda8.sql
```

The weekday array was added by:

```text
supabase/migrations/20260401183914_9621d225-419d-4a65-9686-0bc64de10e07.sql
```

```sql
ALTER TABLE public.teacher_profiles
ADD COLUMN available_days text[] DEFAULT '{}'::text[];
```

### Field meaning evidenced by source UI

`SchedulePricingManager.tsx` reads and writes:

```text
available_days
available_from
available_to
```

The UI labels them as:

```text
available_days: selected weekdays
available_from: start of daily availability window
available_to: end of daily availability window
```

The source teacher type confirms:

```text
available_days: string[] | null
available_from: string | null
available_to: string | null
```

### Public read surface

The source creates `public.public_teacher_profiles` and exposes:

```sql
available_days,
available_from,
available_to
```

The view does not expose a timezone field.

### Relationships

Availability is stored on `teacher_profiles`, linked to the teacher through:

```text
teacher_profiles.user_id → auth.users.id
```

It is not stored on `teacher_subjects`.

`teacher_subjects` supplies subject eligibility:

```text
teacher_subjects.teacher_id → teacher_profiles.id
teacher_subjects.subject_id → subjects.id
```

Therefore:

```text
Availability belongs to the teacher profile.
Subject belongs to teacher eligibility.
```

The inspected schema does not establish a subject-specific availability window.

## 3. Days and time formats

### Days

The teacher UI stores English weekday keys:

```text
saturday
sunday
monday
tuesday
wednesday
thursday
friday
```

The source `Booking.tsx` maps JavaScript `Date.getDay()` to the same English keys.

The current Mobile normalizer accepts:

```text
native arrays
JSON arrays
serialized PostgreSQL arrays
comma/Arabic-comma/semicolon/pipe-delimited strings
Arabic and English weekday aliases
```

This transport normalization is safe because it does not invent days; it only normalizes the same stored value.

### Times

The database type is PostgreSQL `TIME`.

The source UI reads the hour portion and generates hourly labels. The current Mobile parser accepts `HH`, `HH:MM`, and rejects invalid values.

No evidence was found that the source stores a timezone offset in `available_from` or `available_to`.

## 4. Timezone audit

### Explicit timezone field

```text
NOT FOUND
```

Searches across the inspected source, migrations, generated Supabase types, API, OpenAPI, and Mobile found no teacher-profile timezone column or booking-timezone field.

The only unrelated timezone-like source reference found was a fixed `Asia/Riyadh` value in an AI-support function, not in the booking availability contract. It cannot be used as the teacher booking timezone without explicit contract evidence.

### Where conversion happens

The source booking UI constructs a JavaScript `Date` using local date/time setters and then sends:

```text
scheduled.toISOString()
```

This means the browser/runtime performs an implicit local-runtime-to-UTC conversion.

Evidence:

```text
src/pages/Booking.tsx
  selected day + selected hour
  new Date(day)
  scheduled.setHours(hour, 0, 0, 0)
  scheduled.toISOString()

src/pages/SearchTeacher.tsx
  selected day + selected hour
  new Date(day)
  scheduled.setHours(hour, 0, 0, 0)
  scheduled.toISOString()
```

The API receives the ISO instant and does not perform a teacher-local timezone conversion before inserting the request.

### Consequence

The actual effective timezone is the timezone of the client/runtime that constructs the Date, not a teacher-specific timezone proven by the database.

Therefore:

```text
Teacher local timezone: UNVERIFIED
Student local timezone: runtime-dependent
Conversion ownership: implicit frontend Date conversion
Canonical server conversion: NOT FOUND
```

Assuming UTC or `Asia/Riyadh` would be an unsupported workaround.

## 5. Availability rule audit

### Source direct-teacher page

`src/pages/Booking.tsx`:

- Loads `public_teacher_profiles.available_days/from/to` for a selected teacher.
- Filters visible days when `available_days` is non-empty.
- Generates hourly slots from `available_from` through the hour before `available_to`.
- Does not calculate `start + duration <= available_to`; the old source UI uses one-hour slots and does not have a verified duration-boundary rule.
- If direct teacher availability is missing, it falls back to all days and fixed default hours:

```text
3:00 م through 9:00 م
```

This is a source implementation fallback, not a proven valid availability contract. It conflicts with the source directory behavior and the explicit no-default requirement for the current stage.

### Source teacher directory

`src/pages/SearchTeacher.tsx`:

- Reads approved teacher profiles.
- Joins public profiles and teacher subjects.
- Uses `available_from` and `available_to` for the “available now” label.
- Does not use a teacher timezone.
- Compares current browser `getHours()` / `getMinutes()` directly with stored clock strings.
- Uses an inclusive `current <= available_to` comparison for “available now”.
- Does not use availability to enforce booking inserts.

### Source open-subject flow

The open flow selects multiple slots and creates one row per slot, but the inspected code does not establish a server-side availability check for every eligible teacher before inserting the broadcast request.

Teacher visibility is instead governed by the existing teacher/subject and platform visibility rules. Availability filtering for the exact requested slot is not proven.

### Source specific-teacher flow

The direct flow reads the selected teacher's availability for the UI, but no database/RPC enforcement of the requested instant against that window was found in the inspected migrations.

### RPC and trigger search

The inspected migration search found the availability columns and view projections but no booking RPC/function body referencing:

```text
available_days
available_from
available_to
timezone
```

The exact Production RPC definitions remain unverified because the available metadata access is blocked.

## 6. Current API comparison

### Directory API

`GET /api/teachers`:

- Reads `public_teacher_profiles`.
- Requires an authenticated Supabase student.
- Requires `is_approved = true`.
- Joins `public_profiles`.
- Joins `teacher_subjects` and `subjects`.
- Returns:

```text
availableDays
availableFrom
availableTo
```

- Does not return timezone.

### Booking API

`POST /api/booking-requests` and `POST /api/booking-requests/group` currently validate:

```text
authentication
student role
profile completeness
subject existence
teacher approval and subject eligibility
future instant
duration
duplicate requests/bookings
subscription minutes
```

They do not validate:

```text
requested instant against available_days
requested instant against available_from/available_to
teacher-local weekday
teacher-local timezone
start + duration <= available_to
open-subject availability per eligible teacher
```

This is a confirmed local API gap, but the correct server-side fix is blocked until the authoritative timezone/conversion contract is established.

## 7. Current Mobile comparison

### Teacher directory

`app/find-teacher.tsx`:

- Displays availability status from `availableDays`, `availableFrom`, `availableTo`.
- Uses the device/runtime local `Date`.
- Does not know a teacher timezone.
- Passes availability fields to `booking.tsx`.

### Booking screen

`app/booking.tsx`:

- Specific teacher: reads availability from the selected teacher payload.
- Open subject: unions availability days and time windows across eligible teachers.
- Filters day options by `available_days`.
- Generates hourly starts with:

```text
lastStartHour = floor((available_to - duration) / 60)
```

- Therefore, for its current integer-hour UI, it attempts to keep:

```text
start + duration <= available_to
```

- Does not account for a teacher timezone.
- Converts selected local device time to ISO through `Date.toISOString()`.
- Uses client filtering only; API can still be called with a bypassed/out-of-window ISO value.
- Group Booking applies the same local UI calculation independently per slot, but server-side verification is absent.

### Current Mobile risk

The Mobile UI is stricter than the old source fallback in some cases, but it can still send a slot whose weekday/hour is valid only in the student's runtime timezone and invalid in the teacher's intended local timezone.

## 8. Required boundary semantics

The following rules are not proven by the inspected source/database contract:

| Rule | Evidence | Status |
|---|---|---|
| `available_days` day matching | Source UI and current Mobile | `PARTIAL` |
| `available_from` inclusive | Source hourly loop starts at `from` | `PARTIAL` |
| `available_to` inclusive/exclusive | Different source comparisons; no canonical booking rule | `UNVERIFIED` |
| `start + duration <= available_to` | Current Mobile applies it; source booking does not prove it | `UNVERIFIED` |
| 30/45/60 minute behavior | Current Mobile applies duration; source does not prove all boundaries | `UNVERIFIED` |
| Overnight window | Source rejects `to <= from`; no wraparound rule found | `UNVERIFIED` |
| DST | No timezone contract | `BLOCKED` |
| teacher-local weekday | No teacher timezone | `BLOCKED` |
| open booking checks every teacher | Not proven | `UNVERIFIED` |
| specific teacher check | UI only; no server/RPC proof | `UNVERIFIED` |
| every group slot independently | Mobile UI yes; server no | `PARTIAL` |

## 9. Parity matrix

| Area | Source Platform | GitHub/source repo | Database/migrations | API | Mobile | Status |
|---|---|---|---|---|---|---|
| Storage location | `teacher_profiles` | same source | confirmed | reads public view | consumes API fields | `MATCHED` |
| Weekday field | `available_days text[]` | same source | confirmed | normalizes output | normalizes input | `MATCHED` |
| Daily bounds | `available_from/to TIME` | same source | confirmed | returns strings | parses clock | `MATCHED` |
| Subject relationship | separate `teacher_subjects` | same source | confirmed | joins eligibility | filters subjects | `MATCHED` |
| Public teacher read | approved view/profile joins | same source | view/RLS metadata partly unverified | implemented | implemented | `PARTIAL` |
| Missing availability | old Booking page defaults hours | directory says no published schedule | no server rule found | returns empty values | refuses empty windows | `MISMATCH` |
| Duration boundary | not proven in source | not proven | no RPC evidence | absent | local-only | `MISMATCH` |
| Timezone field | none found | none found | none found | absent | absent | `UNVERIFIED` |
| Timezone conversion | implicit browser Date | implicit browser Date | timestamptz storage only | no conversion | implicit device Date | `MISMATCH` |
| Specific-teacher enforcement | UI filtering only | same source | RPC unverified | absent | client-only | `PARTIAL` |
| Open-subject enforcement | broadcast eligibility; exact availability check unproven | same source | RLS/RPC unverified | absent | union UI only | `UNVERIFIED` |
| Group slot enforcement | rows per slot; no proven server availability check | same source | group storage confirmed | absent | each UI slot filtered | `PARTIAL` |
| Overnight/DST | not found | not found | not found | absent | rejects overnight / no DST | `BLOCKED` |

## 10. Classification before fixes

```text
Availability = PARTIAL
Timezone = BLOCKED
Specific Teacher Booking = PARTIAL
Open Subject Booking = UNVERIFIED
Group Booking = PARTIAL
Production E2E = PRODUCTION BLOCKED
```

## 11. Confirmed local gaps versus blocked gaps

### Confirmed and potentially fixable without schema changes

- Preserve the current Mobile rule that empty Availability produces no selectable slot.
- Add unit tests for parsing and local boundary calculations without claiming they represent teacher-local time.
- Ensure the API contract does not advertise timezone semantics that do not exist.
- Keep Group Booking using the same availability calculation for every selected slot.

### Blocked until authoritative contract access

- API enforcement of teacher-local weekday/time.
- Open-subject availability validation per eligible teacher.
- Specific-teacher server-side availability validation.
- DST behavior.
- Overnight windows.
- Inclusive/exclusive `available_to` rule.
- Production RPC/RLS enforcement.

No workaround using UTC, Riyadh, server timezone, fixed hours, default availability, or local fallback is authorized by the evidence.

## 12. Required tests after a contract is proven

The tests requested by the stage cannot all be truthfully marked PASS yet:

```text
inside window
before window
after window
exactly at available_to
day absent
30/45/60 duration
student/teacher timezone difference
multiple Group Booking slots
Open Subject per eligible teacher
Specific Teacher
no default hours
no mock/fallback availability
```

The first six local parser/window tests can be added without Production writes. The timezone, open-subject, specific-teacher, and server-enforcement tests require the authoritative timezone/conversion and RPC/RLS contract first.

## Decision before code changes

```text
PRE-FIX AUDIT CREATED
No code changed in this audit turn.
PRODUCTION BLOCKED
Timezone contract is the primary blocker.
```

Any post-audit code change must remain inside Mobile/API/OpenAPI and must not invent a timezone or server-side rule that the platform has not established.
