# BOOKING E2E STAGE 8 — PRE-FIX AUDIT

**Date:** 2026-09-06  
**Scope:** Mobile/API parity for the complete booking system  
**Naming note:** This requested “Stage 8” still covers booking parity and closure. It does not start Sessions/WebRTC/Attendance or billing work.  
**Mode:** Read-only audit completed before new fixes. No Production write and no schema/RLS/RPC/trigger/function change.

## Executive Summary

The booking system has two distinct flows:

1. Specific teacher booking.
2. Open subject booking with teacher fan-out and First Accept Wins.

The current Mobile/API contract is directionally aligned with the original source, but it is not 100% parity. The confirmed gaps are:

1. The original web can submit multiple slots in one grouped submission; the current API contract accepts one slot per request.
2. Mobile prevents many invalid Availability selections, but API does not perform equivalent server-side Availability/timezone validation before inserting `booking_requests`.
3. Acceptance is a two-step local/API flow: RPC changes request state, then API inserts `bookings`. The available Production RPC source does not prove a transaction covering both.
4. The `reject_booking_request` implementation is not present in the checked local migration sources; its Production behavior is therefore unverified.
5. The local Drizzle `bookings` schema is not the Supabase booking schema used by the remote path. Supabase is the source of truth for booking operations.
6. The API uses pre-insert duplicate checks, but there is no proven unique constraint or atomic create RPC protecting concurrent duplicate requests.

No fallback, random teacher, fake Availability, fake subscription, local booking replacement, RLS bypass, or Production modification was introduced.

## 1. Source of Truth

### Original platform/source

```text
.local/conversation-workspace/files/taealam_build/src/pages/Booking.tsx
.local/conversation-workspace/files/taealam_build/src/components/teacher/BookingRequests.tsx
.local/conversation-workspace/files/taealam_build/supabase/migrations/
```

### Current Mobile

```text
artifacts/ajyal-mobile/app/booking.tsx
artifacts/ajyal-mobile/app/find-teacher.tsx
artifacts/ajyal-mobile/lib/teacherAvailability.ts
```

### Current API/OpenAPI

```text
artifacts/api-server/src/routes/learning.ts
artifacts/api-server/src/routes/directory.ts
lib/api-spec/openapi.yaml
lib/api-zod/src/generated/
lib/api-client-react/src/generated/
```

### Database sources

Supabase migrations define the relevant remote tables and policies:

```text
20260402041327_80d54bff-9355-47ca-9ff8-57e312d7158d.sql
20260401042325_27925b75-676a-4eeb-a8f1-6097309edda8.sql
20260411111826_ec427cf8-4183-4a96-81d2-64607f2292b7.sql
20260411113946_ed369fc8-7e0d-4637-ad64-fe5c165029ec.sql
20260424091937_96f58e91-b9c8-446d-8a9c-65d40b1797f9.sql
fix_booking_requests_rejected_status.sql
```

The API booking path uses Supabase REST/RPC directly. The local Drizzle `bookingsTable` is used for the legacy/local path and is not equivalent to the Supabase booking table.

## 2. Original Specific Teacher Flow

### Required path

```text
Student UI
  -> selected teacher
  -> teacher subject
  -> profile/stage completion
  -> real Availability
  -> future date/time
  -> subscription duration/balance
  -> booking_requests insert
  -> selected teacher notification
  -> teacher decision
  -> acceptance RPC
  -> booking
  -> session only if the platform contract creates one
```

### Original source evidence

`Booking.tsx`:

- reads the selected teacher profile.
- reads `teacher_subjects`.
- limits direct subject options to the teacher’s subjects.
- reads `available_days`, `available_from`, `available_to`.
- builds request rows without a target `teacher_id`.
- sends the request notification to the selected teacher.

Relevant paths:

```text
Booking.tsx:221-240
Booking.tsx:311-360
Booking.tsx:364-405
```

### Current API

`POST /api/booking-requests`:

- requires local session.
- requires Supabase Bearer.
- requires student role.
- requires profile name, phone and teaching stage.
- checks active subscription/balance.
- resolves subject by exact name.
- validates selected teacher approval.
- validates `teacher_subjects`.
- inserts a request without `teacher_id`.
- notifies selected teacher.

