# BOOKING E2E FINAL PARITY AUDIT

**تاريخ التدقيق:** 2026-09-06  
**نطاق التدقيق:** منصة الويب الأصلية، Mobile Expo، API، OpenAPI/generated clients، Supabase schema/RPC/RLS المتاح محلياً، ومسار الإشعارات.  
**قاعدة السلامة:** لم يتم تعديل Production Database أو Schema أو RLS أو RPC أو Functions أو Triggers أو Auth أو VPS.  
**النتيجة الحالية:** `CODE VERIFIED` لبعض الإصلاحات المحلية، و`E2E PRODUCTION UNVERIFIED` للنظام الكامل.

## A. PLATFORM SOURCE OF TRUTH

المصدر الأساسي هو كود منصة الويب الأصلية الموجود في مساحة العمل ضمن:

```text
.local/conversation-workspace/files/taealam_build/
```

المراجع الأساسية:

```text
src/pages/Booking.tsx
src/components/teacher/BookingRequests.tsx
supabase/migrations/
```

مصدر البيانات التشغيلي هو Supabase Production، لكن هذه الجولة لم تنفذ أي write عليه.

### ما يثبته المصدر الأصلي

- شاشة الويب تنشئ `booking_requests` أولاً.
- شاشة المعلم تقرأ الطلبات المفتوحة، وتجمع الصفوف ذات `group_id`.
- القبول يمر عبر:

```text
accept_booking_request
accept_booking_group
```

- بعد القبول ينشئ كود المعلم صفوف `bookings`.
- الهاتف لا يجب أن ينشئ `bookings` مباشرة.

### الحالة

`MATCHED` بالنسبة لترتيب التدفق العام، و`UNVERIFIED` بالنسبة لاختبار Production الحقيقي.

## B. SPECIFIC TEACHER BOOKING

### Platform flow

```text
Student
  -> يفتح Booking مع teacher query parameter
  -> يختار Subject مرتبطاً بالمعلم
  -> يختار Day/Time من بيانات المعلم المنشورة
  -> يرسل الطلب
  -> INSERT booking_requests
  -> إشعار للمعلم المحدد
Teacher
  -> يرى الطلب
  -> يستدعي accept_booking_request أو accept_booking_group
  -> ينشئ booking بعد قبول RPC
```

### المصدر الحقيقي لكل خطوة

| الخطوة | المصدر | النتيجة |
|---|---|---|
| هوية المعلم | `public_teacher_profiles.user_id` | `MATCHED` |
| مواد المعلم | `teacher_subjects -> subjects` | `MATCHED` |
| أيام المعلم | `public_teacher_profiles.available_days` | `MATCHED` |
| ساعات المعلم | `available_from`, `available_to` | `MATCHED` |
| المدة | `user_subscriptions.session_duration_minutes` | `MATCHED` |
| الطلب | `booking_requests` | `MATCHED` |
| إشعار المعلم | `notifications`، ومعه push عند توفره | `PARTIAL` |
| قبول المعلم | RPC | `MATCHED` |
| إنشاء `bookings` | server/teacher acceptance flow | `PARTIAL` |

### هل يوجد `teacher_id` في `booking_requests`؟

لا يوجد دليل على وجود `teacher_id` مستهدف في مخطط `booking_requests` الذي تمت مراجعته.

الحقل الموجود هو:

```text
accepted_by
```

وهو يحدد المعلم الذي قبل الطلب بعد القبول، وليس المعلم المقصود عند الإنشاء.

### كيف تميز المنصة الطلب المحدد؟

المسار الأصلي يعتمد على:

1. إرسال إشعار الإنشاء إلى المعلم المحدد.
2. تحقق المعلم من علاقته بالمادة عند قراءة الطلب.
3. عدم وجود target field في سجل الطلب نفسه.

هذا لا يثبت target-only visibility على مستوى RLS. لذلك:

```text
Direct teacher notification = MATCHED
Strict selected-teacher isolation = BLOCKED
```

### Mobile/API الحالية

الهاتف يمرر:

```text
teacherId
teacherName
teacherAvailableDays
teacherAvailableFrom
teacherAvailableTo
```

والـAPI يتحقق من:

- الطالب المصادق.
- اكتمال الملف.
- الاشتراك والرصيد.
- وجود المادة.
- المعلم المعتمد.
- علاقة المعلم بالمادة.
- عدم وجود طلب/حجز مكرر.

تم حذف فحص `teaching_stage` الإضافي الذي لم يكن موجوداً في direct flow الأصلي.

### الحالة

`PARTIAL`: الإنشاء والإشعار متوافقان، لكن target-only لا يمكن إثباته من المخطط الحالي.

## C. OPEN TEACHER BOOKING

### Platform flow

المصدر الأصلي يدعم مساراً بدون معلم محدد:

```text
Student
  -> لا يختار Teacher
  -> يختار Subject
  -> يحدد الموعد
  -> INSERT booking_requests بدون teacher_id
  -> إشعارات للمعلمين المرتبطين بالمادة
  -> أول Teacher يقبل
  -> accepted_by يصبح الفائز
  -> إنشاء bookings للفائز
```

### شروط الأهلية المثبتة من الكود

المثبت في مسار الإشعار المفتوح:

- وجود علاقة `teacher_subjects` بالمادة.
- كون ملف المعلم معتمداً `is_approved = true`.
- امتلاك المعلم حساباً يمكن إرسال notification إليه.

### شروط غير مثبتة كشرط فتح للطلب

لم يثبت أن المنصة الأصلية تستخدم في broadcast نفسه:

- `teaching_stage` كحقل مطلوب في request.
- timezone خاص بالمعلم.
- availability server-side قبل إدراج الطلب.
- ban/account status إضافي غير شرط الاعتماد.

الويب الأصلي يحتوي fallback لساعات في واجهة الحجز المفتوح، لكن قاعدة التدقيق الحالية تمنع نقل هذا fallback إلى الهاتف.

### Mobile/API الحالية

تم تنفيذ الآتي محلياً:

- `teacherId` اختياري في OpenAPI.
- الهاتف يجلب المعلمين من `/api/teachers`.
- الهاتف يعرض مواد المعلمين.
- الهاتف يجمع Availability المنشورة للمعلمين المطابقين للمادة.
- الهاتف لا يخترع الأيام أو الساعات.
- API ينشئ request بدون `teacher_id` عند غياب `teacherId`.
- API يرسل notifications إلى المعلمين المعتمدين المرتبطين بالمادة.

لكن API لا يعيد فحص كل Availability للمعلمين قبل broadcast. لذلك:

```text
Open booking UI availability filtering = MATCHED/PARTIAL
Open booking server-side availability eligibility = UNVERIFIED
```

### الحالة

`PARTIAL`.

الوظيفة موجودة في Mobile/API، لكن لا يمكن إعلان تطابق 100% قبل إثبات عقد Availability/timezone server-side واختبار معلمين حقيقيين.

## D. AVAILABILITY SOURCE

### الجدول والأعمدة

المصدر هو:

```text
public_teacher_profiles
```

والأعمدة:

```text
available_days
available_from
available_to
```

المواد تأتي من:

```text
teacher_subjects
subjects
```

### Format الأيام

كود الهاتف الحالي يقبل:

- JSON arrays.
- PostgreSQL arrays.
- comma-separated strings.
- الفاصلة العربية.
- `;` و`|`.
- أسماء الأيام العربية والإنجليزية.
- أسماء الأيام المختصرة.
- day-of-week numeric tokens.

### تحويل اليوم

`dayIsAvailable` يقارن aliases محلية لليوم:

```text
Sunday ... Saturday
الأحد ... السبت
short names
numeric day
```

### حساب from/to

`parseClock` يقبل:

```text
HH
HH:MM
```

ويحولها إلى دقائق من بداية اليوم.

المدة تؤخذ من:

```text
user_subscriptions.session_duration_minutes
```

ولا يسمح الهاتف بساعة تنتهي بعد `available_to`.

### Platform vs API vs Mobile

| نقطة المقارنة | Platform | API | Mobile | Status |
|---|---|---|---|---|
| الجدول | `public_teacher_profiles` | نفس الجدول | عبر API أو Supabase direct للمعلم المحدد | `MATCHED` |
| الأيام | raw profile value | `remoteDays` | `normalizeDays` | `MATCHED/PARTIAL` |
| from/to | raw strings | يعيد القيم | `parseClock` | `MATCHED` |
| missing availability | الويب لديه fallback في بعض open UI | لا يفرض direct fallback | يعرض حالة واضحة | `PARTIAL` |
| open availability | غير مثبت server-side كشرط broadcast | لا يتحقق لكل teacher | يفلتر العرض فقط | `UNVERIFIED` |
| timezone | غير مثبت بعقد واضح | لا يفرض conversion نهائياً | يستخدم توقيت الجهاز | `UNVERIFIED` |

