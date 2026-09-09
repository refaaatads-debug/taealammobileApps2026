# BOOKING / AVAILABILITY / TIMEZONE — FINAL GAP AUDIT

**Date:** 2026-09-06  
**Mode:** Read-only audit  
**Production mutations:** None  
**Code changes before this report:** None  
**Baseline reports:** `AVAILABILITY_TIMEZONE_PRE_FIX_AUDIT.md`, `AVAILABILITY_TIMEZONE_FINAL_REPORT.md`, `BOOKING_E2E_FINAL_PARITY_AUDIT.md`, `BOOKING_E2E_STAGE7_FINAL_REPORT.md`, `BOOKING_E2E_STAGE8_FINAL_REPORT.md`, `BOOKING_GROUP_STAGE_FINAL_REPORT.md`

## 1. Executive Summary

The current Mobile/API implementation is locally coherent for creating individual and grouped booking-request rows, but it is not yet proven equivalent to the source platform in the areas that protect a real booking:

```text
Availability = PARTIAL
Timezone = BLOCKED
Specific Teacher Booking = PARTIAL
Open Subject Booking = UNVERIFIED
Group Booking = PARTIAL
First Accept Wins = PARTIAL / PRODUCTION UNVERIFIED
Race Conditions = PRODUCTION UNVERIFIED
Server-side Validation = PARTIAL
Production E2E = PRODUCTION BLOCKED
```

The most important confirmed gaps are:

1. `booking_requests` has no assigned `teacher_id`; `accepted_by` is populated only after acceptance.
2. The direct-teacher flow checks and notifies the selected teacher, but the stored request remains visible through subject/stage eligibility rather than target-teacher isolation.
3. No authoritative teacher, student, user/profile, booking, session, or request timezone contract was found in the inspected source, migrations, views, API, or OpenAPI.
4. Availability is represented by weekday names plus clock-only `TIME` fields. No server-side conversion from an ISO instant to a teacher-local weekday/clock is proven.
5. API and Mobile perform client/API checks for future dates, duration, subscription, eligibility, duplicates, and acceptance conflicts, but neither path enforces teacher Availability.
6. The acceptance RPCs conditionally change request status, but booking creation, notifications, and chat bootstrap happen outside those RPCs.
7. First Accept Wins is partially supported by conditional status updates, but the full request-to-booking transaction and concurrent behavior remain Production-unverified.

No timezone, RLS, RPC, trigger, schema, Auth, Storage, VPS, or Production workaround is safe to add before the missing contract is established.

## 2. Source of Truth

### Source platform / GitHub snapshot

The source platform stores teacher schedule data on `teacher_profiles` and links subject eligibility through `teacher_subjects`.

Evidence:

```text
.local/conversation-workspace/files/taealam_build/src/components/teacher/SchedulePricingManager.tsx
.local/conversation-workspace/files/taealam_build/src/pages/Booking.tsx
.local/conversation-workspace/files/taealam_build/src/pages/SearchTeacher.tsx
.local/conversation-workspace/files/taealam_build/src/components/teacher/BookingRequests.tsx
```

The source creates an ordinary JavaScript `Date`, sets local clock fields, then calls `toISOString()` before insertion:

```text
src/pages/Booking.tsx:331-359
src/pages/SearchTeacher.tsx:283-334
```

This proves an implementation conversion, not a documented teacher-timezone contract.

### Database migrations and views

`public.booking_requests` stores:

```text
student_id
subject_id
scheduled_at TIMESTAMP WITH TIME ZONE
duration_minutes
status
accepted_by
accepted_at
```

It does not store `teacher_id` or a timezone:

```text
supabase/migrations/20260402041327_80d54bff-9355-47ca-9ff8-57e312d7158d.sql:3-15
```

Teacher Availability is stored on:

```text
public.teacher_profiles.available_days
public.teacher_profiles.available_from
public.teacher_profiles.available_to
```

The public teacher view exposes those fields, but no timezone:

