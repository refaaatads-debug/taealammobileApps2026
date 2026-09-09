# BOOKING E2E STAGE 7 — PRE-FIX AUDIT

**تاريخ التدقيق:** 2026-09-06  
**المرحلة:** Production E2E Booking Closure  
**نطاق التدقيق:** Specific Teacher Booking، Open Subject Booking، Availability، Timezone، Subscription، Accept/Reject/Expiry/Cancellation، Group Booking، First Accept Wins، Race Conditions، Notifications، Dashboard 502.  
**وضع التقرير:** قبل أي إصلاحات جديدة خاصة بـStage 7. الإصلاحات المحلية السابقة في Mobile/API/OpenAPI تُعامل كـbaseline موثق، وليست دليلاً على نجاح Production.  
**قاعدة السلامة:** لم يتم تعديل Production schema أو RLS أو RPC أو triggers أو functions أو Auth أو VPS أو Storage.

## 1. Source of Truth

### المطلوب في المنصة

منصة الويب الأصلية وSupabase Production هما مصدر الحقيقة. يجب ألا يعيد Mobile أو API اختراع دورة حجز مستقلة.

### الموجود في GitHub/المصدر المحلي

المصدر الأصلي المتاح داخل مساحة العمل:

```text
.local/conversation-workspace/files/taealam_build/
```

الملفات الأساسية:

```text
src/pages/Booking.tsx
src/components/teacher/BookingRequests.tsx
supabase/migrations/
```

### الموجود في API

المنطق الرئيسي موجود في:

```text
artifacts/api-server/src/routes/learning.ts
artifacts/api-server/src/routes/directory.ts
artifacts/api-server/src/lib/supabaseAuth.ts
```

### الموجود في Mobile

المنطق الرئيسي موجود في:

```text
artifacts/ajyal-mobile/app/booking.tsx
artifacts/ajyal-mobile/app/find-teacher.tsx
artifacts/ajyal-mobile/lib/teacherAvailability.ts
```

### الحالة

`MATCHED` على مستوى الاتجاه العام، و`PARTIAL` لأن بعض حدود Production لا تزال غير مثبتة.

### الدليل

- الويب ينشئ `booking_requests` أولاً.
- قبول المعلم يمر عبر RPC.
- إنشاء `bookings` يحدث بعد القبول في تدفق المعلم.
- Mobile لا ينشئ `bookings` مباشرة.

## 2. Student Booking Flow

### المطلوب في المنصة

```text
Student
  -> authenticated
  -> complete profile
  -> valid subscription
  -> choose specific teacher or open subject
  -> choose subject
  -> choose day/time
  -> choose duration from subscription
  -> submit booking request
  -> see pending/open request
```

### الموجود في GitHub

`Booking.tsx`:

- يقرأ المستخدم الحالي.
- يتحقق من `full_name`, `phone`, `teaching_stage`.
- يقرأ subscription والرصيد.
- يحسب الدقائق المحجوزة من bookings والطلبات.
- ينشئ request rows.
- يرسل notification بعد الإدراج.

### الموجود في API

`POST /api/booking-requests`:

- session.
- Supabase Bearer.
- student role.
- profile completeness.
- future date.
- active subscription/balance.
- subject lookup.
- direct teacher validation أو open fan-out.
- duplicate checks.
- insert request.
- notifications.

### الموجود في Mobile

`booking.tsx`:

- specific teacher عند وجود `teacherId`.
- open booking عند غياب `teacherId`.
- duration من subscription.
- availability من source data.
- رسائل API المنظمة تظهر للمستخدم.

### الموجود في Database

الطلب يذهب إلى `booking_requests`، وليس `bookings`.

### الحالة

`PARTIAL`.

الـlocal flow واضح، لكن لا توجد جلسة Production مصادق عليها تثبت الدورة كاملة.

### الخطورة

عالية؛ لأن Build وHTTP health لا يثبتان إنشاء سجل حقيقي.

### الإصلاح المقترح

تنفيذ اختبار E2E بحساب طالب ومعلم حقيقيين، دون أي write إضافي قبل موافقة وتنظيف آمن.

## 3. Specific Teacher Booking

### المطلوب في المنصة

```text
Student
  -> chooses specific teacher
  -> chooses subject taught by teacher
  -> chooses day/time from teacher availability
  -> submits request
  -> selected teacher receives notification
  -> teacher accepts/rejects
```

### الموجود في GitHub

في `src/pages/Booking.tsx`:

- `directTeacherId` يأتي من query parameter.
- قراءة `public_teacher_profiles` للمعلم.
- قراءة `teacher_subjects`.
- subject options مقتصرة على مواد المعلم.
- request rows لا تحتوي `teacher_id`.
- notification `user_id = directTeacherId`.

المقطع الحاسم:

```text
Booking.tsx:348-370
```

### الموجود في API

في `learning.ts`:

```text
learning.ts:442-466
```

عند وجود `teacherId`:

- يبحث عن profile معتمد.
- يتحقق من `teacher_subjects`.
- يجعل المعلم المحدد recipient للإشعار.

تم حذف الفحص المحلي السابق الذي كان يرفض الطلب عند عدم تطابق `teaching_stage`، لأنه لم يكن جزءاً من direct flow المثبت في المصدر.

### الموجود في Mobile

يمرر:

```text
teacherId
teacherName
teacherAvailableDays
teacherAvailableFrom
teacherAvailableTo
```

ويمنع الإرسال إذا لم تصل Availability الصحيحة أو subject relation.

### الموجود في Database

لا يوجد دليل أن `booking_requests` يحتوي target `teacher_id`.

الموجود:

```text
accepted_by
```

وهو الفائز بعد القبول، وليس الهدف عند الإنشاء.

### الحالة

```text
Notification recipient = MATCHED
Teacher/subject validation = MATCHED locally
Strict target-only visibility = BLOCKED
Production creation = UNVERIFIED
```

### الخطورة

حرجة بالنسبة للخصوصية/العزل؛ قد يرى معلم آخر الطلب إذا سمحت RLS بذلك.

### الإصلاح المقترح

لا يجوز حل target-only بإضافة شرط Mobile أو API فقط. يلزم إثبات أو تغيير Production في schema/RLS/RPC، ولذلك يصنف:

```text
PRODUCTION CHANGE REQUIRED
```

## 4. Open Subject Booking

### المطلوب في المنصة

```text
Student
  -> no teacher selected
  -> chooses subject
  -> chooses valid date/time
  -> request without teacher_id
  -> all eligible teachers notified
  -> first teacher accepts
  -> accepted_by is winner
```

### الموجود في GitHub

في `Booking.tsx:406-423`:

- request rows تدرج بدون target teacher.
- query إلى `teacher_subjects`.
- embedded `teacher_profiles!inner(user_id, is_approved)`.
- notification لكل profile معتمد.

### Eligibility المثبتة في open broadcast

- subject relation.
- approved teacher.
- user id صالح للإشعار.

### Eligibility غير المثبتة في broadcast

لم يثبت من الكود أن open request نفسه يفلتر قبل الإدراج حسب:

- teacher timezone.
- `available_days/from/to`.
- `teaching_stage` كحقل request.
- ban status منفصل.

لا يجوز إضافة أي من هذه الشروط بالتخمين.

### الموجود في API

في `learning.ts:467-477`:

- يبحث عن `teacher_subjects` للمادة.
- يقرأ profiles المعتمدة.
- يرسل notifications جماعية.
- ينشئ request بدون `teacher_id`.

### الموجود في Mobile

عند عدم وجود `teacherId`:

- يجلب `/api/teachers`.
- يعرض subject options الحقيقية.
- يحسب اتحاد Availability للمعلمين المطابقين للمادة.
- لا يختار معلماً واحداً.
- لا يستخدم أول عنصر أو random أو fallback.

### الموجود في Database

`booking_requests` لا يحتوي target teacher.

### الحالة

```text
Open request contract = MATCHED
Open notification fan-out = MATCHED locally
Server-side availability eligibility = UNVERIFIED
Production E2E = BLOCKED
```

### الخطورة

عالية؛ قد تعرض UI وقتاً صالحاً وفق profiles ثم يقبل API request لا يمر بتحقق Availability server-side.

### الإصلاح المقترح

لا تتم إضافة server-side Availability rule إلا بعد إثبات أن المنصة الأصلية تطبقها، وتحديد timezone الرسمي. حالياً يوثق ذلك `UNVERIFIED` بدلاً من اختراع قاعدة.

## 5. Eligibility

### المطلوب في المنصة

تطبيق شروط المصدر فقط.

### الموجود في GitHub

#### Student

- authenticated.
- profile complete.
- active subscription.
- remaining minutes.

#### Specific teacher

- approved profile.
- teacher subject relation.

#### Open booking

- teacher subject relation.
- approved profile for notification.

### الموجود في API

API يطبق:

- Supabase Bearer.
- student/teacher roles.
- profile completeness.
- valid subject.
- approved teacher في direct path.
- teacher_subject relation.
- subscription/balance.

### الموجود في Mobile

Mobile يعرض teachers/subjects من API ولا يسمح بالحجز المفتوح بدون candidate Availability ظاهرة.

### الموجود في Database

RLS/RPC يملكان شروط visibility/acceptance الخاصة بالمنصة، لكن target teacher غير موجود في request row.

### الحالة

`PARTIAL`.

### الخطورة

إضافة شرط stage أو timezone غير مثبت قد ترفض حجوزات صحيحة؛ إهمال شرط مثبت قد يسمح بحجز غير صالح.

### الإصلاح المقترح

الاحتفاظ بالشروط المثبتة فقط، وتصنيف البقية `UNVERIFIED` حتى يظهر دليل SQL/كود أصلي.

## 6. Availability

### المطلوب في المنصة

مطابقة:

```text
available_days
available_from
available_to
```

بدون default days أو hours.

### المصدر

```text
public_teacher_profiles
```

### الموجود في GitHub

`Booking.tsx:221-240` يقرأ:

```text
available_days
available_from
available_to
```

ويمررها إلى واجهة الحجز المباشر.

في open UI، المصدر الأصلي يحتوي fallback لساعات العرض، لكن هذا fallback غير مسموح في Mobile الحالي.

### الموجود في API

`directory.ts:96-150` يقرأ profile public ويعيد:

```text
availableDays
availableFrom
availableTo
```

### الموجود في Mobile

`teacherAvailability.ts` يدعم:

- JSON arrays.
- PostgreSQL arrays.
- comma/Arabic separators.
- Arabic/English day names.
- short names.
- numeric tokens.

`booking.tsx` يحسب الساعات من window الحقيقية، مع خصم مدة الجلسة من `available_to`.

### timezone

لم يثبت حقل timezone أو دالة تحويل server-side في المصادر المتاحة.

### اختبارات availability المطلوبة

| الحالة | الحالة الحالية |
|---|---|
| بداية availability | `UNVERIFIED E2E` |
| وسط availability | `UNVERIFIED E2E` |
| نهاية availability | `UNVERIFIED E2E` |
| تجاوز النهاية | `CODE VERIFIED locally / server UNVERIFIED` |
| يوم غير متاح | `CODE VERIFIED locally / server UNVERIFIED` |
| timezone مختلف | `UNVERIFIED` |
| وقت سابق | `CODE VERIFIED locally / E2E UNVERIFIED` |
| تعارض جلسة | `PARTIAL` |

### الحالة

`PARTIAL / UNVERIFIED`.

### الخطورة

حرجة؛ UI availability ليست دليلاً على قبول API.

### الإصلاح المقترح

لا fallback. يلزم إثبات server-side contract أو Production test يوضح أن validation يتم عبر RPC/RLS/trigger.

## 7. Timezone

### المطلوب في المنصة

تفسير `available_days/from/to` و`scheduled_at` بنفس timezone المصدر.

### GitHub

لا يوجد في التدفق المقروء عقد واضح يحدد timezone لكل معلم أو تحويل UTC.

### API

يستقبل ISO date ويستخدم `Date`/`toISOString`. لا يفرض timezone المعلم.

### Mobile

ينشئ اليوم والساعة من توقيت الجهاز ثم يحوله إلى ISO.

### Database

لم يثبت عمود timezone أو SQL function مسؤولة عن تحويل المعلم.

### الحالة

`UNVERIFIED`.

### الخطورة

حرجة؛ قد يختار الطالب يوماً/ساعة تبدو صحيحة محلياً لكنها خارج window المعلم.

### الإصلاح المقترح

لا تضف timezone افتراضياً. يلزم دليل Production أو schema/RPC يحدد المصدر.

## 8. Subscription / Minutes

### المطلوب في المنصة

مطابقة:

```text
active subscription
remaining_minutes
ends_at
session_duration_minutes
```

### GitHub

`Booking.tsx:168-218`:

- يقرأ active subscriptions.
- يجمع remaining minutes.
- يقرأ session duration.
- يحجز دقائق bookings المستقبلية.
- يحجز دقائق booking requests المفتوحة/المقبولة.

### API

`learning.ts:179-231`:

- يقرأ subscriptions.
- يقرأ future bookings.
- يقرأ open/accepted requests.
- يطابق accepted requests مع bookings.
- يمنع الحجز إذا:

```text
remainingMinutes - reservedMinutes < requestedMinutes
```