### سبب رسالة availability القديمة

كانت الرسالة ناتجة عن انحرافات متعددة:

1. قراءة قيمة raw غير موحدة.
2. عدم دعم كل أشكال PostgreSQL/JSON arrays.
3. تعامل API/Mobile مع availability كبيانات direct فقط.
4. fallback الويب المفتوح لا يمكن نسخه بسبب منع hardcoding.

تم إصلاح parsing والنقل، لكن لا يوجد دليل Production E2E يثبت كل صيغ البيانات الحية.

## E. ELIGIBILITY RULES

### Specific teacher

المثبت:

- الطالب authenticated.
- role الطالب.
- profile مكتمل.
- اشتراك فعال ورصيد كافٍ.
- subject موجود.
- teacher profile معتمد.
- subject relation موجودة.

### Open booking

المثبت في API الحالي:

- الطالب authenticated.
- role الطالب.
- profile مكتمل.
- اشتراك فعال ورصيد كافٍ.
- subject موجود.
- `teacher_subjects` relation.
- `public_teacher_profiles.is_approved = true` للمعلمين المرشحين للإشعار.

### شروط لم تثبت

- stage match كشرط open request.
- availability server-side قبل notification.
- timezone server-side.
- account ban/status إضافي.

لا تتم إضافة هذه الشروط كافتراضات.

### الحالة

`PARTIAL / UNVERIFIED`.

## F. FIRST ACCEPT WINS

### الآلية الأصلية

تم العثور على RPC:

```text
accept_booking_request(_request_id, _teacher_id)
```

والشرط الحاسم المثبت:

```sql
WHERE id = _request_id
  AND status = 'open'
```

كما تم العثور على:

```text
accept_booking_group(_group_id, _teacher_id)
```

للطلبات المجموعة.

هذا يحقق conditional state transition على مستوى قبول request/group.

### النتيجة المتوقعة

```text
Teacher A -> RPC changes open to accepted
Teacher B -> RPC sees no open row and loses
```

### ما لم يثبت

- transaction واحدة تضم RPC وإنشاء `bookings`.
- عدم إمكانية إنشاء Booking مزدوج إذا فشل جزء بعد RPC.
- unique constraint يعتمد على request id.

الـAPI الحالي يحاول منع التكرار عند إنشاء booking عبر قراءة bookings السابقة، لكن هذا ليس بديلاً عن transaction Production.

### الحالة

```text
RPC first accept = MATCHED
Atomic request-to-booking lifecycle = UNVERIFIED
```

## G. BOOKING CREATION

الترتيب الحالي:

```text
booking_requests
  -> teacher decision
  -> accept_booking_request / accept_booking_group
  -> bookings insert
  -> notification to student
  -> optional first chat message
```

### من ينشئ booking؟

المصدر الأصلي ينشئه في تدفق قبول المعلم، وليس Mobile student.

API الحالي يطابق ذلك في مسار `PATCH /api/booking-requests/:id/decision`:

- يتحقق من المجموعة.
- يتحقق من expiry.
- يتحقق من teacher active session.
- يتحقق من conflict.
- يتحقق من رصيد الطالب.
- يستدعي RPC.
- يقرأ الطلبات accepted.
- ينشئ bookings الناقصة.
- يمنع تكرار booking matching للطلب.

### خطر غير مثبت

إذا نجح RPC ثم فشل insert إلى `bookings`، يمكن أن يوجد request accepted بدون booking. توجد رسالة خطأ، لكن لا توجد معاملة Production مثبتة تغطي العمليتين.

### الحالة

`PARTIAL / PRODUCTION BLOCKED`.

## H. SESSION CREATION

لا يتم إنشاء session عند:

- فتح شاشة الحجز.
- إنشاء `booking_request`.
- قبول RPC وحده.

الطلب يتحول إلى `booking` confirmed، ثم تستخدم المنصة lifecycle الجلسة الموجود لاحقاً.

