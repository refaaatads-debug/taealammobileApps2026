# AVAILABILITY / TIMEZONE — FINAL REPORT

**Date:** 2026-09-06  
**Scope:** Availability, timezone, local time conversion, and booking-slot boundaries  
**Production changes:** None  
**Production E2E:** `PRODUCTION BLOCKED`

## 1. Before

Before this stage:

```text
Core Group Booking = MATCHED LOCALLY
Overall Group Booking = PARTIAL
Availability = not audited
Timezone = not audited
Sessions/WebRTC = not started
Minute Deduction = not started
Production E2E = BLOCKED / UNVERIFIED
```

The stage was intentionally started read-only. No schema, RLS, RPC, trigger, Auth, Storage, VPS, or Production data was changed.

## 2. Root Cause

The main blocker is not missing Mobile parsing. It is the absence of a proven teacher-local timezone contract:

1. Availability is stored as weekday names and clock-only `TIME` values.
2. No teacher timezone field was found in the inspected schema, views, generated types, API, or OpenAPI.
3. The source creates a JavaScript local `Date` and sends `toISOString()`, which performs an implicit runtime-local-to-UTC conversion.
4. The API receives the ISO instant but does not convert it back to a teacher-local weekday/clock.
5. No inspected booking RPC or migration body references the Availability columns for booking enforcement.
6. Production metadata access is blocked by the previously recorded Supabase `403`, so RPC/RLS behavior remains unverified.

Adding UTC, `Asia/Riyadh`, server timezone, or a local fallback would be an unsupported workaround.

## 3. Exact Source of Availability

### Storage

The authoritative storage identified in the source migrations is:

```text
public.teacher_profiles
```

The original table definition contains:

```text
available_from TIME
available_to TIME
```

Evidence:

```text
.local/conversation-workspace/files/taealam_build/
  supabase/migrations/20260401042325_27925b75-6764-4eeb-a8f1-6097309edda8.sql:98-110
```

`available_days` was added later as:

```sql
ALTER TABLE public.teacher_profiles
ADD COLUMN available_days text[] DEFAULT '{}'::text[];
```

Evidence:

```text
supabase/migrations/20260401183914_9621d225-419d-4a65-9686-0bc64de10e07.sql:1-2
```

### Public view

`public.public_teacher_profiles` exposes:

```text
available_days
available_from
available_to
```

Evidence:

```text
supabase/migrations/20260415050615_7bc8a125-5a1b-4df9-854a-d8ced6869864.sql:21-27
```

No timezone field is exposed.

### Meaning

```text
available_days = selected recurring weekdays
available_from = daily window start
available_to = daily window end
```

This meaning is evidenced by:

```text
src/components/teacher/SchedulePricingManager.tsx:26-78
```

Availability belongs to `teacher_profiles`, not `teacher_subjects`. Subject eligibility is a separate relationship:

```text
teacher_subjects.teacher_id → teacher_profiles.id
teacher_subjects.subject_id → subjects.id
```

No subject-specific Availability window was found.

## 4. Exact Timezone Source

```text
No authoritative timezone source found.
```

The inspected source and schema contain no teacher timezone column or booking timezone field.

The source conversion is implicit:

```text
src/pages/Booking.tsx:331-337
src/pages/Booking.tsx:351
src/pages/SearchTeacher.tsx:283-290
src/pages/SearchTeacher.tsx:326
```

The flow is:

```text
selected day + selected clock
→ new Date(day)
→ setHours(hour, 0, 0, 0)
→ toISOString()
```

Therefore the effective timezone is the local timezone of the browser/runtime constructing the `Date`. It is not proven to be the student's account timezone, the teacher's timezone, UTC, or Riyadh.

No DST or overnight-window contract was found.

## 5. Platform vs GitHub/source vs DB vs API vs Mobile

| Area | Source/GitHub evidence | Database evidence | Current API | Current Mobile | Status |
|---|---|---|---|---|---|
| Availability storage | `teacher_profiles` | Confirmed table columns | Reads public view | Consumes fields | `MATCHED` |
| Weekday field | English weekday keys | `text[]` | Normalizes output | Normalizes aliases/transport | `MATCHED` |
| Clock fields | Clock-only daily window | PostgreSQL `TIME` | Returns strings | Parses clock values | `MATCHED` |
| Teacher/subject relationship | Separate joins | `teacher_subjects` FKs | Joins approved teachers and subjects | Filters subject | `MATCHED` |
| Empty Availability | Directory indicates no published schedule | Empty array/null possible | Returns empty values | Does not offer slots | `PARTIAL` |
| Old direct booking fallback | Old source page defaults days/hours when values are absent | No default stored in schema | No equivalent fallback | No default slot offered | `MISMATCH` in source behavior |
| Duration boundary | Not proven in old source | No RPC evidence | Not enforced | Local integer-hour calculation only | `UNVERIFIED` |
| `available_to` boundary | Source “available now” uses inclusive clock comparison; slot generation differs | No constraint found | Not enforced | `timeIsAvailable` is exclusive; booking slots use `start + duration <= to` | `UNVERIFIED` |
| Teacher timezone | Not found | Not found | Not returned | Not represented | `BLOCKED` |
| Local-to-UTC conversion | Implicit browser `Date` | `timestamptz` booking storage | No reverse conversion | Implicit device `Date` | `MISMATCH` |
| Specific teacher enforcement | UI reads teacher schedule | RPC/RLS not proven | No Availability validation | Client filtering only | `PARTIAL` |
| Open subject enforcement | Broadcast eligibility; per-slot Availability not proven | RLS/RPC unverified | No Availability validation | Union of eligible teachers' windows | `UNVERIFIED` |
| Group slot enforcement | Rows per slot; no proven server rule | `group_id` storage confirmed | No Availability validation | Each visible slot filtered locally | `PARTIAL` |
| Overnight/DST | No rule found | No rule found | No rule | No support | `BLOCKED` |