```text
supabase/migrations/20260401042325_27925b75-6764-4eeb-a8f1-6097309edda8.sql:98-110
supabase/migrations/20260401183914_9621d225-419d-4a65-9686-0bc64de10e07.sql:1-2
supabase/migrations/20260415050615_7bc8a125-5a1b-4df9-854a-d8ced6869864.sql:21-27
```

The inspected schema uses timestamp-with-time-zone columns as instants. A `timestamptz` column alone does not identify the teacher's local timezone.

### API

Relevant implementation:

```text
artifacts/api-server/src/routes/learning.ts:404-424
artifacts/api-server/src/routes/learning.ts:426-584
artifacts/api-server/src/routes/learning.ts:586-751
artifacts/api-server/src/routes/learning.ts:753-960
```

The API uses the Supabase Bearer session, resolves subjects, checks eligibility/subscription/duplicates, creates request rows, and sends notifications. It does not enforce Availability or timezone.

### Mobile

Relevant implementation:

```text
artifacts/ajyal-mobile/lib/teacherAvailability.ts
artifacts/ajyal-mobile/app/booking.tsx
artifacts/ajyal-mobile/app/find-teacher.tsx
artifacts/ajyal-mobile/app/(tabs)/bookings.tsx
```

Mobile filters visible slots locally and sends ISO timestamps. It does not have an authoritative teacher timezone and cannot protect the API from a bypassed or modified request.

### New visual evidence from the source platform

The four attached platform screenshots provide additional source-level UX evidence:

```text
attached_assets/image_1788691279781.png
attached_assets/image_1788691304477.png
attached_assets/image_1788691344777.png
attached_assets/image_1788691368334.png
```

They show two intentionally different booking paths:

#### Open Subject / quick booking path

The first screenshot labels the flow as a quick lesson request and states that the student selects the stage, subject, date, and time, after which the request is sent to specialized teachers. The teacher directory below shows approved teacher cards for the selected context.

This confirms the intended UX contract:

```text
Student chooses subject + stage + slot
→ platform broadcasts a request to the relevant teachers
```

The screenshot supports the subject/stage broadcast intention, but it does not prove the exact database recipient set, RLS predicate, notification fan-out, or First Accept Wins transaction.

#### Specific Teacher path

The second screenshot shows teacher cards with a separate action:

```text
احجز مع هذا المعلم
```

The third screenshot is explicitly headed with the selected teacher's name and says the student should choose from the teacher's available times and that teacher approval is required.

The fourth screenshot confirms:

```text
تأكيد الطلب (1 حصة)
سيتم إرسال 1 طلب للمعلم [selected teacher]
يجب أن يقبل المعلم كل طلب
```

This is strong visual evidence that the intended UX for a selected-teacher request is:

```text
Student → one named teacher → one request for the selected slot → teacher approval
```

It does not, by itself, prove that the persisted `booking_requests` row is target-isolated. The inspected schema still has no `teacher_id`, and the inspected RLS policy is subject/stage based. The correct classification is therefore:

```text
Specific Teacher UX intent = CONFIRMED BY SOURCE SCREENSHOTS
Specific Teacher database/RLS isolation = PRODUCTION UNVERIFIED
```

The screenshots also confirm that the original UI presents teacher Availability days and hours to the student before submission. They do not define timezone, DST, overnight behavior, the `available_to` boundary, or server-side enforcement.

## 3. Availability Contract

### Confirmed fields

```text
teacher_profiles.available_days
teacher_profiles.available_from
teacher_profiles.available_to
```

The schedule manager treats them as:

```text
available_days = recurring weekdays
available_from = daily start clock
available_to = daily end clock
```

`available_days` is a PostgreSQL text array in the schema. The current Mobile parser also accepts native arrays and serialized PostgreSQL/JSON representations to avoid transport-only false emptiness.

### Not confirmed

The following rules have no authoritative source contract:

