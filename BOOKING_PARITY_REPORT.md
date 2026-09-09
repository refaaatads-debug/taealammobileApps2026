# BOOKING PARITY REPORT

**تاريخ التدقيق:** 2026-09-06  
**النطاق:** الحجز، طلبات الحجز، المجموعات، التوفر، الرصيد، القبول، الرفض، الانتهاء، الإلغاء، والإشعارات.  
**قاعدة المرحلة:** تدقيق وإصلاح داخل Mobile/API فقط، دون أي كتابة اختبارية أو حقيقية على Production.

## 1. Executive Summary

تمت مقارنة مواصفة المرحلة الخامسة مع:

- `attached_assets/Pasted--5-BOOKING-BOOKING-REQUESTS-ACCEPT-REJECT-CANCEL--17886_1788667980369.txt`
- `attached_assets/full-session-booking-finance-assignments-architecture_1788629894391.md`
- `attached_assets/platform-master-integrated-architecture_1788629894258.md`
- `attached_assets/student-dashboard-architecture_1788629894440.md`
- `attached_assets/teacher-dashboard-architecture_1788629894486.md`
- `artifacts/api-server/src/routes/learning.ts`
- `artifacts/ajyal-mobile/app/booking.tsx`
- `artifacts/ajyal-mobile/app/(tabs)/bookings.tsx`
- `artifacts/ajyal-mobile/app/find-teacher.tsx`
- `lib/api-spec/openapi.yaml`

النتيجة الأولية:

- مسار الطالب يستخدم API حقيقياً وSupabase Bearer، ولا يحتوي على بيانات حجز وهمية.
- الحالات الموثقة هي `open`, `accepted`, `rejected`, `cancelled`, `expired` للطلبات؛ و`pending`, `confirmed`, `completed`, `cancelled` للحجوزات.
- مسار قبول المعلم يستدعي RPCs الأصلية، لكنه ينفذ إنشاء `bookings` بعد RPC في طلبات منفصلة؛ الذرية ومنع السباق لا يثبتها كود Mobile/API.
- API الحالي يرفض إنشاء الطلب للمعلم، لكنه لا يفرض صراحة أن الدور `student`؛ هذا bypass مؤكد داخل API.
- API الحالي لا يتحقق من توفر المعلم وtimezone عند إنشاء الطلب، بينما الهاتف يطبق جزءاً محلياً فقط من الأيام والساعات.
- API يضيف فحص رصيد ثانياً عند قبول المعلم بحد ثابت قدره 15 دقيقة، بينما المصدر يترك خصم الدقائق لمسار إكمال الجلسة؛ هذا اختلاف مؤكد.
- التكرار والسباق بين طلبين أو قبولين يحتاجان Transaction/RPC/Constraint إنتاجية، ولذلك تصنف الأجزاء غير القابلة للإصلاح محلياً `BLOCKED`.

لا يعتبر هذا التقرير دليلاً على نجاح حجز أو قبول أو رفض في Production.

## 2. Booking Architecture

مصادر الحقيقة:

| المجال | المصدر |
|---|---|
| الطلب قبل قبول المعلم | `booking_requests` |
| الحجز النهائي | `bookings` |
| الجلسة الناتجة | `sessions` |
| الرصيد | `user_subscriptions.remaining_minutes` |
| التوفر | `available_days`, `available_from`, `available_to` في ملف المعلم |
| صلاحية الدور | Supabase Auth و`user_roles` |
| إشعارات الحجز | `notifications` وRealtime/Push |
| قبول/رفض المجموعة | `accept_booking_group`, `reject_booking_request` |
| قبول طلب فردي | `accept_booking_request` |

العلاقة الموثقة:

```text
طالب
  -> booking_requests
  -> انتظار قبول المعلم
  -> accept_booking_request / accept_booking_group
  -> bookings
  -> sessions
```

الـMobile لا ينبغي أن يعيد تنفيذ منطق RPC أو Trigger المالي محلياً. دوره إرسال المدخلات الصحيحة وعرض الحالة المؤكدة من المصدر.

## 3. Student Booking Flow

