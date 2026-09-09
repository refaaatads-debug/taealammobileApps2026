# تقرير السبب الجذري ومطابقة نظام الحجز

**تاريخ التدقيق:** 2026-09-06  
**النطاق:** Availability، حجز معلم محدد، الحجز المفتوح حسب المادة، طلبات الحجز، القبول، الحماية من التكرار، ونتيجة الإنتاج.  
**قاعدة السلامة:** لم تتم أي كتابة اختبارية أو حقيقية إلى Production، ولم يتم تعديل schema أو RLS أو RPC أو Trigger.

## 1. الملخص التنفيذي

كان الخطأ الظاهر في الهاتف:

> المعلم المختار لا يستقبل طلبات هذه المرحلة الدراسية

لم يكن سببه اليوم أو الساعة أو الرصيد. كان سببه اختلاف أُضيف في API الهاتف عن تنفيذ المنصة الأصلية:

1. API الهاتف كان يفحص مرحلة الطالب مقابل مراحل المعلم قبل إنشاء `booking_requests`.
2. المنصة الأصلية في GitHub لا تنفذ هذا الفحص في مسار المعلم المحدد.
3. API الهاتف كان يكتب `teaching_stage` داخل الطلب، بينما المنصة الأصلية لا ترسل هذا الحقل في مسار المعلم المحدد.
4. سياسة Production تستخدم `teaching_stage` لتصفية طلبات المعلمين بقيم مطابقة حرفياً، لذلك كان الطلب يُرفض محلياً أو يصبح غير ظاهر عند وجود اختلاف صيغة.

تم إصلاح السبب المحلي بإزالة فحص المرحلة والكتابة الإضافية من مسار المعلم المحدد، مع الإبقاء على فحص الدور، الملف الشخصي، الاشتراك، المادة، اعتماد المعلم، الموعد والتكرار.

## 2. مصدر Availability الحقيقي

### المنصة الأصلية

المصدر المثبت في GitHub هو:

```text
public_teacher_profiles.available_days
public_teacher_profiles.available_from
public_teacher_profiles.available_to
```

الدليل:

```text
src/pages/Booking.tsx
  public_teacher_profiles.select(
    "available_days, available_from, available_to, id"
  )
```

### تطبيق الهاتف

المسار الحالي:

```text
GET /api/teachers
  -> public_teacher_profiles
  -> directory.ts
  -> ListTeachersResponse
  -> find-teacher.tsx
  -> booking.tsx
```

تستخدم شاشة الحجز نفس الحقول القادمة من الدليل، ولا تنشئ Availability محلية.

### تطبيع الأيام والساعات

تم دعم صيغ:

- JSON arrays.
- PostgreSQL arrays مثل `{الأحد,الإثنين}`.
- الفاصلة الإنجليزية والعربية.
- أسماء الأيام العربية والإنجليزية والرقمية.
- `available_from` و`available_to` كأوقات من المصدر.

## 3. تدفق المعرّفات

| العنصر | المنصة الأصلية | الهاتف/API | النتيجة |
|---|---|---|---|
| معرف المعلم في الدليل | `public_teacher_profiles.user_id` | `teacher.id` من API وهو `user_id` | مطابق |
| معرف ملف المعلم | `public_teacher_profiles.id` | يُقرأ لاحقاً لجلب `teacher_subjects` | مطابق |
| ربط المادة | `teacher_subjects.teacher_id` | يُتحقق باستخدام profile id | مطابق |
| معرف المادة | `subjects.id` | API يبحث بالاسم ثم يستخدم `subjects.id` | مطابق |
| Availability owner | ملف المعلم العام | `user_id` ثم profile id للمادة | مطابق |

## 4. حجز معلم محدد

### تنفيذ المنصة الأصلية في GitHub

المنصة تقوم بالآتي:

```text
Teacher + Subject + Day + Time
  -> INSERT booking_requests
  -> notification إلى المعلم المحدد
  -> المعلم يقبل
  -> accept_booking_request
  -> bookings
```

جدول `booking_requests` الأصلي لا يحتوي `teacher_id`. الحقول الأساسية هي:

```text
student_id
subject_id
scheduled_at
duration_minutes
status
accepted_by
expires_at
```

### تنفيذ الهاتف بعد الإصلاح

```text
find-teacher.tsx
  -> teacherId = public_teacher_profiles.user_id
  -> booking.tsx
  -> POST /api/booking-requests
  -> subjects.id
  -> teacher_profiles.id
  -> INSERT booking_requests
  -> notification إلى teacherId
```

تمت إزالة الفحص المحلي الإضافي للمرحلة وإزالة كتابة `teaching_stage` من هذا المسار حتى يطابق مسار GitHub الأصلي.

## 5. سبب الخطأ المتكرر — ROOT CAUSE

```text
ROOT CAUSE =
API الهاتف فرض شرط teaching_stage قبل INSERT،
بينما المنصة الأصلية لا تفرض هذا الشرط في حجز المعلم المحدد.
```

الدليل المحلي:

```text
artifacts/api-server/src/routes/learning.ts
router.post("/booking-requests")
```

الدليل في GitHub:

```text
src/pages/Booking.tsx
```

حيث يتم إدراج الطلب مباشرة دون فحص `teaching_stage` ودون إرسال الحقل.

## 6. الحجز المفتوح حسب المادة

المنصة الأصلية تدعم مساراً ثانياً عند عدم وجود معلم محدد:

```text
Subject + Day + Time
  -> booking_requests بدون teacher_id
  -> إشعارات للمعلمين المعتمدين المرتبطين بالمادة
  -> أول معلم يقبل
  -> accepted_by
  -> bookings
```