```text
available_to inclusive or exclusive
available_to = last slot start or end of availability window
slot start + duration <= available_to
30-minute behavior
45-minute behavior
60-minute behavior
overnight windows
DST transitions
NULL behavior
empty-array behavior in every source path
server-side rejection behavior
RPC enforcement behavior
```

The source has conflicting clues:

- `SearchTeacher.tsx` uses a current-clock comparison that allows `hour <= available_to`.
- Mobile's `timeIsAvailable` rejects a start exactly at the end boundary.
- Mobile booking-slot generation applies `start + duration <= available_to`.
- The old direct-booking page can fall back to fixed days/hours when Availability is absent.
- The current directory/Mobile behavior treats missing/empty Availability as no published schedule.

Therefore the safe classification is:

```text
Availability window semantics = UNVERIFIED
Empty Availability fallback = SOURCE MISMATCH / LEGACY BEHAVIOR
```

### Client/API/RPC/DB separation

| Rule | Client | API | RPC | Database constraint/RLS |
|---|---|---|---|---|
| Weekday | Mobile filter | Not checked | Not checked | Not checked |
| `available_from` | Mobile filter | Not checked | Not checked | Not checked |
| `available_to` | Mobile filter | Not checked | Not checked | Not checked |
| Duration inside window | Mobile slot generation | Not checked | Not checked | Not checked |
| Empty Availability | Mobile does not offer slots | Not checked | Not checked | Not checked |
| Timezone conversion | None | None | None proven | None proven |

Client validation is therefore UX protection only.

## 4. Timezone Contract

### Explicit answers

| Question | Finding |
|---|---|
| Teacher timezone anywhere? | Not found in inspected source/schema/API/OpenAPI. Database-wide absence is not fully provable because Production metadata access previously returned `403`. |
| Student timezone anywhere? | Not found in inspected source/schema/API/OpenAPI. |
| User/profile timezone? | Not found. |
| `booking_requests` timezone? | No timezone field; only `scheduled_at TIMESTAMP WITH TIME ZONE`. |
| `bookings` timezone? | No separate timezone field; scheduled timestamp is an instant. |
| `sessions` timezone? | No separate timezone contract found; session timestamps are timestamp values. |
| Other table timezone? | No authoritative timezone field found in the inspected migrations/views/API. Full Production catalog remains unavailable. |
| Device timezone? | The source uses JavaScript `Date` local setters before `toISOString()`, so runtime-local behavior is present. |
| Server timezone? | Not documented or proven as the platform contract. |
| UTC contract? | Not documented. ISO output is UTC-formatted, but that does not define teacher-local scheduling semantics. |
| Browser local time? | Used by the source implementation during `Date` construction. |
| Where is ISO conversion? | `Booking.tsx` and `SearchTeacher.tsx` call `toISOString()` when building request payloads. |
| Is that conversion an original contract? | Only the conversion behavior is visible. No source rule explains which user's timezone it represents. |
| Formal meaning of `available_from/to`? | Daily clock fields are evidenced; timezone semantics are not defined. |

The required explicit classification is:

```text
TIMEZONE CONTRACT = NOT DEFINED IN SOURCE
```

No default UTC, `Asia/Riyadh`, server timezone, teacher timezone, or student timezone may be introduced.

## 5. Specific Teacher Booking

### Source flow

```text
Student → selected teacher → subject → date/time → duration → booking_requests
```

The source reads the selected teacher's Availability and sends a notification to that teacher, but the request table has no assigned teacher column.

### Current API flow

The API:

1. Requires a student role and Supabase Bearer session.
2. Resolves the subject.
3. Verifies the selected teacher is approved.
4. Verifies the teacher is linked to the subject.
5. Sets `notificationTeacherIds` to the selected teacher.
6. Inserts `booking_requests` without `teacher_id`.
7. Sends a notification to the selected teacher.

Evidence:

```text
learning.ts:476-500
learning.ts:513-555
```

### Isolation finding

`booking_requests` contains:

```text
accepted_by
```

but not:

```text
teacher_id
```

The RLS visibility policy is based on:

```text
approved teacher
matching subject
matching teaching stage when present
```

It does not match a selected target teacher:

```text
20260411113946_ed369fc8-7e0d-4637-ad64-fe5c165029ec.sql:9-56
```

The new screenshots strengthen the UI-side intent but do not add a timezone or server-side enforcement rule.

Therefore:

```text
Specific Teacher target isolation = PLATFORM LIMITATION / PRODUCTION UNVERIFIED
```

Impact: the selected teacher receives the intended user-facing request, but the persisted open request is not proven to be visible only to that teacher. Adding a local `teacher_id`, local stage gate, or local RLS substitute would diverge from the existing schema/source model.

## 6. Open Subject Booking

### Eligibility

The source/database model uses:

```text
teacher_profiles.is_approved = true
teacher_subjects.subject_id = requested subject
teaching stage match when the request has a stage
```

The final teacher RLS policy explicitly checks approved status, subject, and optional teaching-stage compatibility:

```text
20260411113946_ed369fc8-7e0d-4637-ad64-fe5c165029ec.sql:9-31
```

The API's open-subject path resolves all approved teachers linked to the subject and sends notifications:

```text
learning.ts:501-511
learning.ts:662-672
```

The API does not filter that list by Availability or teacher-local timezone.

### Request shape

The platform creates one open request row, not one row per teacher. The row has no assigned teacher. Eligible teachers see it through RLS and compete to accept it.

### First Accept Wins

The singular RPC uses a conditional update:

```sql
WHERE id = _request_id
  AND status = 'open'
```

and writes:

```text
status = accepted
accepted_by = _teacher_id
accepted_at = now()
```

Evidence:

```text
20260411111826_ec427cf8-4183-4a96-81d2-64607f2292b7.sql:1-24
```

This supports first-write-wins for the request status itself.

However:

1. The RPC does not check request expiry.
2. The RPC does not check teacher eligibility inside its body.
3. The RPC does not create the booking.
4. Booking creation happens afterward through separate inserts.
5. The source teacher UI calls the SECURITY DEFINER RPC directly.

Therefore:

```text
Open Subject Booking = UNVERIFIED
First Accept Wins = PARTIAL / PRODUCTION UNVERIFIED
```

## 7. Group Booking

### Confirmed local contract

The current Group Booking implementation:

```text
creates one booking_request row per slot
uses one shared group_id
uses one shared expires_at
keeps the singular endpoint for one slot
uses the group endpoint for multiple slots
```

Evidence:

```text
learning.ts:706-720
BOOKING_GROUP_STAGE_FINAL_REPORT.md
```

The OpenAPI contract keeps grouped input and decision semantics explicit:

```text
lib/api-spec/openapi.yaml:1123-1150
```

### Group acceptance

The group RPC updates every open row for the group in one SQL update statement:

```sql
WHERE group_id = _group_id
  AND status = 'open'
```

Evidence:

```text
20260424091937_96f58e91-b9c8-446d-8a9c-65d40b1797f9.sql:45-62
```

The teacher UI and API then create `bookings` separately for returned accepted requests.

### Gaps

The following are not proven atomic as one booking lifecycle:

```text
accept all request rows
create all booking rows
send notifications
create chat bootstrap
```

If the RPC succeeds and a later booking insert fails, the request can remain accepted without all corresponding bookings. The API has a reconciliation/idempotency check, but no database uniqueness/transaction proof was found.

The group RPC also does not perform Availability, expiry, conflict, subscription, or teacher-eligibility checks in its body.

Classification:

```text
Group Booking = PARTIAL
Group all-or-nothing request update = locally supported
Group request-to-booking atomicity = PRODUCTION UNVERIFIED
```

## 8. Server-side Validation

### API validation currently present

The API checks:

