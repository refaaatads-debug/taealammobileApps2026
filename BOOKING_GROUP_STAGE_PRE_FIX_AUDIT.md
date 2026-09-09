# BOOKING GROUP STAGE — PRE-FIX AUDIT

**Date:** 2026-09-06  
**Scope:** Group Booking and multi-slot booking parity only  
**Rule:** No code, schema, RLS, RPC, trigger, or Production mutation was performed for this audit.

## Executive Summary

Group Booking is implemented in the source platform and in the GitHub repository, but it is not implemented end-to-end in the current Mobile/API contract.

The source platform does not store a JSON array of slots in one `booking_requests` row. It creates one `booking_requests` row per selected slot and assigns the same `group_id` to all rows from the same submission.

The current Mobile/API path creates one request row per mutation. The API assigns a fresh `group_id` to that single row, so the response contains a `groupId` but does not represent a real multi-slot group.

```text
Group Booking: PARTIAL
Production E2E: BLOCKED
No Stage 9 / Sessions work started
```

## Sources Compared

### SOURCE PLATFORM

Local source mirror:

```text
.local/conversation-workspace/files/taealam_build/
```

Relevant source files:

```text
src/pages/Booking.tsx
src/pages/SearchTeacher.tsx
src/components/teacher/BookingRequests.tsx
```

### GITHUB

Read-only comparison against:

```text
refaaatads-debug/taealam@main
```

The relevant GitHub files contain the same Group Booking behavior as the source mirror:

```text
src/pages/Booking.tsx
src/pages/SearchTeacher.tsx
src/components/teacher/BookingRequests.tsx
supabase/migrations/20260423064137_b255636d-39d5-44de-96a7-8f3b27515d5c.sql
supabase/migrations/20260424091937_96f58e91-b9c8-446d-8a9c-65d40b1797f9.sql
supabase/migrations/fix_booking_requests_rejected_status.sql
```

The GitHub Mobile repository was empty:

```text
refaaatads-debug/taealammobileApps2026
```

Therefore there is no independent GitHub Mobile implementation to compare.

### DATABASE EVIDENCE

Database schema evidence is available through the source/GitHub migrations and generated Supabase types.

The live Supabase connector was probed read-only for:

```text
booking_requests
bookings
sessions
```

The connector returned HTTP `403 Forbidden` for all three probes. This is an access limitation, not evidence that the tables or columns do not exist. No Production write was attempted.

### CURRENT API / OPENAPI / MOBILE

```text
artifacts/api-server/src/routes/learning.ts
lib/api-spec/openapi.yaml
lib/api-client-react/src/generated/*
lib/api-zod/src/generated/*
artifacts/ajyal-mobile/app/booking.tsx
artifacts/ajyal-mobile/app/(tabs)/bookings.tsx
```

## Detailed Findings

### 1. How the source creates Group Booking

**Status: MATCHED IN SOURCE/GITHUB**

Both source booking flows:

```text
src/pages/Booking.tsx
src/pages/SearchTeacher.tsx
```

maintain:

```text
selectedSlots: Array<{ dayIndex, time }>
```

On submit they:

1. Convert every selected slot into a scheduled timestamp.
2. Generate one `group_id`.
3. Create one `booking_requests` row per selected slot.
4. Give every row the same `group_id`.
5. Use a shared expiry timestamp.
6. Send one grouped notification surface to the teacher(s).

The group is therefore a set of rows, not one row containing a `slots` array.

### 2. How the group is represented in the database

**Status: MATCHED**

The source/GitHub migration adds:

```sql
booking_requests.group_id uuid
```

and an index:

```sql
idx_booking_requests_group_id
```

The generated Supabase types also contain:

```text
booking_requests.group_id: string | null
```

There is no evidence of a JSON slot array column for this behavior.

### 3. How multiple appointments are stored

**Status: MATCHED**

Multiple selected appointments are stored as multiple `booking_requests` rows:

```text
row 1: scheduled_at = slot 1, group_id = G
row 2: scheduled_at = slot 2, group_id = G
row 3: scheduled_at = slot 3, group_id = G
```

The rows share the subject, student, expiry, and group identifier while retaining their own scheduled timestamp and duration.