| الخطوة | Platform | API | Mobile | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| اختيار معلم معتمد | دليل المعلمين من `public_teacher_profiles.is_approved` | يتحقق من `public_teacher_profiles` | يأتي `teacherId` من شاشة دليل المعلمين | MATCHED | `directory.ts`, `booking.tsx` | منخفض | لا تغيير |
| اختيار مادة المعلم | `teacher_subjects` المرتبط بـ`subjects` | يتحقق من المادة ومعرف المعلم قبل الإدراج | يقرأ مواد المعلم ثم يتحقق API | MATCHED | `learning.ts:424-453`, `booking.tsx:156-202` | متوسط | لا تغيير |
| اختيار المرحلة | `teaching_stages`/`teaching_stage` | يتحقق من مرحلة الطالب مع مراحل المعلم | لا يقرر أهلية المرحلة محلياً | MATCHED | `learning.ts:455-460` | متوسط | لا تغيير |
| اختيار التاريخ والوقت | يجب احترام `available_days/from/to` وtimezone | لا تحقق توفر قبل INSERT | يرشح الأيام والساعات محلياً | PARTIAL | `booking.tsx:203-253`؛ لا تحقق مماثل في API | عالٍ: يمكن تجاوز UI بطلب API خارج التوفر | timezone غير مثبت؛ الإصلاح الكامل BLOCKED |
| اختيار المدة | من اشتراك فعال/قيمة المصدر المثبتة | يقبل `durationMinutes` من العقد | يقرأ أول مدة موجبة من الاشتراكات | PARTIAL | `booking.tsx:137-141`؛ الرصيد يجمع عدة اشتراكات | متوسط: قد لا تطابق المدة الاشتراك المستخدم | لا اختيار مالي بديل؛ يلزم عقد subscription محدد |
| فحص الرصيد | اشتراك فعال ورصيد محجوز | `getBookingSubscription` يحسب الاشتراكات والحجوزات والطلبات | يكرر الفحص للعرض قبل الإرسال | PARTIAL | `learning.ts:180-224`, `booking.ts:108-146` | عالٍ بسبب race بين القراءة وINSERT | إبقاء API مصدراً نهائياً؛ منع السباق يحتاج Production |
| إنشاء الطلب | INSERT إلى `booking_requests` | POST `/booking-requests` | `useCreateBookingRequest` | MATCHED | `openapi.yaml`, `booking.tsx:282-289` | متوسط | لا تغيير |
| حالة الطلب بعد الإنشاء | `open` | يرسل `status: open` و`expires_at` | يعرض الطلب بعد إعادة القراءة | MATCHED | `learning.ts:491-505` | متوسط | لا تغيير |
| إشعار المعلم | notification/Realtime/Push | يكتب notification ويرسل Push | يعيد تحميل الطلبات عبر API/Realtime | PARTIAL | `learning.ts:511-525` | متوسط: فشل الإشعار لا يفشل الطلب | يلزم إثبات إنتاجي للـRealtime؛ لا تعديل |

## 4. Booking Requests

الحقول التي يثبتها المصدر أو الكود الحالي:

- `id`
- `student_id`
- `subject_id`
- `scheduled_at`
- `duration_minutes`
- `status`
- `expires_at`
- `group_id`
- `accepted_by`
- `teaching_stage`

الحالات المسموح بها حسب المصدر:

```text
open
accepted
rejected
cancelled
expired
```

الملاحظات:

- الطلبات لا تستخدم `teacher_id` كحقل إدراج في المسار الحالي؛ يتم التحقق من المعلم المختار ثم إرسال إشعار له.
- API ينشئ `group_id` جديداً لكل طلب مفرد. لا يوجد في Mobile/API مسار مثبت لإنشاء مجموعة متعددة الطلبات في عملية واحدة.
- `expires_at` مضبوط حالياً إلى ساعة من وقت إنشاء الطلب، لكن لا يوجد في API المحلي scheduler لتغيير `open` إلى `expired`; العرض يستنتج الانتهاء من الوقت.
- طلبات الطالب تُقرأ بـ`status=neq.rejected`، ثم تُحوّل الطلبات المفتوحة المنتهية إلى `expired` أثناء mapping.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| منع الطلب المنتهي | الطلب المنتهي لا يقبل قراراً | يفحص أقرب `expires_at` قبل القرار | لا يعرض زر القرار للطالب | MATCHED | `learning.ts:577-584`, `bookings.tsx:186` | متوسط | لا تغيير |
| منع duplicate request | المصدر يحتاج حماية من التكرار والسباق | فحص قراءة قبل INSERT فقط | لا يرسل الطلب عند نجاح mutation فقط | PARTIAL | `learning.ts:464-476` | عالٍ: قراءتان متزامنتان قد تنشئان طلبين | BLOCKED — يحتاج Transaction/Constraint/RPC إنتاجية |
| Group request | قبول المجموعة كقرار واحد | يدعم `groupId` عند القرار، لكن إنشاء المجموعة غير متاح كمسار مستقل | يجمع الصفوف المتشابهة في بطاقة واحدة | PARTIAL | `bookings.tsx:46-56`, `learning.ts:568-577` | عالٍ: المجموعة قد لا تكون ذرية | توثيق النقص؛ الذرية BLOCKED |
| حالات الطلب | الحالات الخمس فقط | mapping يسمح بالحالات الخمس ويستنتج expired | labels للحالات الخمس | MATCHED | `learning.ts:256-273`, `bookings.tsx:178` | منخفض | لا تغيير |