```text
authenticated user
Supabase Bearer session
student/teacher role
completed profile fields
integer duration
future scheduled time
subscription/remaining minutes
known subject
selected teacher approval
selected teacher subject eligibility
duplicate open/accepted requests
duplicate pending/confirmed bookings
teacher active-session status before acceptance
teacher booking conflicts before acceptance
group expiry before acceptance
```

Relevant code:

```text
learning.ts:426-584
learning.ts:586-751
learning.ts:753-960
```

It does not check:

```text
teacher available_days
teacher available_from
teacher available_to
teacher timezone
slot start + duration against teacher window
DST/overnight semantics
Availability for every eligible Open Subject teacher
```

### RPC validation

`accept_booking_request` and `accept_booking_group` condition on `status = 'open'` and write acceptance fields. The inspected function bodies do not enforce:

```text
Availability
timezone
expiry
subscription
conflict
teacher approval
teacher subject eligibility
```

The RPCs are `SECURITY DEFINER`, so their internal SQL behavior cannot be equated with an ordinary client update protected by RLS.

### Database validation

Confirmed database protections:

```text
student_id is required by table definition/trigger path
scheduled_at is not null
status has a check constraint in the original migration
RLS restricts ordinary table access
balance trigger checks remaining minutes before inserting a request
```

Balance trigger:

```text
20260502112709_0091531b-8f4b-4b26-b29c-0776a56723e3.sql:1-58
```

It does not check teacher Availability or timezone, and its concurrent reservation behavior has not been proven with Production database tests.

No unique constraint proving duplicate-request prevention was found. API duplicate reads reduce duplicates but are not a database-level race guarantee.

### RLS

RLS proves:

```text
student can insert own request
student can view own request
approved subject-eligible teachers can view open requests
stage compatibility is applied when request stage is present
accepted teacher can view accepted request
```

RLS does not prove:

```text
selected-teacher-only visibility
Availability
timezone
expiry
atomic booking creation
First Accept Wins across the complete lifecycle
```

Production RLS metadata and live policy behavior remain unverified because the prior Supabase metadata probes returned `403`.

## 9. RPC

| RPC | Confirmed behavior | Missing proof |
|---|---|---|
| `accept_booking_request(_request_id, _teacher_id)` | Conditional single-row open→accepted update | No expiry, eligibility, Availability, conflict, subscription, or booking insert |
| `accept_booking_group(_group_id, _teacher_id)` | Conditional update of all open rows in the group | No per-slot validation, eligibility, expiry, Availability, or booking insert |
| `reject_booking_request(_request_ids, _teacher_id)` | Used by source/API for grouped rejection | Live function definition and exact production authorization behavior need verification |

No inspected acceptance RPC creates the corresponding `bookings` row in the same transaction.

## 10. RLS

### Original model

The original policies permit approved teachers linked to the request subject to view/accept open requests:

```text
20260402041327_80d54bff-9355-47ca-9ff8-57e312d7158d.sql:38-66
```

Later policies add teaching-stage compatibility and accepted-by visibility:

```text
20260411113946_ed369fc8-7e0d-4637-ad64-fe5c165029ec.sql:9-56
```

### Finding

The policy is broadcast-oriented and subject/stage-based. It is not target-teacher-based. This matches the stored schema's absence of `teacher_id`, but it does not prove the user-visible “specific teacher” request is isolated to that teacher.

Do not change RLS without explicit authorization and live Production evidence.

## 11. Race Conditions

### What is locally supported

The singular accept RPC uses a conditional update on `status = 'open'`. Two competing updates should not both transition the same request from open, assuming the live function matches the inspected migration.

The group accept RPC uses one conditional update statement over all open rows in a group. It should not allow a second group accept to update rows already accepted, assuming the live function matches the inspected migration.

### What is not proven

```text
RPC definition in Production
RPC authorization under SECURITY DEFINER
two teachers accepting in the same instant
partial group acceptance under concurrent requests
request update + booking insert atomicity
duplicate booking creation after retry
database uniqueness constraints
balance reservation under concurrent inserts
expiry vs acceptance race
conflict check vs acceptance race
```

