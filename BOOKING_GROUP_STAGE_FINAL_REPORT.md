# BOOKING GROUP STAGE — FINAL REPORT

**Date:** 2026-09-06  
**Scope:** Group Booking and multi-slot booking parity  
**Final classification:** `PARTIAL OVERALL — CORE LOCAL CONTRACT MATCHED`

## 1. ما تم إصلاحه

### API/OpenAPI

أُضيف عقد مستقل لا يكسر endpoint الحجز الفردي:

```text
POST /api/booking-requests/group
```

المدخل:

```text
teacherId?: string
subject: string
slots: [
  {
    startsAt: string
    durationMinutes: number
  }
]
```

القيود:

```text
1 إلى 20 slot
مدة كل slot بين 15 و180 دقيقة
مدة صحيحة بعدد دقائق صحيح
```

الخرج مصفوفة من `BookingRequest`، صف لكل slot.

الـAPI الآن:

- يحافظ على endpoint الحجز الفردي القديم.
- يحسب إجمالي دقائق المجموعة قبل فحص الاشتراك.
- يتحقق من أن كل المواعيد مستقبلية.
- يفحص duplicate request وduplicate booking لكل slot.
- يحقق من المعلم المحدد والمادة والاعتماد.
- يرسل open booking للمعلمين المؤهلين حسب المادة.
- ينشئ `group_id` واحداً لكل المجموعة.
- ينشئ `booking_requests` متعددة في insert واحد.
- يشارك كل الصفوف نفس `expires_at`.
- يذكر عدد المواعيد وتفاصيلها في الإشعار.
- يضيف `used_subscription` عند إنشاء booking بعد القبول لمطابقة المصدر.

### Mobile

تم تحويل شاشة الحجز من اختيار موعد واحد ضمنياً إلى اختيار متعدد صريح:

- الضغط على الوقت يضيف slot.
- الضغط مرة ثانية يزيله.
- يمكن اختيار مواعيد من أيام مختلفة.
- الحد الأقصى 20 موعداً.
- الرصيد يعرض إجمالي دقائق المجموعة.
- slot واحد يستخدم endpoint الفردي.
- أكثر من slot يستخدم endpoint المجموعة.
- لا يوجد اختيار معلم عشوائي.
- لا توجد ساعات أو Availability افتراضية.
- لا يوجد mock data.

### Generated clients

تمت إعادة توليد:

```text
lib/api-client-react/src/generated/*
lib/api-zod/src/generated/*
```

وتظهر فيها:

```text
BookingRequestGroupInput
BookingRequestGroupSlot
createBookingRequestGroup
useCreateBookingRequestGroup
CreateBookingRequestGroupBody
CreateBookingRequestGroupResponse
```

### حدود التعديل

لم يتم تعديل:

```text
Production schema
RLS
RPC
triggers
Auth
Storage
VPS
Production data
```

## 2. ما تم إثباته

### Source Platform

المصدر الأصلي ينفذ Group Booking بهذه الصورة:

```text
selectedSlots
→ scheduledDates
→ group_id واحد
→ booking_requests row لكل slot
→ قبول المجموعة عبر accept_booking_group
→ booking row لكل request مقبول
```

### GitHub

تمت المقارنة read-only مع:

```text
refaaatads-debug/taealam@main
```

والسلوك الأساسي مطابق للمصدر في:

```text
src/pages/Booking.tsx
src/pages/SearchTeacher.tsx
src/components/teacher/BookingRequests.tsx
```

مستودع Mobile في GitHub كان فارغاً:

```text
refaaatads-debug/taealammobileApps2026
```

### Database evidence

المصدر وGitHub يثبتان:

```text
booking_requests.group_id uuid
idx_booking_requests_group_id
```

وأن المجموعة لا تخزن slots داخل JSON، بل كصفوف متعددة.

المصدر يثبت وجود:

```text
accept_booking_group(_group_id, _teacher_id)
```

مع تحديث شرطي:

```sql
WHERE group_id = _group_id
  AND status = 'open'
```

### Local contract

تم إثبات أن:

- OpenAPI يصف group input وarray response.
- Zod يفرض `slots` بين 1 و20.
- Zod يفرض مدة صحيحة لكل slot.
- API يستقبل المجموعة ويكتب الصفوف بنفس `group_id`.
- Mobile يرسل المجموعة عند اختيار أكثر من موعد.
- Mobile يعرض عدد المواعيد المختارة وإجمالي الدقائق.

### Verification results

نجح:

```text
OpenAPI codegen: PASS
Workspace library typecheck: PASS
API TypeScript: PASS
Mobile TypeScript: PASS
API build: PASS
Android bundle: PASS
iOS bundle: PASS
git diff --check: PASS
API workflow restart: PASS
Expo workflow restart: PASS
GET /api/healthz: 200
POST /api/booking-requests/group بدون Auth: 401
POST /api/booking-requests بدون Auth: 401
GET /api/teachers بدون Auth: 401
```

لم يُنفذ أي booking حقيقي في Production.

## 3. ما بقي

### Group Booking status