## 5. Group Requests

المصدر يقرر المجموعة كقرار واحد:

- قبول المجموعة عبر `accept_booking_group(_group_id, _teacher_id)`.
- الرفض عبر `reject_booking_request` مع قائمة request IDs.
- إشعار واحد للمجموعة بعد نجاح القبول.
- إنشاء Booking لكل صف مقبول حسب نتيجة المصدر.

الحالة الحالية:

- Mobile يجمع الطلبات حسب `groupId` ويعرضها كبطاقة واحدة للمعلم.
- القرار يرسل `id` للصف الأول مع `groupId`.
- API يجلب الصفوف المفتوحة للمجموعة ويستخدم RPC المجموعة.
- API ينشئ `bookings` لاحقاً بعملية POST منفصلة لكل المجموعة.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| عرض المجموعة كطلب واحد | قرار واحد للمجموعة | يعيد صفوف المجموعة | بطاقة واحدة مع عدد الحصص | MATCHED | `bookings.tsx:46-56`, `learning.ts:568-577` | متوسط | لا تغيير |
| قبول المجموعة ذرياً | RPC/Transaction أصلية | RPC ثم إنشاء bookings منفصل | زر واحد | PARTIAL | `learning.ts:617-693` | حرج: accepted بلا booking كامل أو إنشاء جزئي | BLOCKED — يحتاج Production transaction/RPC |
| رفض المجموعة | RPC مع IDs المجموعة | يمرر كل IDs | زر رفض واحد | MATCHED | `learning.ts:735-743` | متوسط | لا تغيير |
| إشعار المجموعة | إشعار واحد | يبني إشعاراً واحداً بعد الإنشاء | يعيد تحميل الطلبات | PARTIAL | `learning.ts:700-721` | متوسط | لا تعديل قبل إثبات قواعد notification الإنتاجية |

## 6. Availability

المصدر يذكر:

- `available_days`
- `available_from`
- `available_to`
- timezone
- وقت البداية والنهاية
- مدة الجلسة
- التاريخ المختار

الحالة الحالية:

- دليل المعلمين يرسل الأيام والساعات إلى شاشة الحجز.
- الهاتف يرشح الأسبوع الحالي والأيام المعلنة فقط.
- الهاتف ينشئ فترات ساعة كاملة.
- الهاتف يمنع العرض عند غياب الأيام أو الساعات.
- API لا يجلب أو يتحقق من `available_days/from/to` داخل POST `/booking-requests`.
- timezone غير مثبتة في العقد الحالي؛ لا يجوز افتراض UTC أو توقيت الرياض.
- مدة أطول من ساعة قد تسمح بموعد يبدأ قبل نهاية التوفر وينتهي بعدها، لأن `timeOptions` لا يرشح وفق `durationMinutes`.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| يوم متاح | مصدر المعلم | غير متحقق قبل الإدراج | متحقق محلياً | PARTIAL | `booking.tsx:215-226` | عالٍ عند تجاوز API مباشرة | timezone/تحقق خادم غير مثبت؛ BLOCKED |
| ساعات التوفر | مصدر المعلم | غير متحقق | متحقق جزئياً | PARTIAL | `booking.tsx:227-239` | عالٍ | يحتاج عقد timezone ودقائق الجدول |
| عدم إنشاء وقت افتراضي | لا وقت اصطناعي | يقبل وقت الطلب | fallback بصري `17`، لكن `canSubmit` يمنع الإرسال عند غياب الخيارات | PARTIAL | `booking.tsx:240-263` | متوسط | إزالة fallback البصري أو إبقاءه غير قابل للإرسال؛ إصلاح Mobile مؤكد |
| نهاية التوفر مع مدة الجلسة | النهاية يجب أن تشمل مدة الجلسة | غير متحقق | لا يتحقق `hour + duration <= end` | MISMATCH | `booking.tsx:227-239` | عالٍ | تعديل حساب time options في Mobile |
| timezone | مصدر محفوظ/موحد إن كان موجوداً | غير موجود في العقد | يعتمد ضمنياً على جهاز الطالب عند `toISOString()` | UNVERIFIED | لا يوجد حقل timezone في العقد المقروء | حرج | BLOCKED — REQUIRES PRODUCTION CONTRACT |
| الوقت الماضي | يمنع وقتاً ماضياً | يتحقق `startsAt <= now` | يرفع بداية اليوم إلى الساعة التالية | MATCHED | `learning.ts:411-413`, `booking.tsx:231-238` | منخفض | لا تغيير |

