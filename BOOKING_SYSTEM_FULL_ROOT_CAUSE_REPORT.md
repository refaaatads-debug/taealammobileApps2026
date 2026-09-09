# تقرير التدقيق الكامل لنظام حجز الجلسات

**تاريخ التدقيق:** 2026-09-06  
**النطاق:** منصة الويب الأصلية، GitHub، Supabase/PostgreSQL، API، وتطبيق Expo.  
**الحكم النهائي:** `CODE VERIFIED` مع `PRODUCTION BLOCKED` للاختبار الحقيقي وبعض ضمانات Production.

## 1. Executive Summary

الخطأ المتكرر في الهاتف لم يكن في قراءة `available_days` أو في إنشاء الساعة محلياً. السبب الجذري كان شرطاً أضافه API الهاتف ولم يكن موجوداً في منصة الويب الأصلية:

```text
API الهاتف كان يرفض حجز المعلم المحدد عند عدم تطابق teaching_stage،
والمنصة الأصلية لا تنفذ هذا الرفض في هذا المسار.
```

كما كان API الهاتف يرسل `teaching_stage` إلى `booking_requests`، بينما كود GitHub الأصلي لا يرسل هذا الحقل في حجز المعلم المحدد.

تمت إزالة هذا الانحراف من:

```text
artifacts/api-server/src/routes/learning.ts
```

لم تتم الكتابة إلى Production، ولم تتم إضافة `teacher_id` إلى جدول Production.

لا يوجد إثبات E2E لحجز حقيقي بحساب طالب ومعلم مصادق عليهما، لذلك لا يصح إعلان:

```text
Booking Created = SUCCESS
```

## 2. Web Platform Booking Flow

المسار الأصلي في `src/pages/Booking.tsx`:

```text
اختيار مادة
  -> اختيار يوم ووقت
  -> INSERT booking_requests
  -> إشعار للمعلم المحدد أو المعلمين المؤهلين
  -> قبول المعلم عبر RPC
  -> إنشاء bookings
```

في حجز المعلم المحدد، يقرأ المصدر الأصلي:

```text
public_teacher_profiles.available_days
public_teacher_profiles.available_from
public_teacher_profiles.available_to
```

ويقرأ المواد من:

```text
teacher_subjects -> subjects
```

## 3. Mobile Booking Flow

المسار الحالي:

```text
find-teacher.tsx
  -> teacher.id = public_teacher_profiles.user_id
  -> booking.tsx
  -> بيانات Availability القادمة من API
  -> اختيار المادة والموعد
  -> useCreateBookingRequest
  -> POST /api/booking-requests
```

الهاتف لا ينشئ `bookings` مباشرة. يتم إنشاء `booking_requests` أولاً، ثم يتحول الطلب إلى جلسة بعد قبول المعلم حسب دورة المنصة.

## 4. API Booking Flow

المسار:

```text
POST /api/booking-requests
  -> Supabase session
  -> role = student
  -> profile completeness
  -> future date
  -> active subscription and remaining balance
  -> subjects lookup
  -> approved teacher lookup
  -> teacher_subjects relation
  -> duplicate checks
  -> INSERT booking_requests
  -> notification to selected teacher
```

تم حذف فحص المرحلة غير الموجود في المصدر الأصلي من هذا المسار.

## 5. Database Booking Flow

### `booking_requests`

المخطط الأصلي الذي تم العثور عليه يحتوي على:

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

لا يحتوي الجدول على `teacher_id` مستهدف لحجز المعلم المحدد.

### `bookings`

الحجز المؤكد يحتوي على:

```text
student_id
teacher_id
subject_id
scheduled_at
duration_minutes
status
```

## 6. Availability Source

| العنصر | المصدر الأصلي | Mobile | API | Database | الحالة |
|---|---|---|---|---|---|
| Teacher ID | `public_teacher_profiles.user_id` | يمرره من بطاقة المعلم | يبحث به في الملف العام | `user_id` | `MATCHED` |
| Profile ID | `public_teacher_profiles.id` | لا يعرضه للمستخدم | يستخدمه لفحص `teacher_subjects` | `teacher_profiles.id` | `MATCHED` |
| Subjects | `teacher_subjects -> subjects` | يعرض مواد المعلم | يتحقق من العلاقة | `subject_id` | `MATCHED` |
| Days | `available_days` | يطبع arrays والصيغ العربية/الإنجليزية | يعيد `availableDays` | `public_teacher_profiles` | `MATCHED` |
| Start | `available_from` | يولد الساعات بعده | يعيد `availableFrom` | `public_teacher_profiles` | `MATCHED` |
| End | `available_to` | يمنع تجاوز النهاية | يعيد `availableTo` | `public_teacher_profiles` | `MATCHED` |
| Timezone | غير مثبت كحقل/قاعدة تحويل واضحة | يستخدم توقيت الجهاز | لا يفرض تحويل المعلم | غير مثبت | `UNVERIFIED` |