لا يجوز للهاتف إنشاء session مبكراً أو تنفيذ billing.

### الحالة

`MATCHED` في حدود أن الهاتف لا ينشئ session، و`UNVERIFIED` بالنسبة لاختبار دورة session Production الكاملة.

## I. NOTIFICATIONS

### Specific teacher

```text
Student
  -> booking_requests insert
  -> notification user_id = selected teacher
```

Mobile/API الحاليان يطبقان هذا.

### Open booking

```text
Student
  -> request بدون teacher_id
  -> teacher_subjects + approved teacher profiles
  -> notification لكل teacher id
```

Mobile/API الحاليان يطبقان fan-out في API.

### After acceptance

API يرسل notification للطالب بعد إنشاء booking، مع بيانات teacher/subject/count.

المصدر الأصلي يضيف أيضاً رسالة chat ترحيبية في بعض المسارات.

### Push delivery

وجود row في `notifications` لا يثبت وصول push للجهاز. يحتاج ذلك حساباً حقيقياً وRealtime/push test.

### الحالة

```text
Notification row creation = MATCHED/PARTIAL
Actual device delivery = UNVERIFIED
```

## J. DATABASE FLOW

### الجداول المستخدمة

```text
profiles / public_profiles
public_teacher_profiles
subjects
teacher_subjects
user_subscriptions
booking_requests
bookings
notifications
chat_messages
```

### العلاقات

```text
public_teacher_profiles.user_id -> teacher account
teacher_subjects.teacher_id -> public_teacher_profiles.id
teacher_subjects.subject_id -> subjects.id
booking_requests.subject_id -> subjects.id
bookings.subject_id -> subjects.id
booking_requests.accepted_by -> winner teacher account
bookings.teacher_id -> confirmed teacher account
```

### RLS

RLS يسمح بالتدفق المفتوح حسب علاقة المادة/الاعتماد، لكن لا يوجد target teacher column يفرض عزل direct request.

لم يتم تعديل RLS.

### RPC/Functions/Triggers

تمت مراجعة أسماء RPC الخاصة بالقبول. لم يتم تعديلها أو استبدالها.

الخصم المالي/الدقائق يبقى في lifecycle الأصلي، ولا يحدث عند إنشاء request في الهاتف.

### الحالة

`MATCHED` للمخطط الموجود، `BLOCKED` لضمان target-only، و`UNVERIFIED` للذرية الشاملة.

## K. MOBILE FLOW

### Specific

```text
find-teacher
  -> booking with teacher params
  -> subject relation
  -> real availability
  -> title/goal
  -> subscription duration/balance
  -> POST /api/booking-requests with teacherId
```

### Open

```text
booking without teacherId
  -> /api/teachers
  -> subject options from real teachers
  -> union of real eligible teacher availability
  -> POST /api/booking-requests without teacherId
```

### Error visibility

الهاتف يعرض رسالة API المنظمة، ولا يعلن نجاحاً بناءً على TypeScript أو build أو checkout redirect.

### عدم وجود fallback

إذا لم تصل Availability:

- لا يتم إنشاء أيام افتراضية.
- لا يتم إنشاء ساعات 08:00 أو 17:00 أو 23:00.
- تعرض الشاشة حالة واضحة.

### الحالة

`PARTIAL`: التدفقان موجودان محلياً، لكن E2E الحقيقي وserver-side timezone/availability غير مثبتين.

## L. API FLOW

### Create

```text
POST /api/booking-requests
  -> session
  -> Supabase Bearer
  -> student role
  -> profile completeness
  -> future date
  -> subscription/balance
  -> subject lookup
  -> direct teacher validation OR open teacher fan-out
  -> duplicate checks
  -> INSERT booking_requests
  -> notifications
```

### Decision

```text
PATCH /api/booking-requests/:id/decision
  -> teacher role
  -> open request check
  -> group validation
  -> expiry
  -> active session/conflict
  -> student allowance
  -> acceptance RPC
  -> accepted rows
  -> idempotent-ish booking lookup
  -> missing bookings insert
  -> student notification
```

### مشكلة API مهمة

`GET /api/student/dashboard` يلف عدة عمليات في `Promise.all` ثم يحول أي خطأ إلى `502`.