Relevant paths:

```text
learning.ts:424-495
learning.ts:507-577
```

### Current Mobile

Mobile:

- receives `teacherId`.
- reads the selected teacher’s `public_teacher_profiles` row.
- reads subjects by `teacher_profiles.id`.
- normalizes Availability.
- only allows real slots in the displayed window.
- sends `teacherId` optionally through the API contract.

Relevant paths:

```text
booking.tsx:100-228
booking.tsx:229-300
booking.tsx:320-327
```

### Result

```text
Specific teacher UI/eligibility mapping: MATCHED LOCALLY
Specific teacher request target isolation: PARTIAL
Specific teacher server-side Availability: UNVERIFIED
Specific teacher Production E2E: BLOCKED
```

The request has no target `teacher_id` column in the inspected Supabase schema. A notification recipient is not equivalent to strict database-level target isolation.

## 3. Original Open Subject Flow

### Required path

```text
Student
  -> subject
  -> date/time/duration
  -> no teacher selection
  -> eligible teacher discovery
  -> subject + approval + Availability rules
  -> fan-out notification
  -> one teacher accepts
  -> request winner is fixed
  -> booking/session follows the platform contract
```

### Current API

When `teacherId` is absent:

- resolves the subject.
- reads `teacher_subjects` joined to approved `teacher_profiles`.
- sends notifications to the approved subject teachers.
- inserts one open request.

The API does not select the first teacher, a random teacher, or a local fallback.

### Current Mobile

Mobile:

- loads `/teachers` only in open mode.
- derives subject options from returned teacher subjects.
- unions real Availability days across teachers matching the selected subject.
- creates slots from each teacher’s published window.
- refuses submission when there are no matching teachers/slots.

### Confirmed gap

The API’s open eligibility query checks subject relation and approval for notification, but it does not re-check each teacher’s Availability/timezone against the submitted `startsAt`.

This means a direct API caller may submit a time that the Mobile UI would not present.

### Result

```text
Open request shape: MATCHED
No random teacher: MATCHED
Subject/approval fan-out: PARTIAL
Server-side Availability eligibility: MISMATCH/UNVERIFIED
Production E2E: BLOCKED
```

The exact source-platform behavior for server-side Availability enforcement is not proven by the inspected original API/database migrations. Therefore no new server-side rule should be invented without that proof.

## 4. Eligibility

### Student

Current API requires:

```text
authenticated local session
Supabase Bearer
student role
full_name/display_name
phone
teaching_stage
active subscription
remaining available minutes
```

Status: `MATCHED LOCALLY`.

### Specific teacher

Current API requires:

```text
public_teacher_profiles.user_id = selected teacher
is_approved = true
teacher_subjects.teacher_id = public_teacher_profiles.id
teacher_subjects.subject_id = selected subject
```

Status: `MATCHED LOCALLY`.

### Open teachers

Current API requires:

```text
teacher_subjects.subject_id = selected subject
teacher_profiles.is_approved = true
```

Missing/unverified in API:

```text
teacher availability at requested time
teacher timezone
teacher stage compatibility as an explicit request condition
```

Status: `PARTIAL`.

### Stage

The original `booking_requests` table was later given a nullable `teaching_stage` column:

```text
20260411113946...sql:1-2
```

The RLS stage policy explicitly allows:

```sql
booking_requests.teaching_stage IS NULL
OR booking_requests.teaching_stage = ''
OR booking_requests.teaching_stage = ANY(tp.teaching_stages)
```

The current API does not send `teaching_stage`, matching the direct original request shape and relying on the nullable policy behavior.

Status: `MATCHED FOR CURRENT CONTRACT`.

## 5. Availability

### Source fields

The source uses:

```text
available_days
available_from
available_to
```

The public teacher profile view is derived from teacher profile data. The checked schema/migrations do not prove a teacher timezone column or a timezone conversion function for booking.

### Mobile behavior

`teacherAvailability.ts` supports:

- arrays.
- JSON array strings.
- PostgreSQL array-like strings.
- comma, Arabic comma, semicolon and pipe separators.
- Arabic and English weekday aliases.
- numeric weekday tokens.