## 7. Subscription Selection

- API يجمع كل الاشتراكات الفعالة ذات `remaining_minutes > 0` والانتهاء غير المتجاوز.
- عند إنشاء الطلب، يرسل `durationMinutes` فقط ولا يرسل `subscription_id`.
- عند قبول المعلم، يختار API أول اشتراك مؤهل لإرفاق `subscription_id`.
- Mobile يختار أول مدة موجبة من الصفوف المرتبة، بينما الرصيد يجمع عدة اشتراكات.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| جمع الرصيد من عدة اشتراكات | كل الاشتراكات الفعالة | `reduce` في `getBookingSubscription` | `reduce` في شاشة الحجز | MATCHED | `learning.ts:207-223`, `booking.tsx:137-146` | متوسط | لا تغيير |
| ربط الحجز باشتراك محدد | الحجز يحتوي `subscription_id` عند التثبيت | يختار أول صف بعد القبول | لا يرسل معرف الاشتراك | PARTIAL | `learning.ts:650-689`, `BookingRequestInput` | عالٍ عند وجود عدة اشتراكات بمدد مختلفة | يلزم عقد مصدر يحدد اختيار الاشتراك؛ لا نخترع اختياراً محلياً |
| خصم الدقائق عند الطلب/القبول | الخصم عند إكمال الجلسة عبر Trigger | لا يخصم أثناء إنشاء الطلب، لكنه يفحص 15 دقيقة عند القبول | لا يخصم | MISMATCH | `learning.ts:591-603`, `session-billing-parity.md` | عالٍ: قبول قد يفشل بمنطق مالي إضافي | إزالة فحص 15 دقيقة الثابت من API |

## 8. Balance Validation

`getBookingSubscription` يحسب:

```text
رصيد الاشتراكات الفعالة
- حجوزات pending/confirmed المستقبلية
- طلبات open/accepted المستقبلية غير المطابقة لحجز
>= مدة الطلب
```

هذا الفحص مفيد كحاجز API، لكنه قراءة ثم INSERT منفصلان. لا يكفي لمنع السباق بين جهازين أو طلبين متزامنين.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| اشتراك فعال | `is_active`, remaining, ends_at | يتحقق | يتحقق للعرض | MATCHED | `learning.ts:184-190`, `booking.tsx:109-116` | منخفض | لا تغيير |
| احتساب الحجوزات المحجوزة | الحجوزات والطلبات تدخل في capacity | يطابق accepted request مع booking | يعيد نفس الحساب تقريباً | MATCHED | `learning.ts:150-177`, `booking.tsx:29-50` | متوسط | لا تغيير |
| منع double reservation | Transaction/RPC/Trigger إنتاجية | preflight read فقط | preflight read فقط | BLOCKED | لا يوجد قفل أو constraint محلي | حرج | BLOCKED — REQUIRES PRODUCTION CHANGE |
| قبول المعلم مع رصيد أقل من 15 دقيقة | المصدر لا يثبت فحص 15 دقيقة عند القبول؛ الخصم لاحقاً | يرفض بحد hard-coded 15 | لا يقرر القبول | MISMATCH | `learning.ts:591-603` | عالٍ | إزالة الفحص من API |

## 9. Conflict Detection

المنصة تحتاج منع:

- تعارض الطالب.
- تعارض المعلم.
- الحجوزات المؤكدة أو المعلقة المتداخلة.
- الطلبات المفتوحة المتداخلة.
- القبول المتزامن من معلمين.

الحالة الحالية:

- إنشاء الطلب يفحص تكراراً مطابقاً للطالب/المادة/الوقت/المدة، لكنه لا يفحص تعارض وقت عام للطالب أو المعلم.
- قبول المعلم يفحص bookings للمعلم ضمن نافذة ±24 ساعة.
- فحص القبول لا يثبت أنه جزء من نفس Transaction مع RPC وإنشاء bookings.
- الطلبات المفتوحة لا تدخل في `hasTeacherBookingConflict`.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| تعارض Booking للمعلم | يمنع التداخل | يفحص pending/confirmed | لا يقرر | PARTIAL | `learning.ts:288-305` | سباق أو طلبات غير ممثلة | يلزم حماية Production |
| تعارض الطالب | يجب منعه | لا يوجد فحص overlap عام قبل INSERT | يخصم الحجز من الرصيد فقط | MISMATCH | `learning.ts:464-488` | طالب قد ينشئ موعداً متداخلاً مع موعد آخر | يحتاج Transaction/constraint أو RPC؛ BLOCKED |
| تعارض الطلبات المفتوحة | يجب دخوله في القرار حسب المصدر | لا يفحصه في `hasTeacherBookingConflict` | يعرض الخيارات محلياً فقط | PARTIAL | `learning.ts:288-305` | قبول طلبين متداخلين | BLOCKED إذا كان الحل ذرياً إنتاجياً |
| قبولان متزامنان | واحد فقط ينجح | RPC قد يمنع القبول، لكن إنشاء booking منفصل | mutation واحدة من UI لكن قد يعاد الضغط | PARTIAL | `learning.ts:619-647` | accepted بدون booking أو duplicate booking | يحتاج تحقق إنتاجي |

