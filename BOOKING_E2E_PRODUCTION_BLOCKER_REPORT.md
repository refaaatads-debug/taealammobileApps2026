# BOOKING E2E PRODUCTION BLOCKER REPORT

**Date:** 2026-09-06  
**Stage:** Stage 7 — Production E2E Booking Closure  
**Status:** `E2E PRODUCTION BLOCKED`

## Exact blocker

لا يمكن إثبات إنشاء حجز حقيقي لأن تنفيذ الاختبار يحتاج جلسات Production مصادقاً عليها لطالب ومعلم، مع صلاحية تنفيذ write حقيقي قابل للتنظيف، ولم تتوفر هذه الجلسات في بيئة العمل الحالية.

هذا ليس مجرد نقص في فتح شاشة Mobile. إثبات المسار يتطلب:

```text
student authentication
student role
complete profile
active subscription
remaining minutes
valid teacher/subject relationship
real booking_request insert
real teacher notification
teacher authentication
teacher accept/reject
acceptance RPC
booking insert
database verification
race verification
```

لم يتم تعويض ذلك بـmock أو fake booking أو health check.

## Environment

### Available

```text
Local API workflow: running on port 8080
Expo workflow: running
Supabase integration: configured
GitHub integration: configured
```

### Not available for this test

```text
Authorized student Production session
Authorized teacher Production session
Explicit safe write/cleanup authorization
Two eligible teacher sessions for concurrent acceptance
```

لا ينبغي إرسال access token أو refresh token أو كلمة مرور داخل المحادثة.

## Required accounts

### Student account

يلزم حساب Production بدور:

```text
student
```

وبروفايل يحتوي فعلياً على:

```text
full_name
phone
teaching_stage
```

ويحتاج إلى:

```text
active user_subscriptions row
remaining_minutes >= session_duration_minutes
ends_at غير منتهٍ
```

### Specific teacher account

يلزم حساب Production بدور teacher مع:

```text
public_teacher_profiles.user_id = teacher user id
public_teacher_profiles.is_approved = true
teacher_subjects relation
subjects row
available_days
available_from
available_to
```

### Open booking accounts

يلزم معلّمان معتمدان على الأقل:

```text
teacher A -> same subject
teacher B -> same subject
```

حتى يمكن تنفيذ First Accept Wins وconcurrent acceptance فعلياً.

## Required permissions

### Student session

يجب أن يسمح Supabase session للطالب بقراءة/إدراج ما يسمح به Production RLS في:

```text
profiles/public_profiles
public_teacher_profiles
subjects
teacher_subjects
user_subscriptions
booking_requests
bookings
notifications
```

### Teacher session

يجب أن يسمح Supabase session للمعلم بـ:

```text
read eligible booking_requests
invoke accept_booking_request
invoke accept_booking_group
invoke reject_booking_request
read resulting bookings
```

صلاحية هذه العمليات يحددها Production RLS/RPC، ولم يتم توسيعها محلياً.

## Endpoint

### Student create

```http
POST /api/booking-requests
Authorization: Bearer <Supabase student access token>
Content-Type: application/json
```

### Specific teacher payload

```json
{
  "teacherId": "<approved-teacher-user-id>",
  "subject": "<exact-subject-name>",
  "startsAt": "<future-ISO-date>",
  "durationMinutes": 60
}
```

### Open subject payload

```json
{
  "subject": "<exact-subject-name>",
  "startsAt": "<future-ISO-date>",
  "durationMinutes": 60
}
```

لا يتم اختيار معلم واحد في open payload.

### Expected response

HTTP:

```text
201 Created
```

مع response يحتوي على الأقل:

```json
{
  "id": "<booking-request-id>",
  "studentId": "<student-id>",
  "teacherId": null,
  "subject": "<subject>",
  "scheduledAt": "<ISO-date>",
  "durationMinutes": 60,
  "status": "open",
  "acceptedBy": null,
  "expiresAt": "<ISO-date>",
  "groupId": "<group-id>"
}
```

في specific request، `teacherId` في response يمثل المعلم المقبول فقط إذا كان المصدر يملأه من `accepted_by`، وليس target column عند الإنشاء.

## Tables that should change

### On request creation

```text
booking_requests
```

Expected fields:

```text
student_id
subject_id
scheduled_at
duration_minutes
status = open
accepted_by = null
expires_at
group_id
```