### 4. One request with multiple slots or multiple request rows

**Status: MATCHED — MULTIPLE ROWS**

The source explicitly maps `scheduledDates` to `requests` and inserts the complete array. A single database row never contains all slots.

### 5. How the selected teacher is identified

**Status: PARTIAL / SOURCE LIMITATION**

`booking_requests` has no target `teacher_id` column in the inspected schema.

The direct-teacher source flow:

- sends a notification to the selected teacher;
- inserts the request rows without a target teacher column;
- relies on the platform's existing visibility/RLS behavior;
- records the winning teacher in `accepted_by` only after acceptance.

This means notification targeting is not the same as strict database-level target isolation.

The current API follows the same limitation. It validates the selected teacher and notifies that teacher, but it cannot add strict target-only isolation without a Production schema/RLS contract.

### 6. How open subject booking works

**Status: PARTIAL**

The source open-subject flow:

- creates one row per selected slot under one group;
- finds approved teachers connected to the selected subject;
- applies teaching-stage filtering when a stage is selected;
- inserts notifications for eligible teachers.

The current API:

- resolves the subject;
- finds approved teachers connected to the subject;
- sends notifications to those teachers;
- has no multi-slot input;
- has no `teaching_stage` field in `BookingRequestInput`.

Therefore the current API matches the approved-subject broadcast shape but not the source's full group/stage input behavior.

### 7. How notifications are sent

**Status: PARTIAL**

Source behavior:

- direct-teacher group: one notification to the selected teacher describing the count and slots;
- open-subject group: one notification per eligible teacher describing the count and slots;
- acceptance: one grouped confirmation notification to the student.

Current API behavior:

- single request creation only;
- direct-teacher or approved-subject notification;
- push notification after the request is inserted;
- group count is effectively always one because the endpoint creates one row;
- acceptance notifications already use the number of resulting bookings when a group exists.

### 8. First Accept Wins

**Status: RPC MATCHED / E2E UNVERIFIED**

The source/GitHub group RPC:

```sql
accept_booking_group(_group_id, _teacher_id)
```

updates rows where:

```sql
group_id = _group_id
AND status = 'open'
```

and returns the updated rows.

The singular RPC uses the same conditional status pattern for one request.

This gives the request-row decision a First Accept Wins shape: a second call should receive no open rows. It does not prove the full lifecycle under concurrent Production calls because no authorized concurrency test was run.

### 9. How a group is accepted

**Status: PARTIAL**

The source teacher flow:

1. Checks expiry and teacher conflicts.
2. Calls `accept_booking_group` for a grouped request.
3. Reads/uses the returned accepted rows.
4. Inserts one confirmed `bookings` row per accepted request.
5. Sends one confirmation notification.
6. Creates a first chat message using the first booking.

The current API performs the same broad sequence:

1. Loads open rows by `group_id`.
2. Checks earliest expiry and conflicts.
3. Calls `accept_booking_group`.
4. Checks existing bookings.
5. Inserts missing confirmed bookings.
6. Notifies the student and bootstraps chat.

The important remaining difference is atomicity: the RPC state update and bookings insert are separate operations in both paths.

### 10. How a group is rejected

**Status: INVOCATION MATCHED / RPC IMPLEMENTATION UNVERIFIED**

The source teacher component calls:

```text
reject_booking_request(
  _request_ids: all group row ids,
  _teacher_id: current teacher
)
```

The current API also passes the complete `decisionRequests` ID list to the same RPC.

The source/GitHub migration history contains the status constraint fix allowing `rejected`, but the inspected migrations did not expose the full `reject_booking_request` function definition. Its Production behavior remains unverified.

### 11. How bookings are created

**Status: PARTIAL**

The source creates one confirmed booking per accepted request row and includes:

```text
student_id
teacher_id
subject_id
scheduled_at
duration_minutes
status = confirmed
used_subscription
subscription_id
```

The current API creates one booking per accepted row and includes the main identity, time, duration, confirmed status, and `subscription_id`.

The API payload does not explicitly include the source's `used_subscription` metadata. The column is present in the inspected generated Supabase types. This is a confirmed local/API parity gap that can be addressed inside the API without changing Production schema.

