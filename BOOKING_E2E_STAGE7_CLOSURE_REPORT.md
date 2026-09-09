# BOOKING E2E STAGE 7 — CLOSURE REPORT

**Date:** 2026-09-06  
**Scope:** Specific Teacher Booking + Open Subject Booking + Availability + Accept/Reject + First Accept Wins  
**Final status:** `E2E PRODUCTION BLOCKED`

## A. Source of Truth

المصدر الأصلي الذي تمت مراجعته:

```text
.local/conversation-workspace/files/taealam_build/src/pages/Booking.tsx
.local/conversation-workspace/files/taealam_build/src/components/teacher/BookingRequests.tsx
```

المصادر الحالية:

```text
artifacts/api-server/src/routes/learning.ts
artifacts/api-server/src/routes/directory.ts
artifacts/ajyal-mobile/app/booking.tsx
artifacts/ajyal-mobile/lib/teacherAvailability.ts
lib/api-spec/openapi.yaml
```

لم يتم تعديل Production schema/RLS/RPC/trigger/function/Auth/VPS.

## B. Specific Teacher Booking

### Matched

- specific teacher يدخل من `teacherId`.
- المادة تتحقق من `teacher_subjects`.
- profile المعلم يتحقق من `is_approved`.
- Availability تأتي من `public_teacher_profiles`.
- request ينشأ قبل booking.
- notification يذهب للمعلم المحدد.
- Mobile لا ينشئ booking مباشرة.

### Partial

- `booking_requests` لا يحتوي target `teacher_id`.
- لا يمكن ضمان strict target-only visibility من Mobile/API.
- E2E حقيقي لم ينفذ.

### Status

```text
Specific Teacher Booking: UNVERIFIED
Local contract parity: CODE VERIFIED
```

## C. Open Subject Booking

### Matched locally

- `teacherId` اختياري في OpenAPI.
- open request لا يختار معلماً من الهاتف.
- API يرسل fan-out للمعلمين المعتمدين المرتبطين بالمادة.
- لا يتم استخدام أول teacher أو random teacher.
- Mobile يستخدم Availability الحقيقية في عرض slots.

### Unverified/partial

- API لا يثبت server-side Availability/timezone لكل مرشح قبل الإشعار.
- open E2E لم ينفذ.
- وصول notification للأجهزة لم يثبت.

### Status

```text
Open Subject Booking: PARTIAL / UNVERIFIED
```

## D. Eligibility

### Proven

#### Student

- authenticated.
- student role.
- profile fields.
- active subscription.
- enough reserved balance.

#### Specific teacher

- approved public teacher profile.
- subject relation.

#### Open teacher notification

- subject relation.
- approved teacher profile.

### Not proven

- stage match كشرط request.
- timezone eligibility.
- server-side availability filter.
- additional account/banned rule.

### Status

```text
Eligibility: PARTIAL
```

## E. Availability

المصدر:

```text
public_teacher_profiles.available_days
public_teacher_profiles.available_from
public_teacher_profiles.available_to
```

المواد:

```text
teacher_subjects -> subjects
```

### Flow

```text
Database
  -> API directory mapping
  -> Mobile normalizeDays/parseClock
  -> Mobile slot presentation
  -> API booking request
```

### Safeguards

- لا default days.
- لا default hours.
- لا 08:00/17:00/23:00 fallback.
- لا fake teacher.
- لا random teacher.

### Status

```text
Availability: PARTIAL
```

Mobile filtering is not equivalent to server-side acceptance proof.

## F. Timezone

لم يثبت وجود:

- teacher timezone column.
- SQL timezone conversion function.
- RPC enforcing teacher local time.
- explicit UTC/local contract.

Mobile يحول local device date/hour إلى ISO. هذا ليس إثباتاً أن timezone مطابق للمنصة.

```text
Timezone: UNVERIFIED
```

## G. Subscription

تمت مطابقة القراءة المحلية لـ:

```text
active subscription
remaining_minutes
ends_at
session_duration_minutes
```

Mobile وAPI يمنعان الحجز إذا كان الرصيد المحجوز أقل من مدة الجلسة.

لم يثبت E2E عند آخر دقائق subscription أو concurrent requests.

```text
Subscription: CODE VERIFIED LOCALLY / E2E UNVERIFIED
```

## H. Create Request

### Specific payload

```json
{
  "teacherId": "<teacher-user-id>",
  "subject": "<exact-name>",
  "startsAt": "<future-ISO>",
  "durationMinutes": 60
}
```