`booking.tsx`:

- filters days through `dayIsAvailable`.
- parses the from/to window.
- ensures `start + duration <= available_to`.
- excludes past hours for today.
- does not use fixed default hours.

### API behavior

`directory.ts` normalizes and returns profile Availability, but `POST /booking-requests` does not validate:

```text
available_days
available_from
available_to
timezone
```

against the request time before insert.

### Result

```text
Availability source mapping: MATCHED
Mobile slot filtering: MATCHED LOCALLY
API/server enforcement: PARTIAL
Timezone: UNVERIFIED
```

### Safe fix decision

Adding server-side Availability rejection would change business behavior unless the original source/Production RPC proves that rule. It is therefore not a safe local-only fix at this point.

## 6. Date, Time and Duration

### Date/time

Mobile converts the selected local device date/hour to ISO. API rejects times in the past.

The source database stores `scheduled_at` as `TIMESTAMP WITH TIME ZONE`, but the migrations do not define the teacher timezone used to interpret the published window.

Status: `PARTIAL / TIMEZONE UNVERIFIED`.

### Duration

Current API contract:

```yaml
durationMinutes:
  minimum: 15
  maximum: 180
```

Mobile obtains `session_duration_minutes` from an active subscription and does not invent the duration when the subscription has not loaded. The original web groups requests using the fixed session duration determined from its subscription flow.

Status: `MATCHED LOCALLY / E2E UNVERIFIED`.

### Confirmed duration/group gap

The original web can submit multiple selected slots with:

```text
same group_id
multiple booking_requests rows
```

The current OpenAPI/API request accepts one `startsAt` per call. The current Mobile screen also calls the mutation once for one selected slot.

Status: `MISMATCH/PARTIAL`.

This is a real parity gap for multi-slot group creation, but changing it requires confirming whether Mobile is required to expose the original multi-select group behavior.

## 7. Subscription and Remaining Minutes

### Current API

`getBookingSubscription` reads:

```text
user_subscriptions
bookings
booking_requests
```

and calculates:

```text
sum(active remaining_minutes)
- future pending/confirmed booking minutes
- future open/accepted request minutes
```

It excludes the current group when called during teacher acceptance.

### Current Mobile

Mobile repeats a read-only balance calculation for display and submit gating:

```text
active subscriptions
future bookings
future open/accepted requests
```

### Source billing

The inspected source and existing parity reports do not prove that request creation should debit minutes. Session completion remains the proven billing boundary.

### Race gap

The API checks allowance before insert; it does not atomically reserve minutes with request creation.

Status:

```text
Normal path: MATCHED LOCALLY
Concurrent last-minutes protection: BLOCKED
```

This cannot be safely solved with a Mobile-only guard.

## 8. Create Request and Database Contract

### Supabase request table

The original migration defines:

```text
booking_requests.id
student_id
subject_id
scheduled_at
duration_minutes
price
status
accepted_by
accepted_at
created_at
updated_at
```

Later migrations add:

```text
teaching_stage
group_id
expires_at
```

There is no inspected `teacher_id` target column.

### Current insert

The API inserts:

```json
{
  "student_id": "...",
  "subject_id": "...",
  "scheduled_at": "...",
  "duration_minutes": 60,
  "status": "open",
  "accepted_by": null,
  "expires_at": "...",
  "group_id": "..."
}
```

### Status

```text
Single request contract: MATCHED
Target teacher column: BLOCKED BY PRODUCTION SCHEMA
Multi-slot group create: PARTIAL/MISMATCH
```

## 9. RLS

### Request insert

The original policy allows a student to insert their own request:

```sql
auth.uid() = student_id
```

### Teacher visibility

The inspected policy allows an approved teacher to view open requests when:

```text
teacher subject matches request subject
```

The later policy adds nullable `teaching_stage` matching.

There is no target teacher filter in the inspected policy.

### Teacher update

The inspected policy allows an approved subject teacher to update an open request, and the later policy requires:

```text
status = accepted
accepted_by = auth.uid()
accepted_at IS NOT NULL
```

The API uses a `SECURITY DEFINER` RPC for acceptance, so direct RLS behavior and RPC behavior are not identical proof.