```text
Core create contract: MATCHED LOCALLY
Source/GitHub database representation: MATCHED
Mobile multi-slot UX: MATCHED LOCALLY
Overall Group Booking: PARTIAL
Production E2E: UNVERIFIED / BLOCKED
```

السبب في عدم تصنيفها `MATCHED` بشكل نهائي هو أن اختباراً حقيقياً بحساب طالب ومعلمين وقاعدة Production لم يُنفذ.

### Atomicity

ما زال القبول يتكون من عمليتين منفصلتين:

```text
accept_booking_group RPC
→ booking inserts
```

إذا نجح RPC وفشل insert اللاحق، يمكن أن تبقى requests مقبولة مع bookings ناقصة. هذا يحتاج Production transaction/function/constraint ولا يجوز اختراعه في Mobile.

### Target teacher isolation

لا يحتوي `booking_requests` المفحوص على `teacher_id` مستهدف. اختيار المعلم المحدد يوجه الإشعار، لكنه لا يثبت عزلاً صارماً على مستوى RLS.

### Open booking stage filtering

المصدر الأصلي يملك stage filtering في أحد مسارات الحجز. العقد الحالي لا يرسل `teaching_stage` لأن وجوده وعلاقته بعقد Production لم يثبتا بشكل آمن في هذه المرحلة.

### Reject/expiry/cancellation

تمت مطابقة استدعاء رفض المجموعة مع قائمة IDs كاملة، لكن تعريف وسلوك `reject_booking_request` في Production غير مثبت.

لم يثبت بعد:

- expiry server-side للمجموعة؛
- cancellation جماعي؛
- refund للمجموعة؛
- معالجة partial booking؛
- إشعارات push حقيقية.

### Production E2E

ما زال يلزم:

- Student test account.
- Teacher A approved account.
- Teacher B approved account.
- Subscription ورصيد كافٍ.
- Availability حقيقية.
- صلاحية تنظيف بيانات الاختبار.

يجب تمرير الوصول عبر آلية آمنة، وليس عبر لصق credentials في المحادثة.

## 4. ما يحتاج Production

العناصر التالية لا يمكن إثباتها أو إصلاحها محلياً بأمان:

1. تجربة إنشاء group حقيقي.
2. ظهور كل صفوف المجموعة للمعلم.
3. قبول المجموعة وتكوين bookings.
4. رفض المجموعة عبر RPC الحقيقي.
5. First Accept Wins بين Teacher A وTeacher B.
6. منع bookings المكررة أثناء race.
7. ذرية قبول المجموعة وإنشاء bookings.
8. server-side Availability/timezone.
9. target-teacher RLS isolation.
10. expiry/cancellation/refund.
11. delivery الفعلي للإشعارات وpush.

### Supabase access note

محاولة read-only على Supabase connector لجداول:

```text
booking_requests
bookings
sessions
```

أعادت `403 Forbidden`. هذا عائق وصول، وليس دليلاً على غياب الجداول أو الأعمدة، ولم يتم الالتفاف عليه أو تنفيذ كتابة Production.

## 5. هل Group Booking أصبح MATCHED أم PARTIAL؟

```text
PARTIAL OVERALL
```

والتفصيل:

```text
Source Platform ↔ GitHub: MATCHED
Database representation: MATCHED from migrations/types
API group create contract: MATCHED LOCALLY
Mobile multi-slot create flow: MATCHED LOCALLY
Group acceptance atomicity: PARTIAL
Group rejection: INVOCATION MATCHED / RPC UNVERIFIED
First Accept Wins: RPC shape MATCHED / E2E UNVERIFIED
Production E2E: BLOCKED
```

لا يصح إعلان 100%.

## 6. هل يمكن الانتقال إلى Availability/Timezone؟

```text
نعم، يمكن الانتقال إلى Stage 8.2: Availability + Timezone audit.
```

لكن بشروط:

- لا ننتقل إلى Sessions/WebRTC.
- لا نضيف server-side rejection قبل إثبات timezone contract.
- لا نخترع timezone أو default availability.
- نبقي Production E2E مصنفاً `BLOCKED`.
- نبدأ بتقرير pre-fix مستقل قبل أي تعديل.

## Known unrelated workflow issue

أثناء تشغيل Expo/API ظهرت مشكلة قديمة خارج نطاق Group Booking:

```text
/api/assignments → 500
/api/student/dashboard → 502
```

والسبب الظاهر في السجل هو عدم تطابق قيم assignment/status بين المصدر وZod contract:

```text
assignment مقابل واجب/اختبار
active مقابل قيد التقدم/لم يبدأ/مكتمل
```

لم يتم تعديلها هنا لأنها خارج نطاق Group Booking، ولها مسار تدقيق مستقل قائم.

## Completion Decision

```text
Group Booking core local parity: COMPLETE
Group Booking overall parity: PARTIAL
Production E2E: BLOCKED
Next allowed phase: Availability + Timezone audit
Sessions/WebRTC: DO NOT START
Minute deduction: DO NOT START
Wallet: DO NOT START
```