### Open payload

```json
{
  "subject": "<exact-name>",
  "startsAt": "<future-ISO>",
  "durationMinutes": 60
}
```

### Endpoint

```text
POST /api/booking-requests
```

### Expected

```text
201 Created
booking_request.status = open
accepted_by = null
expires_at populated
group_id populated
```

### Status

```text
Create Request: CODE VERIFIED LOCALLY / E2E UNVERIFIED
```

## I. Accept

### Source

```text
accept_booking_request
accept_booking_group
```

### Local/API behavior

- teacher role.
- request open.
- expiry guard.
- active teacher session guard.
- schedule conflict guard.
- student allowance guard.
- RPC call.
- booking insert after acceptance.
- student notification.

### Missing proof

RPC acceptance and booking insert are not proven as one Production transaction.

```text
Accept: PARTIAL / E2E UNVERIFIED
```

## J. Reject

### Source

```text
reject_booking_request
```

### Local/API behavior

- teacher decision.
- group ids supported.
- student rejection notification.
- no intentional booking/session creation.

### Missing proof

Real teacher reject and subsequent open-request visibility were not tested.

```text
Reject: CODE VERIFIED LOCALLY / E2E UNVERIFIED
```

## K. Expiry

`expires_at` is populated at request creation and checked in read/accept paths.

لم يثبت:

- cron.
- Edge Function.
- trigger.
- authoritative status mutation to `expired`.

```text
Expiry: PARTIAL / UNVERIFIED
```

لا يوجد local timer يكتب Production status.

## L. Cancellation

Student/teacher cancellation and financial effect require source-specific Production proof.

لم يثبت:

- refund path.
- automatic minutes restoration.
- cancellation notification in every state.
- session cancellation coupling.

```text
Cancellation: UNVERIFIED
```

## M. First Accept Wins

### Evidence

RPC conditional state checks `status = 'open'` before accepting.

### What was not tested

- Teacher A and Teacher B concurrently.
- database state after both attempts.
- whether a second booking can be created after a successful RPC.
- notifications after a race.

```text
First Accept Wins: UNVERIFIED
```

وجود RPC ليس نتيجة اختبار race.

## N. Race Conditions

لم تنفذ اختبارات:

- concurrent accept.
- duplicate request.
- double booking.
- last subscription minutes.
- retry after timeout.
- double tap.
- duplicate notification/session.

حماية Mobile/API pre-check لا تكفي لإثبات Database atomicity.

```text
Race Conditions: BLOCKED
```

السبب: تحتاج Production sessions وdatabase writes وRPC/RLS behavior.

## O. Notifications

### Proven locally

- specific recipient notification.
- open fan-out notification.
- accept notification to student.
- reject notification to student.
- optional push call.
- Realtime/list refresh paths exist.

### Not proven

- row insertion with real request.
- push device delivery.
- no duplicate notification under retry.
- expiry/cancellation notification.

```text
Notifications: PARTIAL / E2E UNVERIFIED
```

## P. Database

### Expected request writes

```text
booking_requests:
student_id
subject_id
scheduled_at
duration_minutes
status
accepted_by
expires_at
group_id
```

### Expected accepted writes

```text
booking_requests.status = accepted
booking_requests.accepted_by = winner
bookings.student_id
bookings.teacher_id
bookings.subject_id
bookings.scheduled_at
bookings.duration_minutes
```

### Critical limitation

لا يوجد target `teacher_id` مثبت في `booking_requests`.

لذلك:

```text
specific notification recipient != strict target-only database isolation
```

### Status

```text
Database: PARTIAL / PRODUCTION BLOCKED
```

## Q. Dashboard 502

تمت إضافة diagnostics داخل:

```text
artifacts/api-server/src/routes/learning.ts
```

العمليات المسماة:

```text
profile
upcoming_sessions
booking_history
subscriptions
open_booking_requests
unread_notifications
student_points
subscription_plans
```

والبيانات الداخلية:

```text
operation
status
errorName
errorCode
```

### Verified

```text
Unauthenticated /api/student/dashboard -> 401
API health -> 200
```

### Not verified

لا يوجد authenticated dashboard request بعد التشخيص لتحديد operation الفاشلة.

```text
Dashboard 502: DIAGNOSTICS FIXED / UPSTREAM UNVERIFIED
```

## R. Mobile/API Parity

