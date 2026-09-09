# BOOKING E2E STAGE 8 — FINAL REPORT

**Date:** 2026-09-06  
**Scope:** Mobile/API booking parity closure  
**Status:** `PARTIAL — PRODUCTION DEPENDENCIES REMAIN`

## Before

The pre-fix audit found that the booking system was broadly aligned with the original platform for the single-request path, but had several parity boundaries:

- the original web contract describes whole-minute session durations, while the generated booking input accepted decimal numbers;
- Mobile filtered Availability locally, but API did not enforce an equivalent server-side Availability/timezone rule;
- duplicate protection and subscription reservation were read-before-write checks, not proven atomic protections;
- acceptance RPCs changed request state, while booking creation happened in a later API operation;
- the original web can submit multiple selected slots under one `group_id`, while the current Mobile/API path submits one slot at a time;
- strict selected-teacher isolation is not expressible in the inspected Production `booking_requests` schema/RLS.

## Root Cause

### Confirmed local contract mismatch

`durationMinutes` was documented as “Whole minutes” but the OpenAPI schema only applied minimum and maximum bounds. The generated Zod schema therefore accepted decimal values.

### Production-dependent boundaries

Availability enforcement, target-teacher isolation, duplicate/idempotency protection, balance reservation, and atomic acceptance are controlled by the Supabase schema/RLS/RPC/transaction boundary. They cannot be safely recreated in Mobile.

## Fix

### Implemented

Updated the booking duration contract:

```text
lib/api-spec/openapi.yaml
```

```yaml
durationMinutes:
  minimum: 15
  maximum: 180
  multipleOf: 1
```

Added an explicit API guard:

```text
artifacts/api-server/src/routes/learning.ts
```

Decimal durations now return HTTP `400` with a structured Arabic error instead of proceeding to allowance checks or database insertion.

Regenerated:

```text
lib/api-zod/src/generated/api.ts
lib/api-zod/src/generated/types/*
lib/api-client-react/src/generated/*
```

The generated Zod contract now contains:

```text
multipleOf(createBookingRequestBodyDurationMinutesMultipleOf)
```

with the value:

```text
1
```

### Not implemented intentionally

The following were not changed because they require proof or a change in Production behavior:

- server-side Availability/timezone rejection;
- selected-teacher target column or target-only RLS;
- request idempotency/unique constraint;
- atomic subscription reservation;
- atomic acceptance plus booking creation;
- atomic group acceptance plus all booking inserts;
- expiry mutation mechanism;
- `reject_booking_request` Production implementation;
- automatic session creation after booking.

No schema, RLS, RPC, trigger, function, Auth, Storage, VPS, or Production data was changed.

## Files Changed

### Code and contract

```text
artifacts/api-server/src/routes/learning.ts
lib/api-spec/openapi.yaml
lib/api-zod/src/generated/api.ts
lib/api-zod/src/generated/types/*
lib/api-client-react/src/generated/*
```

### Audit

```text
BOOKING_E2E_STAGE8_PRE_FIX_AUDIT.md
BOOKING_E2E_STAGE8_FINAL_REPORT.md
```

## Database Findings

### Confirmed

`booking_requests` contains:

```text
student_id
subject_id
scheduled_at
duration_minutes
status
accepted_by
accepted_at
expires_at
group_id
```

The inspected schema does not contain a target `teacher_id` for a specific-teacher request.

RLS confirms:

- students can insert their own requests;
- approved teachers can view/update open requests for matching subjects;
- later policy adds nullable teaching-stage matching;
- no inspected policy provides strict target-teacher isolation.

The acceptance RPCs use conditional updates:

```sql
WHERE status = 'open'
```

This supports a request-row First Accept Wins shape, but does not prove atomic booking creation or session creation.

### Not proven

- a unique constraint against duplicate student requests;
- atomic balance reservation;
- transaction spanning acceptance and booking insertion;
- transaction spanning group acceptance and all bookings;
- server-side Availability/timezone enforcement;
- Production reject RPC behavior.

## Production Findings

No authenticated Production booking write was executed.

Therefore the following remain unverified:

- real student request creation;
- real teacher notification;
- real teacher acceptance/rejection;
- real booking creation;
- real session creation;
- concurrent acceptance result;
- push delivery;
- dashboard authenticated upstream operation.

The correct classification remains:

```text
E2E PRODUCTION BLOCKED
```

## Tests

### Passed