## 10. Accept Individual

- الصلاحية في API: teacher role + Bearer.
- الطلب الحالي يجب أن يكون `open`، وأن يكون غير منتهٍ، وأن يكون مقبولاً لهذا المعلم أو غير مملوك لمعلم آخر.
- API يستدعي `accept_booking_request`.
- بعد RPC يبحث عن اشتراك، ويفحص تعارض المعلم، ثم ينشئ booking يدوياً إن لم يجد مطابقاً.
- يرسل إشعاراً للطالب ورسالة chat ابتدائية بعد الإنشاء.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| teacher-only | المعلم المعتمد فقط | تحقق teacher role | UI يظهر القرار للمعلم فقط | MATCHED | `learning.ts:542-545`, `bookings.tsx:142` | متوسط | لا تغيير |
| teacher_id ownership | المعلم المحدد/المخول عبر المصدر | يفحص `accepted_by` أو null | لا يرسل teacher id مستقلاً في القرار | MATCHED | `learning.ts:547-560` | منخفض | لا تغيير |
| تحقق expiry | يمنع القرار بعد expiry | يفحص أقرب expiry | لا يعرض زر الطلب غير open | MATCHED | `learning.ts:578-584` | منخفض | لا تغيير |
| RPC acceptance | RPC موجود | يستخدم `accept_booking_request` | يستخدم API | MATCHED | `learning.ts:635-643` | متوسط | لا تغيير |
| إنشاء booking ذرياً | المصدر يتطلب عدم بقاء accepted بلا booking | RPC ثم POST منفصل | ينتظر API | PARTIAL | `learning.ts:675-694` | حرج | BLOCKED — REQUIRES PRODUCTION TRANSACTION/RPC |
| balance gate عند القبول | الخصم ليس عند القبول | حد ثابت 15 دقيقة | غير ظاهر | MISMATCH | `learning.ts:591-603` | عالٍ | إزالة gate المحلي |
| double acceptance | حماية المصدر/RPC | preflight ثم RPC ثم inserts منفصلة | زر disabled أثناء mutation | PARTIAL | `bookings.tsx:186`, `learning.ts:617-693` | حرج | Production verification required |

## 11. Accept Group

- Mobile يعرض المجموعة كبطاقة واحدة.
- API يستدعي `accept_booking_group`.
- API يقرأ الصفوف المقبولة، ثم يقارن الحجوزات الحالية، ثم ينشئ المفقود منها.
- إشعار الطالب واحد، ورسالة chat تستخدم أول booking فقط.

القبول الجماعي في واجهة التطبيق مطابق كقرار، لكنه ليس مثبتاً كعملية ذرية من حدود Mobile/API. أي إصلاح كامل يحتاج تعديل Production، وهو خارج النطاق.

## 12. Reject

- API يسمح بالرفض للمعلم فقط.
- الرفض يستخدم `reject_booking_request` مع request IDs المجموعة.
- لا يخصم الرصيد.
- لا يضيف سبب رفض لأن عقد المنصة المتاح لا يثبت حقلاً لذلك.
- لا يوجد في API أو Mobile مسار لإعادة إنشاء الطلب تلقائياً.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| صلاحية الرفض | teacher-only | teacher-only | زر المعلم | MATCHED | route decision | منخفض | لا تغيير |
| الحالة الناتجة | `rejected` | RPC الأصلية | يعرض label | MATCHED | `learning.ts:735-743`, `bookings.tsx:178` | منخفض | لا تغيير |
| إشعار الطالب | مطلوب حسب المصدر | notification + Push بعد نجاح RPC | يعيد القراءة فقط | MATCHED | مسار الرفض يرسل إشعاراً بعد نجاح RPC | منخفض | لا تغيير |
| إعادة الطلب | غير مثبت | لا يعيد الطلب | لا يعيد الطلب | UNVERIFIED | لا contract واضح | متوسط | لا تغيير |

## 13. Expiration