### Mobile

يعرض remaining balance، ويمنع submit إذا كانت المدة أكبر من المتاح.

### Database

لم يثبت من المصادر أن الدقائق تخصم عند request creation أو accept. الذاكرة الحالية تشير إلى أن الخصم الفعلي مرتبط بإنهاء session trigger، ويجب عدم تغييره.

### الحالة

`MATCHED locally / E2E UNVERIFIED`.

### الخطورة

عالية؛ سباق طلبين عند آخر دقائق يمكن أن ينتج oversubscription إذا لم يكن الحسم ذرّياً.

### الإصلاح المقترح

لا تضف خصماً محلياً. اختبر آخر دقائق في Production أو صنف race كـ`BLOCKED`.

## 9. booking_requests

### المطلوب في المنصة

إنشاء request أولاً، مع status lifecycle واضح.

### الأعمدة المثبتة من الاستخدام

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

### GitHub

الويب يدرج status `open`، expiry ساعة واحدة، وgroup id عند إرسال مجموعة مواعيد.

### API

ينشئ:

```text
status = open
accepted_by = null
expires_at = now + 1 hour
group_id = crypto.randomUUID()
```

### Mobile

لا يكتب الجدول مباشرة في المسار الحالي؛ يستخدم API.

### Database

لا يوجد `teacher_id` target مثبت.

### الحالة

`MATCHED` في الأعمدة الأساسية، `PARTIAL` للـtarget semantics.

## 10. Accept

### المطلوب في المنصة

```text
Teacher sees request
  -> accepts
  -> request becomes accepted
  -> booking is created
  -> student is notified
```

### GitHub

`BookingRequests.tsx:256-315`:

- group uses `accept_booking_group`.
- single uses `accept_booking_request`.
- reads active subscription.
- inserts bookings.
- notifies student.

### API

`learning.ts:610-750`:

- validates open request.
- validates group.
- checks expiry.
- checks active teacher session.
- checks schedule conflict.
- checks student allowance.
- calls acceptance RPC.
- creates missing bookings.
- sends student notification/chat.

### Database

RPC is authoritative for request acceptance. Booking insert occurs in a later operation in the current server path.

### الحالة

`PARTIAL`.

### الخطورة

حرجة؛ RPC success followed by booking insert failure can create inconsistent lifecycle unless Production transaction covers it.

## 11. Reject

### المطلوب في المنصة

Teacher rejects request; no booking/session is created; student is informed; open requests may remain available according to source behavior.

### GitHub

`BookingRequests.tsx:160-173` calls:

```text
reject_booking_request
```

for grouped request ids.

### API

`learning.ts:750-797` calls:

```text
reject_booking_request
```

then sends `booking_rejected` notification to student.

### Mobile

Mobile is a student join client and does not own teacher decision lifecycle.

### Database

Reject RPC is Production-owned and was not modified.

### الحالة

`MATCHED locally / E2E UNVERIFIED`.

### أسئلة غير مثبتة

- هل open request becomes visible to other teachers after one teacher rejects?
- هل reject closes the whole group?
- هل any refund occurs before acceptance?

لا يتم تخمينها.

## 12. Expiry

### المطلوب في المنصة

طلب منتهٍ لا يقبل بعد انتهاء `expires_at`.

### GitHub

الويب يعرض الطلبات المفتوحة التي لم تنتهِ، ويستبعد rows expired في القراءة. لا يوجد في الملفات المقروءة إثبات job/cron يغير status إلى `expired`.

### API

`mapRemoteBookingRequest` يحول open request إلى display status `expired` إذا تجاوز `expires_at`.

قرار accept يتحقق من expiry قبل RPC.

### Mobile

يعرض حالات الطلب، لكنه لا يملك expiry timer لتغيير Production status.

### Database

لم يثبت trigger أو cron أو Edge Function يكتب `expired`.

### الحالة

```text
Read-time expiry = MATCHED/PARTIAL
Authoritative status mutation = UNVERIFIED
```

### الإصلاح المقترح

لا تضف local expiry write أو timer. يلزم إثبات Production scheduler أو الإبقاء على `UNVERIFIED`.

## 13. Cancellation

### المطلوب في المنصة

تحديد منفصل لـ:

- Student cancellation.
- Teacher cancellation.
- booking status.
- session status.
- notification.
- refund/minutes.

### GitHub/API evidence

توجد مسارات cancellation للجلسات، لكن هذه الجولة لم تثبت مسار refund تلقائي للطلب المفتوح أو booking قبل/بعد بدء session.