Required classification:

```text
RACE CONDITION = PRODUCTION UNVERIFIED
```

The API's pre-checks cannot replace conditional database behavior. The API also creates bookings after accepting the request, leaving a failure window between state transition and booking persistence.

## 12. Mobile vs API vs Platform

| Capability | Source platform | API | Mobile | Classification |
|---|---|---|---|---|
| Specific teacher selection | Notification/selection path, no stored target column | Validates selected teacher then notifies only them | Sends selected teacher ID | Partial; target isolation unproven |
| Open subject eligibility | Approved + subject + stage through RLS | Approved + subject notifications; no Availability | Shows eligible directory results | Partial/unverified |
| Availability UX | Reads teacher schedule; legacy fallback exists | Returns schedule, no enforcement | Local filtering | Partial |
| Timezone | Implicit JS local Date conversion | ISO pass-through | ISO pass-through | Contract missing |
| Individual creation | Direct request insert | POST endpoint | Calls singular endpoint | Locally matched |
| Group creation | Multi-row grouped insert | Dedicated group endpoint | Sends group endpoint for multiple slots | Locally matched |
| Group decision | Group RPC | Group RPC then separate booking inserts | Group ID decision | Partial atomicity |
| First Accept Wins | Conditional RPC update | Conditional RPC update | Teacher UI/API path | Partial / Production-unverified |
| Subscription | DB trigger/source flow | Pre-check and metadata | Displays/requests via API | Partial |
| Server-side Availability | Not proven | Absent | Not possible | Blocked |

## 13. Confirmed Mismatches

1. **Specific teacher target mismatch:** the screenshots confirm target-teacher UX, but the selected teacher is not stored in `booking_requests`, and RLS is not target-only.
2. **Timezone mismatch:** source emits ISO from runtime-local `Date`, but no teacher-local interpretation exists.
3. **Availability enforcement mismatch:** Mobile filters locally; API/RPC/RLS do not enforce the schedule.
4. **Boundary mismatch:** source UI, Mobile helper, and duration generation do not establish one authoritative `available_to` rule.
5. **Open Subject Availability mismatch:** eligible teacher notifications are subject/approval based, not proven Availability based.
6. **Acceptance lifecycle gap:** request acceptance and booking creation are separate operations.
7. **Expiry gap:** API/UI check expiry, but inspected accept RPC bodies do not.
8. **Race proof gap:** conditional request updates are visible in source, but the live Production RPC and complete booking transaction are unverified.
9. **Legacy fallback mismatch:** old direct booking can show fixed defaults when schedule data is absent; current Mobile treats absent schedule as unavailable.

## 14. Production Blockers

```text
PRODUCTION BLOCKED
```

Blocking evidence:

1. No authoritative timezone contract.
2. No proven teacher-local conversion.
3. No proven Availability enforcement in API/RPC/DB.
4. No proven selected-teacher-only isolation.
5. No reliable live RPC/RLS metadata verification.
6. No proven request-to-booking transaction for singular or grouped acceptance.
7. No real student/teacher Production E2E with database persistence checks.

The previous Supabase `403` metadata limitation is inconclusive about the presence of objects, but it prevents claiming that live Production behavior matches the inspected source.

## 15. Safe Fixes

Safe local actions after this report may include:

```text
Mobile-only regression tests for parsing and slot display
API/OpenAPI contract tests that preserve existing schema
clear structured error propagation
read-only diagnostics
documentation of source/platform contradictions
```

The previously added local Availability tests are safe because they do not invent timezone behavior or claim server enforcement.

## 16. Unsafe Fixes

Do not add:

```text
UTC default
Asia/Riyadh default
server-local timezone default
teacher timezone inferred from country/language
default availability days
default hours
teacher_id column locally
local RLS substitute
new booking acceptance RPC
Production schema/RLS/RPC/trigger changes
client-only claim that a request is server-valid
mock teachers or slots
```