تم دعم:

- JSON arrays.
- PostgreSQL arrays.
- الفواصل العربية والإنجليزية.
- أسماء الأيام العربية والإنجليزية.

لا يوجد fallback محلي لبيانات معلم محدد. إذا لم تصل Availability، تعرض الشاشة الحالة غير المكتملة ولا تخترع جدولاً.

## 7. Teacher-Specific Booking

المصدر الأصلي ينفذ:

```text
INSERT booking_requests
notification إلى المعلم المحدد
```

ولا يرسل `teacher_id` داخل سجل `booking_requests`.

الهاتف وAPI يطابقان ذلك في الإدراج والإشعار بعد الإصلاح.

لكن ضمان أن الطلب لا يظهر لمعلم آخر غير المستهدف غير ممكن من المخطط الحالي؛ لأن RLS يعتمد على المادة والاعتماد والمرحلة، وليس على `teacher_id` مستهدف.

الحالة: `PARTIAL / PRODUCTION BLOCKED`.

## 8. Subject Open Booking

المنصة الأصلية تدعم مساراً مختلفاً عند عدم وجود معلم محدد:

```text
Subject
  -> booking_requests بدون teacher_id
  -> إشعارات للمعلمين المرتبطين بالمادة والمعتمدين
  -> أول معلم يقبل
  -> accepted_by
  -> bookings
```

الدليل في GitHub:

```text
teacher_subjects
  -> teacher_profiles!inner(user_id, is_approved)
  -> notifications لكل معلم مؤهل
```

تم تنفيذ هذا المسار داخل Mobile/API دون تغيير Production:

- `teacherId` أصبح اختيارياً في OpenAPI والـgenerated client.
- API ينشئ `booking_requests` بدون `teacher_id` عند غياب المعلم.
- API يبحث عن المعلمين المعتمدين المرتبطين بالمادة ويرسل إشعارات fan-out.
- شاشة الهاتف تقرأ المعلمين الحقيقيين من `/api/teachers`.
- الأيام والساعات المفتوحة هي اتحاد Availability المنشورة للمعلمين المؤهلين للمادة.
- لا تُستخدم ساعات 8–23 أو بيانات محلية افتراضية.

كود الويب الأصلي يستخدم ساعات افتراضية في حالة الحجز المفتوح، لكن قاعدة السلامة الحالية تمنع نقل هذا fallback إلى الهاتف. لذلك يستخدم الهاتف Availability الحقيقية بدلاً من اختراع ساعات.

الحالة: `PARTIAL` بسبب عدم وجود تحقق نهائي من Availability/timezone داخل Production.

## 9. First Accept Wins

تم العثور على RPC الفردي:

```sql
UPDATE public.booking_requests
SET status = 'accepted',
    accepted_by = _teacher_id,
    accepted_at = now()
WHERE id = _request_id
  AND status = 'open';
```

شرط `status = 'open'` يمنع قبول الطلب الفردي بعد انتقاله إلى حالة أخرى.

تم العثور أيضاً على:

```text
accept_booking_group(_group_id, _teacher_id)
```

لكن إنشاء `bookings` بعد RPC يتم في طلب منفصل في التدفق الحالي. لذلك:

- منع قبول الطلب الفردي مرتين: `MATCHED` على مستوى RPC.
- ضمان ذرية RPC + إنشاء `bookings`: `UNVERIFIED`.
- منع معلمين من قبول عدة صفوف في مجموعة بشكل ذري كامل: `PARTIAL`.

لا يوجد implementation محلي بديل لـFirst Accept Wins.

## 10. Subscription Validation

يتم استخدام:

```text
user_subscriptions
is_active = true
remaining_minutes > 0
ends_at غير منتهٍ أو NULL
```

ويتم حجز دقائق الطلبات المفتوحة/المقبولة والجلسات المستقبلية من الرصيد قبل السماح بطلب جديد.

الحالة: `MATCHED` بالنسبة لمسار الطالب الحالي، مع بقاء اختبار Production الحقيقي غير منفذ.

## 11. Balance Validation

يتم حساب:

```text
available subscription minutes
- future booking minutes
- unmatched open/accepted request minutes
```