### 12. How sessions are created

**Status: UNVERIFIED**

The inspected source acceptance handler inserts `bookings`, not `sessions`.

No source or current API evidence was found in this audit proving that Group Booking acceptance directly creates sessions. Session creation/lifecycle is outside this Group Booking audit and must not be inferred from booking success.

### 13. How notifications work after acceptance

**Status: PARTIAL**

The source sends one grouped student notification after all group bookings are created.

The current API also sends a grouped notification based on the number of created bookings and sends a push notification. Delivery and database persistence remain E2E-unverified because no authenticated Production test ran.

### 14. How duplicate acceptance is prevented

**Status: PARTIAL / RACE BLOCKED**

The conditional group RPC prevents two calls from both updating the same open request rows under normal database execution.

However:

- acceptance and booking insertion are separate;
- no end-to-end concurrent teacher test was run;
- no unique booking constraint for the same accepted request/slot was proven;
- API compensation/retry behavior is not a transaction;
- a failure after acceptance can leave accepted requests without all bookings.

The current API detects some already-created bookings before inserting, but this is not equivalent to an atomic constraint.

### 15. Cancellation and expiration for a group

**Status: PARTIAL / UNVERIFIED**

Confirmed:

- group rows share an expiry timestamp in the source creation flow;
- the teacher UI uses the earliest group expiry before accepting;
- rejection passes all group IDs;
- source booking cancellation logic is separate from request grouping.

Not proven:

- a Production server-side job that expires every group row atomically;
- a group-specific cancellation RPC;
- refund behavior for a partially or fully accepted group;
- cleanup when only some booking rows were created;
- authenticated Production expiration/cancellation behavior.

## Contract Comparison

| Layer | Group creation | Multiple slots | Group decision | Group booking insert | Status |
|---|---|---:|---|---|---|
| Source Platform | Yes | Multiple rows | Group RPC | One booking per row | `MATCHED` |
| GitHub `taealam` | Yes | Multiple rows | Group RPC | One booking per row | `MATCHED` |
| Database evidence | `group_id` column/index | Rows share UUID | RPC source present | Booking rows separate | `MATCHED FROM SCHEMA/MIGRATIONS` |
| API | One request per POST | No | Reads group if present | Loops accepted rows | `PARTIAL` |
| OpenAPI | No group input | No slots array | `groupId` only on decision | Single response | `PARTIAL` |
| Mobile booking form | One day + one hour | No | N/A on create | N/A on create | `MISSING GROUP CREATE` |
| Mobile bookings list | Groups rows by `groupId` | Displays count | Sends groupId on teacher decision | Uses API | `PARTIAL` |

## Confirmed Fixes Available Without Production Changes

The following are confirmed and can be implemented within Mobile/API/OpenAPI only:

1. Add a dedicated grouped booking input/response contract without changing the existing single-request endpoint.
2. Add Mobile multi-slot selection and submit the slots as one grouped request.
3. Preserve one database row per slot and one shared `group_id`.
4. Include `used_subscription` in API-created booking metadata to match the source payload.
5. Add local contract/unit tests for grouped payload validation, slot duration totals, and grouping behavior.

The following must not be invented locally:

- target-teacher schema/RLS isolation;
- server-side timezone policy;
- atomic balance reservation;
- transaction wrapping RPC acceptance and booking creation;
- new Production functions or constraints;
- a guessed session-creation rule.

## Pre-Fix Decision

```text
Group Booking: PARTIAL
Source Platform = GitHub: MATCHED for group creation/decision shape
Database representation: MATCHED from migrations/types
API: PARTIAL
OpenAPI: PARTIAL
Mobile create flow: NOT MATCHED
Mobile request list/decision flow: PARTIAL
First Accept Wins: RPC shape MATCHED, E2E UNVERIFIED
Production E2E: BLOCKED
```

## Required Next Phase

After this report is saved, only the confirmed Mobile/API/OpenAPI differences may be fixed.

The next report must be:

```text
BOOKING_GROUP_STAGE_FINAL_REPORT.md
```

It must distinguish:

```text
MATCHED
PARTIAL
UNVERIFIED
BLOCKED
```

and must not claim 100% without authenticated Production E2E evidence.