## 17. Exact E2E Requirements

Production E2E must use real authenticated accounts and inspect persisted state after every operation:

1. Specific Teacher: valid student, selected approved teacher, subject, valid Availability slot.
2. Specific Teacher: slot outside Availability is rejected by the authoritative server path.
3. Specific Teacher: duration crossing `available_to` is rejected.
4. Open Subject: subject/stage/subscription request reaches all eligible teachers.
5. Open Subject: two eligible teachers, one acceptance wins.
6. Open Subject: two concurrent acceptances produce no duplicate booking.
7. Group Booking: multiple valid slots create one group with one row per slot.
8. Group Booking: one invalid slot rejects the group or follows a proven partial rule.
9. Group Booking: accept, reject, expiry, and cancellation behavior is persisted correctly.
10. Subscription: insufficient balance is rejected.
11. Subscription: sufficient balance is accepted without premature minute deduction.
12. Conflict: overlapping teacher booking is rejected.
13. Notifications: only the proven eligible/target recipients receive the request.
14. Persistence: inspect `booking_requests` and `bookings` after create/accept/reject/expiry.
15. Timezone: run only after a real timezone contract is found; test cross-timezone day and boundary behavior.

These tests must not be replaced by TypeScript/build success or unauthenticated guards.

## Final Answers

### Availability

```text
Availability = PARTIAL
```

The fields and local parsing are known, but boundary and server-enforcement semantics are not.

### Timezone

```text
Timezone = BLOCKED
```

```text
TIMEZONE CONTRACT = NOT DEFINED IN SOURCE
```

### Specific Teacher Booking

```text
Specific Teacher Booking = PARTIAL
```

The selected teacher is validated and notified, but request isolation is not represented by the schema/RLS.

### Open Subject Booking

```text
Open Subject Booking = UNVERIFIED
```

Eligibility and conditional acceptance are visible in source, but live RLS/RPC, Availability, and concurrent behavior are not proven.

### Group Booking

```text
Group Booking = PARTIAL
```

Grouped rows and local/API contracts are implemented, but request-to-booking atomicity and Production behavior remain unverified.

### First Accept Wins

```text
First Accept Wins = PARTIAL / PRODUCTION UNVERIFIED
```

Conditional status updates support the intended rule locally, but the complete persisted lifecycle is not atomic or Production-proven.

### Race Conditions

```text
Race Conditions = PRODUCTION UNVERIFIED
```

### Server-side Validation

```text
Server-side Validation = PARTIAL
```

Identity, duration, future time, subscription, subject, duplicate, and some conflict checks exist. Availability/timezone and complete transaction enforcement do not.

### Production E2E

```text
Production E2E = PRODUCTION BLOCKED
```

## Direct Questions

### 1. هل الحجز الآن مطابق للمنصة؟

ليس بشكل كامل. توجد مطابقة محلية في هيكل Group Booking وبعض قواعد eligibility والقبول، لكن توجد فجوات حقيقية في Availability enforcement، timezone، specific-teacher isolation، atomic booking creation، وProduction race behavior.

### 2. ما الشيء الوحيد المتبقي قبل Production E2E؟

ليس هناك إصلاح برمجي واحد آمن يمكن تخمينه. البوابة الوحيدة المشتركة هي الحصول على **authoritative contract and live evidence** من المنصة/Production يثبت timezone وAvailability enforcement وRPC/RLS semantics. بعد ذلك يمكن تنفيذ أي إصلاح Mobile/API/OpenAPI مؤكد، ثم تشغيل E2E الحقيقي.

### 3. هل يمكن الانتقال للجلسات؟

```text
لا.
```

لا تبدأ Sessions أو WebRTC أو Attendance أو minute deduction أو Wallet أو Withdrawals أو Assignments قبل إغلاق فجوات الحجز أو توثيقها صراحة كقيود حقيقية من المنصة.