- المصدر يثبت حالة `expired` ضمن حالات الطلب.
- API يمنع القرار إذا كان `expires_at` منتهياً.
- `mapRemoteBookingRequest` يستنتج `expired` بصرياً عندما يكون `status=open` والوقت منتهياً.
- لا ينفذ API `auto_expire_stale_bookings` ولا يكتب الحالة المنتهية.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| منع قبول الطلب المنتهي | نعم | نعم قبل RPC | لا زر open بعد mapping | MATCHED | `learning.ts:578-584`, `mapRemoteBookingRequest` | منخفض | لا تغيير |
| تحديث الحالة في Production | RPC/scheduler أصلي | غير مستدعٍ | قراءة استنتاجية | UNVERIFIED | `auto_expire_stale_bookings` موثق لكن غير مربوط في API | متوسط | لا تعديل Production |

## 14. Student Cancellation

- الطالب يستطيع إلغاء booking يملكه عبر `/sessions/:id/cancel`.
- API يتحقق من الملكية، ثم يمنع cancelled/completed.
- يكتب `status=cancelled` و`session_status=cancelled`.
- يرسل إشعاراً للمعلم.
- Mobile يعرض تأكيداً ثم ينفذ mutation.
- لا يطلب سبباً من الطالب.
- لا يثبت API نافذة زمنية مسموحة للإلغاء.
- لا يضيف refund أو restore minutes.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| ملكية الطالب | الطالب يملك الحجز | `student_id` أو `teacher_id` | يعرض زر الإلغاء للموعد القادم | MATCHED | `learning.ts:1157-1165`, `bookings.tsx:100-109` | منخفض | لا تغيير |
| منع إلغاء completed | ممنوع | مرفوض 409 | لا يظهر الزر للجلسة المغلقة | MATCHED | `learning.ts:1167-1174` | منخفض | لا تغيير |
| وقت الإلغاء | سياسة المنصة يجب احترامها | لا فحص زمني مستقل | لا فحص زمني مستقل | PARTIAL | route لا يفحص scheduled_at أو window | عالٍ | السياسة الدقيقة غير مثبتة؛ لا تخمن |
| أثر الرصيد/refund | لا يخترع من العميل | لا refund | لا refund | UNVERIFIED | لا trigger موثق كاسترداد | عالٍ | إبقاءه غير منفذ |
| إشعار المعلم | مطلوب | notification + Push | لا يكتب مباشرة | MATCHED | `learning.ts:1212-1230` | متوسط | لا تغيير |

## 15. Teacher Cancellation

- المعلم يحتاج سبباً غير فارغ في API.
- Mobile يفرض 10 أحرف على الأقل.
- API يكتب cancellation metadata:
  - `cancelled_at`
  - `cancelled_by`
  - `cancellation_reason`
- API يرسل إشعار الطالب.
- API يستدعي `teacher_monthly_cancellations`.
- بعد تجاوز 3 يرسل إشعاراً للإدارة.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| سبب إلزامي للمعلم | نعم | نعم | نعم، 10 أحرف | MATCHED | `learning.ts:1176-1188`, `bookings.tsx:111-119` | منخفض | لا تغيير |
| metadata | مطلوبة | محفوظة | لا يقرر الحقول | MATCHED | `learning.ts:1181-1188` | متوسط | لا تغيير |
| عداد شهري | RPC/حد إنتاجي | يستدعي RPC ويبلغ بعد >3 | غير ظاهر | MATCHED | `learning.ts:1234-1258` | متوسط | تحقق إنتاجي فقط |
| أثر الحصة/الرصيد | لا refund بالتخمين | يغير booking/session status فقط | لا يغير الرصيد | UNVERIFIED | لا مصدر استرداد مثبت | عالٍ | لا تغيير |
| نافذة الإلغاء | حسب سياسة المنصة | غير مثبت في route | غير مثبت في UI | UNVERIFIED | لا عقد واضح | عالٍ | لا تخمين |

## 16. Notifications

| الحدث | المتوقع | الحالي | STATUS |
|---|---|---|---|
| إنشاء الطلب | إشعار المعلم | notification + Push بعد INSERT | MATCHED |
| قبول فردي/مجموعة | إشعار الطالب | إشعار واحد بعد إنشاء bookings | PARTIAL |
| رفض الطلب | إشعار الطالب | notification + Push بعد RPC | MATCHED |
| إلغاء الطالب | إشعار المعلم | notification + Push | MATCHED |
| إلغاء المعلم | إشعار الطالب | notification + Push | MATCHED |
| تجاوز إلغاءات المعلم | إشعار الإدارة | RPC count ثم notifications | MATCHED |