الخصم المالي لا يُعاد افتراضه.

### Mobile

Mobile يعرض الحالة ويستخدم المسارات الموجودة، ولا ينفذ refund أو billing محلياً.

### الحالة

`PARTIAL / UNVERIFIED`.

### الخطورة

حرجة مالياً إذا تم تغيير minutes/refund بالتخمين.

### الإصلاح المقترح

توثيق المصدر المالي من trigger/RPC Production قبل أي تعديل.

## 14. Group Booking

### المطلوب في المنصة

عدة request rows من submission واحدة تشترك في `group_id`، ويتم اتخاذ القرار على المجموعة.

### GitHub

`Booking.tsx:343-357` ينشئ group id واحداً لكل submission.

`BookingRequests.tsx:256-269` يستخدم:

```text
accept_booking_group
```

ثم ينشئ bookings متعددة.

### API

يقرأ group rows، ويطبق RPC، ثم يحاول إنشاء كل bookings الناقصة.

### Database

RPC group هو المصدر الذري لقبول request rows بحسب ما ظهر من الاسم/الاستخدام، لكن transaction الشاملة مع bookings لم تثبت.

### الحالة

`PARTIAL`.

### الخطورة

قبول جزء من المجموعة أو إنشاء bookings ناقصة إذا فشلت خطوة لاحقة.

### الإصلاح المقترح

لا تحول النظام إلى implementation جديد من Mobile. يلزم Production proof أو تغيير Production بموافقة.

## 15. First Accept Wins

### المطلوب في المنصة

معلمان مؤهلان يقبلان نفس open request:

```text
one winner
other loses
no duplicate bookings
```

### GitHub/SQL evidence

RPC الفردي يستخدم conditional state:

```sql
status = 'open'
```

ومجموعة `accept_booking_group` موجودة.

### API

يستدعي نفس RPC ولا ينفذ:

```text
SELECT pending
ثم UPDATE pending
```

### Mobile

لا يعيد تنفيذ First Accept Wins؛ القرار server-side.

### الحالة

```text
RPC mechanism = MATCHED
Concurrent Production proof = UNVERIFIED
Request-to-booking atomicity = UNVERIFIED
```

### الخطورة

حرجة. أي قبولين أو bookingين لنفس request يصنف `CRITICAL / BLOCKED`.

## 16. Race Conditions

### الاختبارات المطلوبة

| Race | الحماية الحالية | الحالة |
|---|---|---|
| معلمان يقبلان نفس request | conditional RPC | `UNVERIFIED E2E` |
| طلبان لنفس الموعد | duplicate pre-check | `UNVERIFIED atomicity` |
| إنشاء حجزين للطالب بالتوازي | API pre-check | `BLOCKED without DB proof` |
| آخر دقائق subscription | allowance read/pre-check | `BLOCKED without atomic debit` |
| نفس request مرتين | duplicate request pre-check | `PARTIAL` |
| retry بعد timeout | idempotency غير مثبتة كـkey | `UNVERIFIED` |
| double tap | UI pending state | `PARTIAL`, server still authority |

### النتائج التي يجب فحصها

- duplicate bookings.
- duplicate charges.
- duplicate notifications.
- duplicate sessions.
- negative remaining minutes.
- inconsistent status.

لم يتم تنفيذ هذه الاختبارات على Production.

### الحالة

`UNVERIFIED / BLOCKED`.

## 17. Notifications

### المطلوب في المنصة

#### Created

- specific: teacher فقط.
- open: eligible teachers.

#### Accept

- student confirmation.

#### Reject

- student rejection message.

#### Expiry/Cancellation

يجب إثبات notification source لكل حالة.

### GitHub/API

تم العثور على:

- `notifications` inserts.
- `sendUserPushNotification`.
- Realtime subscription في واجهة teacher الأصلية.
- Mobile bookings screen يستمع إلى realtime updates.

### ما لا يثبت

إدراج row لا يثبت:

- وصول push.
- وصول Realtime للجهاز.
- عدم duplicate notification عند retry.

### الحالة

`PARTIAL / E2E UNVERIFIED`.

## 18. Database Writes

### Student create

```text
INSERT booking_requests
```

لا يتم:

```text
INSERT bookings
INSERT sessions
```

من Mobile student.

### Teacher accept

```text
RPC accept_booking_request/group
INSERT bookings
INSERT notifications
optional INSERT chat_messages
```

### Teacher reject

```text
RPC reject_booking_request
INSERT student notification
```