ويتم رفض الطلب إذا كان المتبقي أقل من مدة الجلسة المطلوبة.

لا يتم خصم الدقائق عند إنشاء الطلب. الخصم الفعلي مرتبط بدورة الجلسة النهائية في المنصة، وليس بإنشاء الطلب من الهاتف.

الحالة: `MATCHED / UNVERIFIED E2E`.

## 12. Timezone

تم إرسال `startsAt` كـISO timestamp من الهاتف، كما في المنصة الأصلية.

لكن لم يتم العثور على عقد Production يثبت:

- timezone المعلم.
- هل `available_from/to` بتوقيت المعلم أو UTC.
- قاعدة تحويل يوم الأسبوع عند مقارنة `startsAt`.

لذلك:

```text
Mobile filtering = UX protection
Server-side timezone enforcement = UNVERIFIED
```

لا يجوز إضافة timezone افتراضي من عندنا.

## 13. Duration

مدة الجلسة تقرأ من الاشتراك الفعال:

```text
session_duration_minutes
```

ولا يتم اختيار مدة عشوائية من المستخدم في الشاشة الحالية.

الحالة: `MATCHED` لمسار المعلم المحدد.

## 14. Notifications

### معلم محدد

يتم إرسال إشعار إلى `teacherId` المحدد بعد نجاح الإدراج.

### حجز مفتوح

المنصة الأصلية ترسل إشعاراً إلى كل معلم معتمد مرتبط بالمادة.

الهاتف وAPI يطبقان الآن الإشعار الجماعي للمعلمين المؤهلين في المسار المفتوح.

الحالة: `MATCHED` بالنسبة للتوزيع المحلي، و`UNVERIFIED` بالنسبة لوصول الإشعارات الفعلي في Production.

## 15. RLS / RPC / Functions

تم العثور على سياسات تسمح للطالب بإدراج طلبه، وتسمح للمعلمين المعتمدين المرتبطين بالمادة برؤية/قبول الطلب المفتوح.

تم العثور على:

```text
accept_booking_request
accept_booking_group
```

ولم يتم تعديل أي منها.

المشكلة المهمة:

```text
RLS لا يملك target teacher لحجز المعلم المحدد،
لأن booking_requests لا يحتوي teacher_id.
```

الحالة: `MATCHED` بالنسبة للمخطط الموجود، لكنها `BLOCKED` بالنسبة لضمان target-only.

## 16. Exact Mismatches

| Feature | Web | Mobile | API | DB | Status | Evidence |
|---|---|---|---|---|---|---|
| Availability source | `public_teacher_profiles` | نفس البيانات | نفس الجدول | نفس الحقول | `MATCHED` | `Booking.tsx`, `directory.ts` |
| Arrays/days parsing | صيغ المصدر | تطبيع عربي/إنجليزي | يطبع arrays | PostgreSQL arrays | `MATCHED` | `teacherAvailability.ts` |
| Direct teacher request | insert + selected notification | API request | insert + notification | لا target column | `PARTIAL` | `Booking.tsx`, SQL migration |
| Open subject request | insert + fan-out notifications | مادة + Availability اتحاد المعلمين المؤهلين | optional `teacherId` + fan-out | broadcast RLS | `PARTIAL` | OpenAPI, `booking.tsx`, `learning.ts` |
| Stage pre-check | غير موجود في direct flow | كان مفروضاً | تمت إزالته | policy optional/null | `MATCHED` بعد الإصلاح | `learning.ts` |
| First Accept Wins | RPC status transition | لا يعيد بناءه | RPC ثم booking REST | `status = open` | `PARTIAL` | acceptance migration |
| Availability timezone | غير مثبت بوضوح | device time | لا يتحقق نهائياً | غير مثبت | `UNVERIFIED` | لا يوجد عقد authoritative |
| Subscription | active + minutes | يقرأ Supabase | يتحقق قبل insert | `user_subscriptions` | `MATCHED` | `learning.ts`, `Booking.tsx` |
| Real E2E create | غير مختبر | غير مختبر | غير مختبر بجلسة اختبار | لم تتم الكتابة | `BLOCKED` | لا توجد جلسة اختبار آمنة |

## 17. Root Cause

السبب الأول الذي منع إنشاء طلب الحجز:

```text
فحص مرحلة الطالب والمعلم أُضيف في API الهاتف رغم غيابه من مسار
حجز المعلم المحدد في المنصة الأصلية.
```

والانحراف الثاني:

```text
إرسال teaching_stage إلى booking_requests،
مما كان يفعّل مطابقة RLS الحرفية عند اختلاف صيغة المرحلة.
```

## 18. Fix Applied

تم تعديل:

```text
artifacts/api-server/src/routes/learning.ts
```

بحذف:

- `teacherStages` من مسار الإنشاء.
- رفض عدم تطابق المرحلة.
- كتابة `teaching_stage` الإضافية.

كما تم:

- جعل `teacherId` اختيارياً في عقد الحجز.
- إضافة إنشاء الطلب المفتوح وإشعارات المعلمين المؤهلين في API.
- إضافة وضع الحجز المفتوح في الهاتف باستخدام Availability الحقيقية من `/api/teachers`.

تم الإبقاء على تحقق المصدر الحقيقي:

- Supabase session.
- role الطالب.
- profile completeness.
- subscription/balance.
- subject lookup.
- approved teacher.
- `teacher_subjects`.
- future date.
- duplicate checks.

لم يتم:

- تعديل Production.
- تعديل schema.
- إضافة `teacher_id`.
- تعديل RLS.
- تعديل RPC أو triggers.
- استخدام mock/fallback.

## 19. Verification

### Code checks

```text
API typecheck: PASS
API build: PASS
Mobile typecheck: PASS
git diff --check: PASS
```

### Expo bundles

```text
iOS bundle: PASS
Android bundle: PASS
Expo Metro startup: PASS
44 assets processed successfully
```

ظهر خطأ React Native DevTools بسبب `libglib-2.0.so.0` المفقود في بيئة NixOS، لكنه لم يمنع Metro أو bundling، وهو نفس القيد المعروف للـDevTools الاختياري.

### API health and authorization

```text
GET /api/healthz                 -> 200 {"status":"ok"}
GET /api/teachers بدون جلسة      -> 401 Authentication required
GET /api/booking-requests بدون جلسة -> 401 Authentication required
GET /api/auth/user بدون جلسة     -> 200 {"user":null}
```

### Logs

API workflow يعمل، وطلبات preflight وطلبات الحجز/الجلسات المصادق عليها ظهرت في السجل.

ظهر أيضاً فشل منفصل ومتكرر:

```text
GET /api/student/dashboard -> 502
```

هذا لا يثبت فشل `POST /api/booking-requests`، لكنه فجوة تشغيلية مستقلة من Production وتحتاج تدقيقاً منفصلاً. لم يتم تغييرها ضمن تدقيق الحجز حتى لا يتم خلط السبب.

### E2E

لم يتم تنفيذ:

- حجز حقيقي بحساب طالب.
- قبول حقيقي بحساب معلم.
- تحقق من ظهور الطلب في حساب المعلم.
- تحقق من إنشاء `bookings` بعد القبول.
- اختبار معلمين يقبلان نفس الطلب في الوقت نفسه.

الحالة: `PRODUCTION BLOCKED`.

## 20. Remaining Blockers

### Blocker A — E2E Production account

يلزم حساب طالب ومعلم اختبار مصادق عليهما، مع موافقة صريحة على إنشاء سجل حجز حقيقي يمكن تنظيفه بالطريقة المعتمدة. لا يجوز تعويض ذلك ببيانات وهمية.

### Blocker B — Strict selected-teacher targeting

جدول `booking_requests` لا يحتوي `teacher_id`. لا يمكن ضمان target-only من Mobile/API دون واحد من:

- إضافة target column.
- إضافة جدول ربط.
- تعديل RLS/RPC.

هذا تغيير Production ممنوع تنفيذه تلقائياً.

### Blocker C — Server-side Availability/timezone

الهاتف يستخدم Availability الحقيقية للمعلمين المؤهلين، لكن Production لا يثبت عقداً نهائياً يقارن `startsAt` مع timezone وساعات كل معلم. لذلك تبقى الفلترة الحالية حماية UX وليست حماية API نهائية.

### Blocker D — RPC + booking atomicity

قبول الطلب وإنشاء `bookings` ليسا مثبتين كعملية واحدة ذرية في API الحالي. لا يجوز اختراع transaction محلية لتحل محل Production RPC.

## Final Status

```text
CODE VERIFIED
PRODUCTION BLOCKED
```

هذا يعني أن المصدر المحلي، العقد، الإصلاح، والبناءات تم التحقق منها، لكن نجاح إنشاء الحجز الحقيقي ودورة النظامين بالكامل لم يُثبت في Production، ولا يجوز وصفه بأنه مكتمل قبل اختبار E2E آمن وحل القيود المذكورة.