### On notification

```text
notifications
```

Expected:

- specific: one selected teacher recipient.
- open: every eligible teacher recipient.

### On accept

```text
booking_requests
bookings
notifications
```

Expected:

```text
booking_requests.status = accepted
booking_requests.accepted_by = winning teacher
bookings.teacher_id = winning teacher
bookings.student_id = original student
bookings.subject_id = request subject
bookings.scheduled_at = request time
bookings.duration_minutes = request duration
student notification = booking confirmed
```

### Sessions

لا ينشئ الطالب Mobile session مبكراً. يجب فحص session فقط إذا كان عقد المنصة ينشئها بعد booking، وهذا لم يثبت من مسار إنشاء الطلب الحالي.

## RPC

### Single request

```text
accept_booking_request(_request_id, _teacher_id)
```

الدليل المتاح يثبت conditional state transition على `status = 'open'`.

### Group request

```text
accept_booking_group(_group_id, _teacher_id)
```

### Reject

```text
reject_booking_request(_request_ids, _teacher_id)
```

### Missing proof

لا يوجد اختبار Production يثبت أن:

```text
RPC acceptance + bookings insert
```

عملية ذرية واحدة.

## RLS

المثبت من المسار الحالي:

- الطالب يحتاج session وstudent role.
- المعلم يحتاج teacher role.
- visibility مرتبطة بالمادة والاعتماد/القبول.
- `booking_requests` لا يملك target `teacher_id` مثبتاً.

### Critical limitation

حتى لو وصل إشعار specific إلى معلم واحد، لا يثبت ذلك أن RLS يمنع معلمين آخرين من رؤية الطلب إذا كانت سياسة Production تسمح بالوصول حسب المادة/الاعتماد.

## Why Mobile/API cannot safely solve it

Mobile/API لا يستطيعان بأمان:

1. إضافة target column إلى Production.
2. تضييق RLS بدون تغيير Production policy.
3. جعل RPC وbooking insert transaction واحدة محلياً.
4. إثبات timezone رسمي غير موجود في العقد.
5. تنفيذ race-safe subscription debit دون مصدر Production.
6. إثبات push delivery بدون أجهزة/حسابات حقيقية.

أي workaround محلي سيجعل الاختبار يبدو ناجحاً دون تطابق فعلي مع المنصة.

## Required Production changes, if strict guarantees are required

هذه ليست تغييرات منفذة:

```text
PRODUCTION CHANGE REQUIRED
```

قد يلزم:

- target relation/column لـspecific teacher isolation.
- RPC أو function ذرية للقبول وإنشاء booking.
- قاعدة server-side واضحة لـAvailability/timezone.
- transaction/constraint لحماية آخر دقائق الاشتراك والـduplicate writes.

لا يتم تنفيذ أي منها دون موافقة صريحة وإثبات أن المنصة تحتاجه.

## Dashboard 502 blocker

تمت إضافة تشخيص داخلي للعملية:

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

التشخيص يسجل:

```text
operation
status
errorName
errorCode
```

ولا يسجل tokens أو cookies أو PII.

لكن لم توجد جلسة مصادق عليها لتشغيل dashboard فعلياً بعد التشخيص، لذلك لا يمكن تحديد العملية الفاشلة في Production حالياً.

الحالة:

```text
DIAGNOSTICS FIXED
UPSTREAM UNVERIFIED
```

## Exact next action

1. تفويض حساب student تجريبي Production بالطريقة الآمنة، دون إرسال credentials في المحادثة.
2. تفويض حساب teacher تجريبي معتمد ومرتبط بنفس subject.
3. تنفيذ specific create والتحقق من `booking_requests` و`notifications`.
4. تنفيذ teacher accept والتحقق من `booking_requests`, `bookings`, `notifications`.
5. تنفيذ open create باستخدام معلّمين مؤهلين.
6. تشغيل accept من Teacher A وTeacher B بفارق زمني ضئيل.
7. فحص أن فائزاً واحداً فقط يملك `accepted_by` و`bookings`.
8. اختبار reject/expiry/cancellation/balance.
9. تشغيل dashboard المصادق عليه وتسجيل operation الفاشلة إن وجدت.
10. تنظيف جميع بيانات الاختبار بالطريقة المعتمدة.

إلى أن يتم ذلك:

```text
E2E PRODUCTION BLOCKED
```