### Production restrictions

لم يتم تنفيذ:

- schema changes.
- RLS changes.
- RPC changes.
- trigger changes.
- function changes.

### الحالة

`MATCHED` للتدفق العام، `PARTIAL` للذرية والـtarget isolation.

## 19. Mobile/API/OpenAPI Parity

| Feature | GitHub | API | Mobile | OpenAPI | Database | Status |
|---|---|---|---|---|---|---|
| Specific request | no target column, direct notification | optional direct teacher | teacher selector | optional teacherId | no target column | `PARTIAL` |
| Open request | no target, fan-out | optional teacherId + fan-out | no teacher + union Availability | teacherId optional | open request | `PARTIAL` |
| Availability | profile fields | directory mapping | normalization + slot filtering | response fields | profile columns | `PARTIAL` |
| Stage | profile completeness; no proven request field in direct flow | old mismatch removed | not sent in create | not required | nullable/unclear | `MATCHED/PARTIAL` |
| Duration | subscription | allowance | subscription | bounded number | subscription | `MATCHED` |
| Accept | RPC then booking insert | same shape | teacher lifecycle not mobile-owned | decision contract | RPC | `PARTIAL` |
| Reject | RPC | RPC | not mobile-owned | decision contract | RPC | `MATCHED/PARTIAL` |
| Expiry | read-time/expiry field | read-time and decision guard | display | response | mutation unknown | `UNVERIFIED` |
| Notifications | DB rows + realtime | rows + push | list/realtime | not applicable | notifications | `PARTIAL` |

## 20. Production Blockers

### Blocker A — Real identities

لا توجد جلسة اختبار معتمدة تسمح بـ:

```text
student create
teacher receive
teacher accept/reject
database verification
cleanup
```

الحالة: `BLOCKED`.

### Blocker B — Target-only specific teacher

### PRODUCTION CHANGE REQUIRED

لضمان عزل الطلب عن معلمين غير محددين، يلزم schema/relation/RLS/RPC Production.

البديل الحالي هو notification recipient + subject/approval filter، وهو لا يساوي strict target-only.

الحالة: `PRODUCTION BLOCKED`.

### Blocker C — Atomic acceptance and booking

### PRODUCTION CHANGE REQUIRED

إذا لم يثبت Production أن RPC والـbooking insert داخل transaction واحدة، يلزم تعديل Production function/RPC أو مصدر قبول مركزي.

لا يتم اختراع transaction محلية في Mobile.

الحالة: `UNVERIFIED / PRODUCTION BLOCKED`.

### Blocker D — Server-side Availability/Timezone

### PRODUCTION CHANGE REQUIRED

يلزم عقد يثبت:

- timezone.
- day interpretation.
- from/to semantics.
- server-side validation.

الحالة: `UNVERIFIED`.

### Blocker E — Dashboard 502

المسار الحالي يجمع queries متعددة في `Promise.all` ثم يعيد `502` من catch عام. سجل التشغيل السابق أثبت 502، لكنه لم يثبت أي upstream منفرد.

الحالة: `BLOCKED / UNVERIFIED`.

## Risk Summary

| Risk | Severity | Status |
|---|---|---|
| target-only direct visibility غير ممكنة من المخطط | Critical | `PRODUCTION BLOCKED` |
| قبول request ثم فشل booking insert | Critical | `UNVERIFIED` |
| race في آخر دقائق subscription | Critical | `UNVERIFIED` |
| timezone mismatch | High | `UNVERIFIED` |
| open API لا يتحقق من Availability لكل مرشح | High | `UNVERIFIED` |
| push delivery | Medium | `UNVERIFIED` |
| expiry authoritative mutation | Medium | `UNVERIFIED` |
| dashboard 502 generic catch | High | `BLOCKED` |

## Pre-Fix Decision

قبل أي إصلاح Stage 7 جديد:

```text
Do not modify Production.
Do not add schema/RLS/RPC/trigger/function workaround.
Do not add availability fallback.
Do not claim E2E success.
```

الإصلاحات الآمنة المحتملة داخل Mobile/API/OpenAPI فقط:

1. تحسين تشخيص Dashboard 502 بدون كشف tokens أو PII.
2. تصحيح عقد أو mapping مثبت بالدليل.
3. الحفاظ على open flow بدون اختيار معلم واحد أو fallback.

أي إصلاح يغير eligibility أو timezone أو atomicity يجب أن يتوقف عند:

```text
PRODUCTION CHANGE REQUIRED
```