فشل الإشعار في عدة مسارات لا يعيد العملية؛ هذا مقبول فقط إذا كان booking/request state قد تأكد، لكنه يحتاج تحققاً إنتاجياً من RLS/Realtime.

## 17. API Comparison

العقود المحلية:

- `POST /booking-requests`
- `GET /booking-requests?view=mine|incoming`
- `PATCH /booking-requests/:id/decision`
- `GET /sessions`
- `PATCH /sessions/:id/cancel`

الملاحظات:

- لا يوجد endpoint مستقل لإلغاء `booking_request` قبل القبول؛ الموجود إلغاء booking/session.
- لا يوجد endpoint group creation.
- API يستخدم Supabase Bearer في المسارات الخاصة بالحجز.
- `GET /booking-requests?view=mine` لا يفرض صراحة student role؛ يعتمد على `student_id` في query.
- `POST /booking-requests` يرفض teacher role لكنه لا يطلب student role صراحة.
- لا يوجد عقد timezone أو availability snapshot في `BookingRequestInput`.
- لا يوجد OpenAPI تعديل مطلوب في التقرير الحالي قبل الإصلاح؛ الإصلاحات المحدودة لا تغير الشكل العام للعقد.

## 18. Mobile Comparison

الحالي:

- `booking.tsx` يقرأ المعلم من params ويعيد قراءة المواد من Supabase.
- `booking.tsx` يقرأ الاشتراكات والحجوزات والطلبات لتقدير الرصيد.
- التوفر المحلي يمنع الأيام والساعات غير المعلنة.
- `bookings.tsx` يستخدم API للطلبات والقرارات والجلسات.
- teacher يرى group requests كبطاقة واحدة.
- student يرى الطلبات الخاصة به.
- الإلغاء يمر عبر `cancelSession`.
- لا توجد بيانات محلية للحجز أو fallback عند فشل المصدر.

الفجوات المؤكدة:

- fallback بصري للساعة 17 موجود رغم غياب availability.
- لا فحص نهاية availability مع مدة الجلسة.
- API decision وcreate paths غير مترابطين ذرياً من منظور العميل.
- لا تمييز Mobile بين رفض الطلب ورفض الإشعار، لكن الحالة الأساسية تظهر بعد refetch.

## 19. MATCHED

- حالات `booking_requests` و`bookings` الأساسية مطابقة للمصدر.
- إنشاء الطلب عبر API حقيقي وSupabase.
- التحقق من الملف الشخصي قبل إنشاء الطلب.
- التحقق من المادة والمعلم المعتمد ومرحلة الطالب.
- عدم السماح بوقت ماضٍ.
- فحص الاشتراك الفعال والرصيد قبل إنشاء الطلب.
- دعم accept الفردي وgroup عبر RPCs الموجودة.
- teacher-only decision في المسار الحالي.
- منع قبول الطلب المنتهي.
- إلغاء الطالب/المعلم حسب الملكية.
- سبب إلغاء المعلم وmetadata والعداد الشهري.
- إشعارات إنشاء الطلب والإلغاء.
- عدم تنفيذ خصم الدقائق من Mobile.

## 20. PARTIAL

- التوفر محلي فقط ولا يوجد تحقق خادم مثبت.
- مدة الجلسة مع تعدد الاشتراكات.
- منع التعارض يعتمد على preflight reads.
- قبول المجموعة ينفذ RPC ثم inserts منفصلة.
- إشعار القبول لا يثبت ذريعة المصدر الذرية.
- نافذة إلغاء الطالب/المعلم غير موحدة في API/Mobile.
- `GET mine` لا يفرض role صراحة.

## 21. MISMATCH

1. `POST /booking-requests` يرفض المعلم فقط ولا يفرض student role إيجابياً.
2. قبول المعلم يضيف فحصاً مالياً ثابتاً `remaining_minutes >= 15` غير مثبت كجزء من قرار القبول.
3. API لا يفرض availability قبل إنشاء الطلب، بينما المصدر يتطلب احترامها.
4. Mobile يسمح بخيار يبدأ قبل نهاية توفر المعلم عند مدة أطول من ساعة.

## 22. UNVERIFIED

- timezone الحقيقي لكل معلم/طالب وطريقة تحويل `starts_at`.
- سياسة نافذة إلغاء الطالب.
- سياسة نافذة إلغاء المعلم.
- refund أو restore minutes عند الإلغاء.
- وجود Trigger يضمن إنشاء `sessions` لكل booking.
- idempotency الإنتاجية الكاملة لقبول فردي/مجموعة.
- سلوك notification/Realtime النهائي بعد فشل Push.
- إعادة إنشاء طلب بعد الرفض.
- تفاصيل مصدر group creation متعدد الصفوف.