من السجل المتاح ثبت `502` فقط، ولم يثبت أي upstream بعينه في هذه الجولة. لذلك لا يجوز نسبة الخطأ إلى query محدد بدون raw error per operation.

### الحالة

Booking create/decision code: `MATCHED/PARTIAL`.  
Dashboard 502 root cause: `UNVERIFIED`.

## M. OPENAPI CONTRACT

العقد الحالي:

```yaml
BookingRequestInput:
  required: [subject, startsAt, durationMinutes]
  properties:
    teacherId:
      type: [string, "null"]
      description: Optional for an open subject request
```

ويتم توليد العقود إلى:

```text
lib/api-client-react/src/generated/
lib/api-zod/src/generated/
```

هذا يطابق وجود نظامين:

- direct teacher: `teacherId` موجود.
- open subject: `teacherId` غير موجود.

### الحالة

`MATCHED` على مستوى العقد المحلي.

ولا يثبت ذلك نجاح Production.

## N. CURRENT ROOT CAUSES

### Root cause 1 — direct booking rejection

كان API الهاتف يفرض stage compatibility لم يكن جزءاً من direct flow الأصلي، ما أدى إلى:

```text
المعلم المختار لا يستقبل طلبات هذه المرحلة الدراسية
```

تمت إزالة الشرط ووقف إرسال `teaching_stage` الإضافي.

### Root cause 2 — open flow contract gap

العقد المحلي كان يفرض `teacherId`، لذلك لم يكن open flow قابلاً للاستخدام من الهاتف.

تم جعل الحقل اختيارياً وإضافة fan-out.

### Root cause 3 — availability representation

لم تكن صيغ arrays/Arabic/English موحدة بين المصدر والـMobile.

تمت إضافة normalization دون fallback.

### Root cause 4 — target-only limitation

Production `booking_requests` لا يحتوي target teacher. هذه ليست مشكلة يمكن إصلاحها داخل Mobile/API فقط.

### Root cause 5 — dashboard masking

`Promise.all` + catch عام يحول خطأ أي upstream إلى 502 بدون اسم العملية. السبب المحدد لم يثبت بعد.

### الحالة العامة

```text
Root causes local to Mobile/API: CODE FIXED
Production lifecycle root causes: BLOCKED/UNVERIFIED
```

## O. EXACT FILES REQUIRING CHANGES

### Changes completed safely

```text
artifacts/api-server/src/routes/learning.ts
artifacts/ajyal-mobile/app/booking.tsx
lib/api-spec/openapi.yaml
lib/api-client-react/src/generated/
lib/api-zod/src/generated/
```

### Files inspected as source truth

```text
.local/conversation-workspace/files/taealam_build/src/pages/Booking.tsx
.local/conversation-workspace/files/taealam_build/src/components/teacher/BookingRequests.tsx
artifacts/api-server/src/routes/directory.ts
artifacts/ajyal-mobile/lib/teacherAvailability.ts
```

### Files not safe to change without explicit Production approval

```text
Supabase migrations
RLS policies
accept_booking_request
accept_booking_group
Production schema
Production Auth
VPS/session infrastructure
```

### Remaining safe candidates

```text
artifacts/api-server/src/routes/learning.ts
```

يمكن تحسين تشخيص dashboard 502 داخل API بعد التقرير، بدون تغيير Production، بشرط عدم إخفاء الخطأ أو اختراع fallback.

## P. PRODUCTION BLOCKERS

### Blocker 1 — E2E identities

لا توجد جلسة اختبار معتمدة لطالب ومعلم تسمح بإنشاء request حقيقي ثم قبول حقيقي وتنظيف آمن للبيانات.

الحالة: `BLOCKED`.

### Blocker 2 — strict selected-teacher targeting

### PRODUCTION CHANGE REQUIRED

لضمان أن direct request لا يظهر إلا للمعلم المختار، يحتاج Production واحداً من:

- `teacher_id` target column.
- relation/table للهدف.
- RPC/RLS جديد يميز direct target.

لا يجوز تنفيذ ذلك تلقائياً.

البديل الحالي هو notification recipient + subject/approval filtering، لكنه لا يساوي target-only RLS.

الحالة: `PRODUCTION BLOCKED`.

### Blocker 3 — request acceptance and booking atomicity

### PRODUCTION CHANGE REQUIRED