### Status

```text
Student own insert/view: MATCHED
Open subject teacher visibility: MATCHED for subject/stage policy
Specific target-only isolation: MISMATCH/BLOCKED
```

## 10. Accept and First Accept Wins

### RPC source found

`accept_booking_request`:

```sql
UPDATE booking_requests
SET status = 'accepted',
    accepted_by = _teacher_id,
    accepted_at = now()
WHERE id = _request_id
  AND status = 'open';
```

It returns whether one row was updated.

`accept_booking_group`:

```sql
UPDATE booking_requests
SET status = 'accepted',
    accepted_by = _teacher_id,
    accepted_at = now()
WHERE group_id = _group_id
  AND status = 'open'
RETURNING *;
```

### What this proves

The conditional update is compatible with First Accept Wins at the request-row level: concurrent updates to the same open row should not both update that row.

### What it does not prove

The checked RPCs do not themselves:

```text
insert bookings
insert sessions
send notifications
reserve minutes
check teacher role
check teacher Availability
check teacher ownership/target
```

The current API performs those steps around the RPC.

### Current API acceptance

```text
read open request
check expiry
check teacher role
check teacher active session
check schedule conflict
check student allowance
call acceptance RPC
insert missing bookings
send notification
```

This is not proven to be one database transaction.

### Status

```text
RPC conditional request claim: MATCHED
Concurrent Production proof: UNVERIFIED
RPC + booking atomicity: BLOCKED
First Accept Wins overall: UNVERIFIED
```

## 11. Reject

The API calls:

```text
reject_booking_request
```

The checked local migration set contains the status constraint repair that mentions this RPC, but the RPC function definition itself was not found in the checked local migration sources.

Therefore:

```text
API contract: MATCHED LOCALLY
Production RPC implementation: UNVERIFIED
Reject E2E: UNVERIFIED
```

The API treats rejection as authoritative even if notification delivery fails. This matches the current source decision, but a notification delivery failure is not a rejection failure.

## 12. Booking and Session Creation

### Supabase schema

`bookings` contains:

```text
student_id
teacher_id
subject_id
scheduled_at
duration_minutes
status
subscription_id
```

`sessions` contains:

```text
booking_id UNIQUE
room_id
started_at
ended_at
```

### Current path

The teacher acceptance API inserts `bookings` after acceptance. It does not prove a `sessions` insert in the same route.

### Status

```text
Booking insert path: PARTIAL
Session creation after booking: UNVERIFIED
Booking/session atomicity: BLOCKED
```

Stage 8 booking parity must not assume that session creation belongs to this request/accept contract until the source proves it.

## 13. Notifications

### Current behavior

Create:

- specific: selected teacher.
- open: approved subject teachers.

Accept:

- student notification.
- optional push.
- optional chat bootstrap.

Reject:

- student notification.

### Gaps

- notifications are best-effort after database writes.
- notification insert does not prove device delivery.
- no duplicate notification constraint is proven for retry/race paths.

Status: `PARTIAL / E2E UNVERIFIED`.

## 14. Expiration and Cancellation

### Expiration

Current code:

- stores `expires_at`.
- maps an open expired request to display status `expired`.
- blocks teacher decision after expiry.

No checked source proves a cron/trigger/Edge Function that mutates the stored status to `expired`.

Status: `PARTIAL`.

### Cancellation

Existing source/report evidence identifies cancellation fields and flows, but no safe local change can prove refund/minute restoration or financial side effects.

Status: `UNVERIFIED / PRODUCTION DEPENDENT`.

## 15. Database Integrity

### Confirmed protections

- `booking_requests.status` conditional update in accept RPC.
- `sessions.booking_id` unique constraint.
- RLS for student-owned request creation.
- RLS for subject/approval teacher visibility.
- `teacher_subjects` unique `(teacher_id, subject_id)`.
- `bookings` foreign keys for users/subjects/subscriptions.

### Missing/unproven protections

- unique constraint for duplicate student request at same time.
- atomic balance reservation at request creation.
- atomic RPC acceptance plus booking insert.
- atomic group acceptance plus all booking inserts.
- target teacher isolation.
- availability/timezone validation in Production.
- `reject_booking_request` function source.