| Feature | Status | Explanation |
|---|---|---|
| Direct teacher request | `PARTIAL` | notification matched; target-only blocked |
| Open subject request | `PARTIAL` | local fan-out matched; server Availability unverified |
| Availability parsing | `MATCHED LOCALLY` | arrays/names normalized without fallback |
| Stage field | `MATCHED LOCALLY` | unsupported direct stage rejection removed |
| Subscription duration | `MATCHED LOCALLY` | source subscription used |
| Accept | `PARTIAL` | RPC then booking insert not proven atomic |
| Reject | `MATCHED LOCALLY` | RPC path exists; E2E unverified |
| Expiry | `PARTIAL` | read/guard behavior; authoritative mutation unknown |
| Notifications | `PARTIAL` | rows/push path; actual delivery unverified |

## S. Production Blockers

### Blocker 1 — Test identities and permission

يلزم student وteacher Production accounts مع explicit safe write/cleanup permission.

### Blocker 2 — Target-only direct booking

```text
PRODUCTION CHANGE REQUIRED
```

يلزم schema/relation/RLS/RPC change إذا كان المطلوب strict isolation.

### Blocker 3 — Atomic acceptance

```text
PRODUCTION CHANGE REQUIRED
```

يلزم إثبات أو تعديل transaction/function تجمع قبول الطلب وإنشاء booking.

### Blocker 4 — Availability/timezone

```text
UNVERIFIED
```

يلزم عقد authoritative قبل إضافة server-side rule.

### Blocker 5 — Dashboard upstream

```text
UNVERIFIED
```

يلزم تشغيل dashboard بحساب طالب حقيقي لرؤية operation الفاشلة.

## T. Exact Next Step

لا تبدأ Stage 8.

الإجراء التالي:

1. تفويض student test account آمن.
2. تفويض teacher test account آمن.
3. التأكد من profile/subscription/subject/approval/availability.
4. تنفيذ specific booking.
5. فحص request والnotification.
6. تنفيذ teacher accept.
7. فحص booking والحقول.
8. تنفيذ open booking مع معلّمين مؤهلين.
9. تشغيل concurrent accept.
10. فحص First Accept Wins والـdatabase.
11. تنفيذ reject/expiry/cancellation/balance.
12. تشغيل dashboard المصادق عليه.
13. تنظيف بيانات الاختبار.

## Stage 7 Status

```text
Specific Teacher Booking: UNVERIFIED
Open Subject Booking: PARTIAL / UNVERIFIED
Availability: PARTIAL
Timezone: UNVERIFIED
Subscription: CODE VERIFIED LOCALLY / E2E UNVERIFIED
Create Request: CODE VERIFIED LOCALLY / E2E UNVERIFIED
Accept: PARTIAL / UNVERIFIED
Reject: CODE VERIFIED LOCALLY / E2E UNVERIFIED
First Accept Wins: UNVERIFIED
Race Conditions: BLOCKED
Notifications: PARTIAL / UNVERIFIED
Dashboard 502: DIAGNOSTICS FIXED / UPSTREAM UNVERIFIED
Database: PARTIAL / PRODUCTION BLOCKED
Android: PASS
iOS: PASS
```

## Classification

### MATCHED

- request-first lifecycle.
- direct notification recipient.
- open request without selecting a random teacher.
- source subscription duration.
- RPC names and acceptance path.
- no local booking/session creation from student Mobile.

### PARTIAL

- strict teacher targeting.
- open server-side eligibility.
- Availability enforcement.
- accept-to-book transaction.
- notification delivery.
- expiry/cancellation lifecycle.

### MISMATCH

- No confirmed remaining local direct-flow mismatch from the previously removed stage pre-check.
- Production schema still cannot express strict target-only direct booking.

### UNVERIFIED

- real student create.
- real teacher accept/reject.
- open booking.
- timezone.
- device notification delivery.
- First Accept Wins race.
- duplicate/last-minute subscription races.
- authenticated dashboard upstream.

### BLOCKED

- Production E2E without authorized test accounts.
- strict target-only without Production change.
- full atomic request-to-booking proof without Production evidence.

## Final Declaration

```text
E2E PRODUCTION BLOCKED
```

لا يجوز كتابة "الحجز يعمل" أو "First Accept Wins يعمل" أو "Availability صحيحة" قبل تنفيذ الاختبارات الحقيقية وفحص Database كما هو موضح أعلاه.