لضمان عدم وجود accepted request بلا booking أو booking مزدوج عند race/failure، يلزم إثبات أو تعديل transaction/RPC/server function في Production.

البديل الحالي يستدعي RPC ثم ينشئ bookings في خطوة منفصلة مع فحص تكرار، لكنه ليس ضماناً ذرياً مثبتاً.

الحالة: `UNVERIFIED / PRODUCTION BLOCKED`.

### Blocker 4 — availability timezone enforcement

### PRODUCTION CHANGE REQUIRED

يلزم عقد واضح يحدد timezone الذي تمثل به `available_days/from/to`، وقاعدة server-side للتحقق من `startsAt`.

البديل الحالي هو UX filtering في Mobile، ولا يكفي كضمان business rule.

الحالة: `UNVERIFIED`.

### Blocker 5 — dashboard 502

لم يثبت upstream محدد في هذه الجولة. لا يوجد مبرر لتعديل Production أو تعطيل query أو إضافة fallback.

الحالة: `BLOCKED / UNVERIFIED`.

## Q. TEST PLAN

| Test | الوصف | النتيجة الحالية | Evidence/Reason |
|---|---|---|---|
| TEST 1 | Specific Teacher Booking | `CODE VERIFIED / E2E UNVERIFIED` | typecheck/build والـAPI flow؛ لا حساب حقيقي |
| TEST 2 | Open Booking | `CODE VERIFIED / E2E UNVERIFIED` | optional teacherId + fan-out محلياً |
| TEST 3 | No eligible teachers | `PARTIAL` | UI يمنع الإرسال عند عدم وجود candidate؛ API behavior Production غير مختبر |
| TEST 4 | Teacher unavailable | `PARTIAL` | Mobile لا يعرض slot غير منشور؛ server enforcement غير مثبت |
| TEST 5 | Teacher available | `UNVERIFIED` | يحتاج profile حقيقي وطلب حقيقي |
| TEST 6 | Two teachers accept simultaneously | `UNVERIFIED` | RPC موجود؛ race حقيقي لم ينفذ |
| TEST 7 | First teacher wins | `MATCHED BY RPC / E2E UNVERIFIED` | شرط `status = open` مثبت من RPC source |
| TEST 8 | Second teacher cannot create booking | `UNVERIFIED` | ذرية RPC+booking غير مثبتة |
| TEST 9 | No duplicate booking | `PARTIAL` | API يفحص existing bookings؛ race Production غير مختبر |
| TEST 10 | Insufficient balance | `CODE VERIFIED / E2E UNVERIFIED` | API/mobile validation موجود |
| TEST 11 | Expired subscription | `CODE VERIFIED / E2E UNVERIFIED` | query/allowance موجود، لا حساب حي |
| TEST 12 | Student logout/login then booking | `UNVERIFIED` | لا E2E بحساب حقيقي |
| TEST 13 | App restart then booking | `UNVERIFIED` | startup/build فقط تم التحقق منه |
| TEST 14 | Notifications | `PARTIAL` | notification insert path موجود؛ وصول الجهاز غير مثبت |
| TEST 15 | Dashboard | `BLOCKED / UNVERIFIED` | `/api/student/dashboard` ظهر 502، upstream غير محدد |

## Build and Runtime Verification

```text
API TypeScript: PASS
API build: PASS
Mobile TypeScript: PASS
OpenAPI generation: PASS
Android bundle: PASS
iOS bundle: PASS
git diff --check: PASS
Expo startup: PASS
GET /api/healthz: 200
Unauthenticated /api/teachers: 401
Unauthenticated /api/booking-requests: 401
```

خطأ React Native DevTools الخاص بـ`libglib-2.0.so.0` اختياري ولم يمنع Metro أو bundles.

## Final Verdict

```text
CODE PARITY: PARTIAL, with local direct/open contract fixes applied
E2E VERIFICATION: 0% for real Production booking lifecycle
STATUS: CODE VERIFIED
STATUS: E2E PRODUCTION UNVERIFIED
```

لا يجوز إعلان أن الحجز يعمل Production قبل تنفيذ TEST 1 وTEST 2 وTEST 6 وTEST 7 وTEST 8 وTEST 14 بحسابات حقيقية، وحسم Blockers 2–5 بالأدلة أو بموافقة Production صريحة.