في GitHub، التوزيع يعتمد على:

```text
teacher_subjects
teacher_profiles.is_approved
notifications
```

أما تطبيق الهاتف الحالي فعقده يفرض `teacherId` في:

```text
lib/api-spec/openapi.yaml
lib/api-zod/src/generated/api.ts
artifacts/ajyal-mobile/app/booking.tsx
```

لذلك مسار الهاتف الحالي هو **حجز معلم محدد فقط**، وليس واجهة الحجز المفتوح الكاملة.

## 7. قبول أول معلم

المصدر يستخدم:

```text
accept_booking_request(_request_id, _teacher_id)
accept_booking_group(_group_id, _teacher_id)
```

والتحديث الذري الأساسي في RPC الفردي هو:

```sql
UPDATE booking_requests
SET status = 'accepted',
    accepted_by = _teacher_id,
    accepted_at = now()
WHERE id = _request_id
  AND status = 'open';
```

هذا يمنع قبول طلب فردي بعد انتقاله من `open`.

في API الحالي، إنشاء `bookings` يتم بعد RPC في طلب REST منفصل. لذلك لا يمكن إثبات الذرية الكاملة بين قبول الطلب وإنشاء الحجز من Mobile/API فقط.

## 8. Availability ووقت الحجز

الهاتف يولد الساعات داخل:

```text
artifacts/ajyal-mobile/app/booking.tsx
```

ويضمن أن:

```text
start >= available_from
start + duration <= available_to
```

لكن التحقق النهائي من Availability وtimezone داخل Production غير مثبت كـRPC أو Trigger في الكود المتاح. لا يجوز اعتبار الفلترة المحلية حماية نهائية ضد طلب API يدوي.

## 9. التغييرات المنفذة

### تم

- إصلاح قراءة PostgreSQL arrays للمراحل.
- دعم aliases للمراحل العربية والإنجليزية.
- إزالة فحص المرحلة غير الموجود في مسار GitHub الأصلي.
- إزالة إرسال `teaching_stage` الإضافي من حجز المعلم المحدد.
- إبقاء تحقق:
  - Supabase session.
  - role الطالب.
  - اكتمال الملف الشخصي.
  - الاشتراك والرصيد.
  - المادة الموجودة.
  - اعتماد المعلم.
  - ارتباط المادة بالمعلم.
  - الموعد المستقبلي.
  - التكرار المعروف.

### لم يتم

- تعديل Production.
- تعديل `booking_requests` schema.
- إضافة `teacher_id` إلى Production.
- تعديل RLS.
- تعديل RPC.
- إنشاء Booking مباشرة من الهاتف.
- استخدام Availability وهمية أو fallback.

## 10. التحقق المحلي

تم التحقق من:

- API typecheck: ناجح.
- API build: ناجح.
- Mobile typecheck: ناجح.
- `git diff --check`: ناجح قبل آخر تعديل التقرير، ويجب إعادة تشغيله ضمن التحقق النهائي.
- اختبار تطبيع المراحل:
  - `{ثانوي,قدرات}` → `الثانوية`, `قدرات`.
  - `high_school` → `الثانوية`.
  - `المرحلة الثانوية` → `الثانوية`.
- API أعيد تشغيله ويستمع على المنفذ 8080.

## 11. الاختبار من البداية للنهاية

لم يتم تسجيل الدخول بحساب طالب ومعلم حقيقيين، ولم يتم تنفيذ حجز حقيقي، لأن قواعد المهمة تمنع ذلك دون جلسة اختبار مصرح بها.

لذلك لا يمكن إعلان:

```text
Booking Created = SUCCESS
```

ولا يمكن إثبات ظهور السجل في Production من البيئة الحالية.

## 12. PRODUCTION BLOCKERS

### أ. ضمان أن حجز المعلم المحدد لا يظهر إلا للمعلم المختار

مخطط Production الأصلي لا يحتوي `teacher_id` في `booking_requests`. الإشعار يذهب للمعلم المحدد، لكن سياسة القراءة تعتمد على المادة والاعتماد والمرحلة، وليست على معرّف المعلم المستهدف.

ضمان هذا السلوك حرفياً يحتاج أحد الآتي في Production:

- حقل target teacher في `booking_requests`.
- أو جدول ربط خاص بالطلبات والمعلمين.
- أو RLS/RPC جديد يفرض المستهدف.

لم يتم تنفيذ ذلك لأن تعديل Production ممنوع.

### ب. ضمان ذرية قبول الطلب وإنشاء Booking

التنفيذ الحالي يستدعي RPC ثم ينشئ `bookings` REST منفصلة. ضمان عدم وجود حالة accepted بلا booking يحتاج RPC/transaction في Production.

### ج. اختبار E2E حقيقي

يحتاج جلسة طالب ومعلم حقيقيين، مع عدم تنفيذ الحجز إلا بعد موافقة اختبارية صريحة. لم يتم استخدام بيانات وهمية لتعويض ذلك.

## 13. النتيجة الحالية

السبب الذي كان يمنع إنشاء طلب الحجز في الصورة تمت إزالته من مسار الهاتف، وهو فحص مرحلة غير مطابق لمسار المنصة الأصلية.

المسار المتوقع الآن:

```text
Teacher
  -> Subject
  -> Real Availability
  -> Valid Day/Time
  -> POST /api/booking-requests
  -> booking_requests.status = open
  -> notification للمعلم
  -> قبول المعلم
  -> bookings
```

لكن نجاح الإدراج والقبول والظهور في Production لم يُعلن كنجاح نهائي، لأنه يتطلب جلسة حقيقية واختباراً مصرحاً دون تنفيذ بيانات وهمية.