## 23. BLOCKED

- منع duplicate requests بشكل ذري.
- منع حجوزتين متداخلتين في race condition.
- ضمان accept + booking + session في Transaction واحدة.
- فرض availability بخادم لا يملك عقد timezone مثبتاً.
- إضافة constraint أو RPC أو Trigger لحماية lifecycle.
- إصلاح سجلات Production التي قد تحتوي accepted request بلا booking.

السبب في كل ما سبق: الحل الموثوق يحتاج تغييراً أو تحققاً في Production Database/RPC/Trigger/RLS، وهو ممنوع في هذه المرحلة.

## 24. Files Changed

تم إنشاء هذا التقرير قبل تعديل الكود، ثم طبقت الإصلاحات المحلية المسموح بها فقط:

- `artifacts/api-server/src/routes/learning.ts`
  - فرض `student` role صراحة في إنشاء الطلبات وقراءة طلبات الطالب.
  - إزالة فحص القبول المالي الثابت غير المثبت عند 15 دقيقة.
  - جعل اختيار الاشتراك عند إنشاء booking يعتمد على `remaining_minutes > 0` بدلاً من حد 15.
  - إرسال إشعار داخل التطبيق وPush للطالب بعد رفض الطلب بنجاح.
- `artifacts/ajyal-mobile/app/booking.tsx`
  - إزالة fallback الساعة الاصطناعي القابل للالتباس.
  - حساب بداية ونهاية الفترات بالدقائق.
  - منع خانة البدء إذا كانت مدة الجلسة تتجاوز نهاية توفر المعلم.

لم تتغير Production أو Database أو عقود OpenAPI أو أي RPC/Function/Trigger/RLS.

## 25. Tests

تم تنفيذها بعد الإصلاح المحلي فقط، دون كتابة Production:

- Mobile TypeScript.
- API TypeScript.
- API build.
- Expo startup.
- Android bundle.
- iOS bundle.
- OpenAPI generation فقط إذا تغير العقد.
- `git diff --check`.
- `GET /api/healthz`.
- Unauthorized booking API.
- teacher-only operations مع طالب غير مصرح.
- student-only operations مع معلم.
- بحث Mock/fallback/hard-coded duration.
- مراجعة workflow logs.

نتائج التحقق:

- API TypeScript: PASS
- Mobile TypeScript: PASS
- API build: PASS
- Expo Android bundle: PASS
- Expo iOS bundle: PASS
- Expo manifests/assets: PASS
- `git diff --check`: PASS
- `/api/healthz`: HTTP 200
- POST `/api/booking-requests` بدون Authorization: HTTP 401
- API workflow: RUNNING على المنفذ 8080
- Expo workflow: RUNNING وMetro جاهز
- Expo preview screenshot: PASS؛ شاشة الدخول ظهرت دون crash
- تحذير Expo الوحيد: DevTools يحتاج `libglib-2.0.so.0` في بيئة Nix؛ Metro والحزم اكتملت بنجاح

## 26. Remaining Risks

- القراءة ثم الكتابة المنفصلة لا تمنع السباقات المالية أو الزمنية.
- قبول RPC ثم إنشاء bookings يدوياً قد يترك حالة جزئية إذا فشل الطلب الثاني.
- عدم ثبوت timezone قد يجعل تحويل يوم/ساعة الطالب مختلفاً عن توقيت المعلم.
- التحقق المحلي في Mobile لا يحمي API من طلبات مصطنعة.

## 27. Production Verification Needed

يجب التحقق لاحقاً بحسابات حقيقية وبدون تعديل المصدر:

- إنشاء طلب ثم ظهوره للمعلم المناسب فقط.
- ظهور group request كقرار واحد.
- accept group ينتج booking لكل صف مرة واحدة.
- قبولان متزامنان لا ينتجان duplicate bookings.
- رفض المجموعة يغيّر كل الصفوف المطلوبة ويرسل الإشعار.
- قبول طلب منتهي يفشل.
- booking خارج availability يفشل من الخادم.
- cancellation windows وmonthly limits.
- Trigger إنشاء session بعد booking.
- عدم خصم الدقائق قبل إكمال الجلسة.

## 28. Next Step

بعد تطبيق الإصلاحات المحلية والتحقق منها، تتوقف المرحلة. لا تبدأ الجلسات أو المكالمات أو الخصم أو المحفظة أو السحب أو الواجبات.

Database changed: NO
Schema changed: NO
RLS changed: NO
RPC changed: NO
Functions changed: NO
Triggers changed: NO
Auth changed: NO
VPS changed: NO
Main platform code changed: NO
Production writes: NO
Real booking executed: NO
Financial operation executed: NO