Status: `PARTIAL / BLOCKED`.

## 16. Mobile/API/OpenAPI Parity Matrix

| Capability | Original | API | Mobile | Status | Safe local fix? |
|---|---|---|---|---|---|
| Specific teacher | selected teacher + subject | validates profile/subject | validates profile/subject | `MATCHED/PARTIAL` | no target isolation |
| Open subject | fan-out by subject/eligibility | fan-out approved subject teachers | no teacher selection | `PARTIAL` | Availability source needed |
| Request target | no proven target column | no target column | optional teacherId input only | `BLOCKED` | Production schema/RLS |
| Availability source | profile fields | directory maps fields | real slot filtering | `PARTIAL` | server rule unproven |
| Timezone | not defined in inspected source | ISO conversion only | device local to ISO | `UNVERIFIED` | needs source/Production |
| Duration | subscription-derived | bounded input + allowance | subscription-derived | `MATCHED LOCALLY` | no |
| Single request | supported | supported | supported | `MATCHED` | no |
| Multi-slot group | web supports shared group | one request per call | one mutation per call | `MISMATCH/PARTIAL` | potentially API/Mobile |
| Duplicate create | source protection unclear | read-before-insert | pending button | `PARTIAL` | atomic Production needed |
| Accept | RPC + booking flow | RPC then inserts bookings | not teacher-owned | `PARTIAL` | atomicity Production |
| Reject | source RPC | RPC call | not student-owned | `UNVERIFIED` | RPC source needed |
| Expiry | expires_at/display behavior | expiry guard/display | display | `PARTIAL` | authoritative mutation unknown |
| Notification | DB/realtime/push | DB/push | API/realtime | `PARTIAL` | E2E needed |
| Session | downstream/contract unclear | not created in accept route | not created by student | `UNVERIFIED` | outside booking proof |

## 17. Root Cause Classification

### Safe local/API mismatches

1. The API contract cannot represent the original web’s multi-slot grouped submission in one operation.
2. Mobile open booking derives candidates from directory data, while API fan-out does not validate requested time against each teacher’s Availability.

The second item is not safe to fix as a rejection rule until the original server-side contract is proven. It remains a parity gap, not an authorization to invent behavior.

### Production dependencies

1. strict specific-teacher RLS/isolation.
2. request create idempotency/atomic duplicate protection.
3. subscription reservation under concurrent requests.
4. RPC acceptance + booking creation transaction.
5. group acceptance + all booking creation transaction.
6. authoritative Availability/timezone enforcement if required.
7. authoritative expiry mutation.
8. reject RPC source/behavior.

## 18. Pre-Fix Decision

Before any new code change:

```text
Do not modify Production.
Do not modify schema/RLS/RPC/functions/triggers.
Do not add availability fallback.
Do not select a random teacher.
Do not create a local booking store.
Do not claim E2E success.
```

The only candidate local implementation work after this report is:

1. Decide and implement multi-slot group request parity in Mobile/API only if it is confirmed as required for this Mobile product.
2. Add tests for the current pure Availability and duration calculations.
3. Improve API error/diagnostic visibility without changing business rules.

## Final Pre-Fix Status

```text
Specific Teacher Booking: MATCHED LOCALLY / PARTIAL
Open Subject Booking: PARTIAL
Eligibility: PARTIAL
Availability: PARTIAL
Timezone: UNVERIFIED
Subscription: MATCHED LOCALLY / RACE BLOCKED
Create Request: MATCHED for single request / PARTIAL for group
Accept: PARTIAL
Reject: UNVERIFIED
First Accept Wins: RPC MATCHED / overall UNVERIFIED
Race Conditions: BLOCKED
Notifications: PARTIAL
Group Booking: PARTIAL
Cancellation: UNVERIFIED
Expiration: PARTIAL
Database Integrity: PARTIAL / BLOCKED
Android: previously PASS
iOS: previously PASS
```

## Exact Next Step

No Production write should occur automatically. The next safe implementation decision is to confirm whether Mobile must support the original web’s multi-slot grouped submission. All transaction, RLS, target-isolation, timezone-enforcement and concurrent-balance gaps remain Production-dependent until proven otherwise.