```text
OpenAPI code generation: PASS
Workspace library typecheck: PASS
API TypeScript: PASS
Mobile TypeScript: PASS
API build: PASS
git diff --check: PASS
API workflow restart: PASS
Expo workflow restart: PASS
Metro bundle after codegen: PASS
GET /api/healthz: 200
GET /api/booking-requests without Auth: 401
GET /api/teachers without Auth: 401
```

### Build/runtime note

The first Expo log after codegen briefly reported that `generated/api` could not be resolved while Orval was cleaning and regenerating the output directory. The generated file existed after codegen completed; restarting Expo produced a clean Metro bundle with no module-resolution error.

The existing NixOS React Native DevTools `libglib-2.0.so.0` warning remains optional tooling noise. Metro and the application bundle are healthy.

### Not run

These require authorized test identities and Production/database writes:

```text
specific teacher E2E
open subject E2E
teacher accept/reject
First Accept Wins concurrency
duplicate request race
last subscription minutes race
expiry mutation
cancellation/refund
device push delivery
authenticated dashboard upstream diagnosis
```

## Security

- No credentials, tokens, cookies, or payment data were requested or stored.
- No RLS bypass was added.
- No random or hardcoded teacher selection was added.
- No Availability or subscription mock was added.
- Decimal duration values are rejected before request creation.
- Existing Production-dependent authorization remains owned by Supabase.
- The selected-teacher path still cannot claim strict target isolation without a Production schema/RLS contract.

## Remaining Blockers

### 1. Strict selected-teacher isolation

```text
BLOCKED — PRODUCTION DEPENDENCY
```

The inspected `booking_requests` schema has no target teacher column, and the teacher RLS policy is subject/approval based.

### 2. Availability and timezone enforcement

```text
PARTIAL / UNVERIFIED
```

Mobile uses real published fields:

```text
available_days
available_from
available_to
```

but the API does not prove a server-side timezone-aware validation rule.

### 3. Atomic booking lifecycle

```text
BLOCKED — PRODUCTION DEPENDENCY
```

Acceptance RPC and booking insert are separate observed operations.

### 4. Concurrent balance protection

```text
BLOCKED — PRODUCTION DEPENDENCY
```

The allowance check is not an atomic debit/reservation.

### 5. Group booking parity

```text
PARTIAL
```

The web supports multiple request rows under a shared group. The current Mobile/API contract still creates one request per mutation. This remains deferred because changing the Mobile UX and API response contract requires confirming that this web group behavior is required for the Mobile product.

### 6. Production E2E identities

```text
BLOCKED
```

Required:

- one student test account;
- one approved teacher for specific booking;
- two approved teachers for open-booking concurrency;
- active subscription and sufficient minutes;
- safe write and cleanup authorization.

Credentials must not be pasted into chat.

## Exact Next Step

The next step is not Stage 9. It is to obtain safe authorization for the three test identities, then run:

1. specific-teacher request;
2. request and notification database verification;
3. teacher acceptance and booking verification;
4. open-subject request;
5. Teacher A and Teacher B concurrent acceptance;
6. database verification for one winner;
7. reject/expiry/cancellation/balance checks;
8. authenticated dashboard diagnostics;
9. safe cleanup.

## Final Status Matrix

| Area | Status |
|---|---|
| Specific Teacher Booking | `MATCHED LOCALLY / E2E UNVERIFIED` |
| Open Subject Booking | `PARTIAL / E2E UNVERIFIED` |
| Availability | `PARTIAL` |
| Timezone | `UNVERIFIED` |
| Eligibility | `PARTIAL` |
| Subscription | `MATCHED LOCALLY / RACE BLOCKED` |
| Create Request | `MATCHED SINGLE / GROUP PARTIAL` |
| Accept | `PARTIAL / E2E UNVERIFIED` |
| Reject | `UNVERIFIED` |
| First Accept Wins | `RPC MATCHED / E2E UNVERIFIED` |
| Race Conditions | `BLOCKED` |
| Notifications | `PARTIAL / E2E UNVERIFIED` |
| Group Booking | `PARTIAL` |
| Cancellation | `UNVERIFIED` |
| Expiration | `PARTIAL` |
| Database Integrity | `PARTIAL / BLOCKED` |
| Android | `PASS` |
| iOS | `PASS` |

## Completion Decision

```text
Mobile/API local contract: improved and verified for integer duration.
Booking parity: not 100% complete.
Production E2E: BLOCKED.
Stage 9: DO NOT START.
```