## 6. Fixes

Only confirmed, safe local work was performed:

### Availability test coverage

Added:

```text
artifacts/ajyal-mobile/lib/__tests__/teacherAvailability.test.mjs
```

The tests cover:

- valid and invalid PostgreSQL clock parsing;
- native and serialized weekday representations;
- matching a published weekday;
- rejecting an absent weekday without default days;
- start-of-window acceptance;
- end-of-window rejection in the existing local helper;
- before-window rejection;
- invalid reversed windows.

The tests intentionally do not claim teacher-local timezone behavior.

### Test command

Added to `artifacts/ajyal-mobile/package.json`:

```text
pnpm --filter @workspace/ajyal-mobile run test:availability
```

### What was deliberately not changed

No timezone or server-side Availability rule was added because the source contract is not proven. Specifically, no code was added to:

```text
assume UTC
assume Asia/Riyadh
assume server local time
invent teacher timezone
rewrite Production RPC/RLS
create a new table/column
reject requests using a guessed timezone
```

## 7. Files Changed

```text
artifacts/ajyal-mobile/package.json
artifacts/ajyal-mobile/lib/__tests__/teacherAvailability.test.mjs
AVAILABILITY_TIMEZONE_PRE_FIX_AUDIT.md
AVAILABILITY_TIMEZONE_FINAL_REPORT.md
```

The prior Group Booking implementation and generated contracts were not changed by this Availability stage.

## 8. Tests

Passed:

```text
Availability local tests: 4 passed
Mobile TypeScript: PASS
API TypeScript: PASS
Workspace library typecheck: PASS
API build: PASS
OpenAPI codegen: PASS
Android bundle: PASS
iOS bundle: PASS
git diff --check: PASS
API workflow restart: PASS
Expo workflow restart: PASS
GET /api/healthz: 200
POST /api/booking-requests/group without Auth: 401
POST /api/booking-requests without Auth: 401
GET /api/teachers without Auth: 401
```

The Expo environment still reports the known optional React Native DevTools `libglib-2.0.so.0` warning; Metro, Web, and the Android/iOS bundles remain healthy.

These tests prove local parsing/build behavior only. They do not prove Supabase RLS/RPC behavior, teacher-local timezone correctness, or Production E2E.

## 9. Production Verification

```text
PRODUCTION BLOCKED
```

No real booking, payment, session, or Production data mutation was performed.

Still unverified:

1. Real teacher timezone source.
2. Real teacher-local day conversion.
3. DST behavior.
4. Overnight availability.
5. Inclusive/exclusive `available_to` contract.
6. Server-side validation before insert.
7. RPC validation.
8. RLS enforcement.
9. Open Subject Availability for every eligible teacher.
10. Specific Teacher Availability enforcement.
11. Group Booking validation for every slot.

The existing Supabase metadata limitation (`403 Forbidden`) is an access blocker, not evidence that the tables or functions are absent.

## 10. Remaining Blockers

### Primary blocker: timezone contract

The platform must establish one of the following through authoritative evidence:

```text
teacher timezone column
account/profile timezone
fixed platform timezone with explicit documentation
database/RPC conversion rule
```

Until then, server-side Availability enforcement cannot be implemented safely.

### Secondary blockers

- Production RPC definitions and RLS policies need reliable read-only verification.
- The old source direct-booking fallback must be classified as legacy behavior or explicitly rejected as non-canonical.
- Availability duration semantics need an authoritative boundary rule.
- Open Subject booking needs a proven rule for whether each teacher is checked before broadcast or only when accepting.
- Group Booking needs the same proven rule applied independently to every slot.

## 11. Exact next stage

```text
Next allowed stage: obtain/verify the authoritative timezone and Availability enforcement contract.
```

This can be done through safe read-only Production metadata access and source/platform confirmation.

Do not start:

```text
Sessions/WebRTC
Minute Deduction
Wallet/Withdrawals
```

until Availability/Timezone and the remaining booking E2E blockers are closed.

## Final status

```text
Availability = PARTIAL
Timezone = BLOCKED
Specific Teacher Booking = PARTIAL
Open Subject Booking = UNVERIFIED
Group Booking = PARTIAL
Production E2E = PRODUCTION BLOCKED
```

### Is booking ready for Production E2E?

```text
No, not for a successful Production E2E certification.
```

The local client/build work is healthy, but the authoritative timezone, server-side Availability enforcement, RPC/RLS behavior, and real student/teacher E2E still need verification first.
