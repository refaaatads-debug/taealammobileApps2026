# Student Dashboard / Home — Parity Audit

**تاريخ التدقيق:** 2026-09-05  
**النطاق:** المرحلة الثانية فقط — لوحة الطالب الرئيسية `/student` في المنصة الأصلية وما يقابلها في تطبيق Expo.  
**المبدأ:** منصة الويب وSupabase Production هما مصدر الحقيقة. لا تعديل على Production أو schema أو RLS أو RPC أو Auth أو المنصة الأصلية.

## 1. مصادر الحقيقة المستخدمة

### المنصة الأصلية والمواصفات

- `attached_assets/student-dashboard-architecture_1788629894440.md`
- `attached_assets/platform-master-integrated-architecture_1788629894258.md`
- ملفات المصدر المذكورة داخل المخططات، ومنها `src/pages/StudentDashboard.tsx` و`src/components/ProtectedRoute.tsx`، عندما كان وصفها مثبتاً في المخطط.

### تطبيق الهاتف وAPI

- `artifacts/ajyal-mobile/app/(tabs)/index.tsx`
- `artifacts/ajyal-mobile/app/(tabs)/bookings.tsx`
- `artifacts/ajyal-mobile/app/(tabs)/assignments.tsx`
- `artifacts/ajyal-mobile/app/(tabs)/notifications.tsx`
- `artifacts/ajyal-mobile/components/AjyalUI.tsx`
- `artifacts/ajyal-mobile/hooks/useAjyal.tsx`
- `artifacts/api-server/src/routes/profile.ts`
- `artifacts/api-server/src/routes/learning.ts`
- `artifacts/api-server/src/routes/directory.ts`
- `artifacts/api-server/src/lib/supabaseAuth.ts`
- `lib/api-spec/openapi.yaml` والعقود المولدة في `lib/api-zod` و`lib/api-client-react`

## 2. تعريف الحالات

| الحالة | المعنى |
|---|---|
| `MATCHED` | السلوك ومصدر البيانات متوافقان ضمن الأدلة المتاحة |
| `PARTIAL` | جزء من السلوك موجود، لكن توجد فجوة موثقة أو نطاق هاتف أضيق |
| `MISMATCH` | اختلاف مؤكد يمكن إثباته بين لوحة المنصة وتطبيق الهاتف/API |
| `UNVERIFIED` | يحتاج Production أو حساباً حقيقياً أو إعداداً خارجياً لا يمكن إثباته قراءةً فقط |
| `NOT_APPLICABLE` | البند ليس جزءاً مثبتاً من لوحة الطالب الرئيسية نفسها |

## 3. الحقيقة المستخرجة من لوحة المنصة

تصف الوثائق لوحة الطالب الرئيسية `/student` بأنها تجمع:

- بطاقة هوية الطالب وحالة اكتمال الملف.
- أقرب حصة، مع أولوية الجلسة الجارية ثم الأقرب زمنياً.
- تنبيه اكتمال الملف عند غياب `full_name` أو `phone` أو `teaching_stage`.
- الرصيد والدقائق من `user_subscriptions` وبيانات الخطة من `subscription_plans`.
- إحصاءات الجلسات والوقت الفعلي والتقدم والنقاط.
- الجلسات القادمة والتقويم.
- طلبات الحجز المفتوحة من `booking_requests`.
- المواد والتسجيلات من `session_materials` و`sessions.ai_report` و`bookings` و`subjects`.
- الواجبات والاختبارات.
- الإشعارات والدعم.
- الجلسات الفورية وحالة `session_status = in_progress`.

مصادر بيانات الطالب الموثقة:

| المجال | مصدر المنصة |
|---|---|
| الهوية | Supabase Auth و`profiles` |
| اكتمال الملف | `profiles.full_name`, `profiles.phone`, `profiles.teaching_stage` |
| الجلسات | `bookings`, `sessions`, `public_profiles`, `subjects` |
| الرصيد | `user_subscriptions`, `subscription_plans` |
| الطلبات المفتوحة | `booking_requests` |
| المواد | `session_materials`, `sessions.ai_report`, `bookings`, `subjects`, Storage |
| الواجبات | `assignments`, `assignment_submissions` |
| الإشعارات | `notifications` |
| النقاط | `student_points`, `student_levels`, `badges`, `student_badges` |

## 4. جدول المطابقة قبل الإصلاح

| FEATURE | PLATFORM SOURCE | MOBILE SOURCE | STATUS | EVIDENCE | RISK | REQUIRED FIX |
|---|---|---|---|---|---|---|
| هوية الطالب والدور | Auth + `profiles` + `user_roles` | `GET /me` عبر Bearer Supabase و`useAjyal` | `MATCHED` | `routes/profile.ts` يقرأ الملف والدور من Supabase، وroot يمنع role غير المحسوم | P0 | لا تغيير |
| حماية الحساب غير المكتمل/المفقود | `ProtectedRoute` ثم `complete-profile` عند النقص | root يمنع profile المفقود، لكن `/me` لا يعيد حقول اكتمال الملف ولا تعرض Home تنبيهاً | `PARTIAL` | `profile.ts` يعيد الهوية فقط؛ الوثيقة تحدد الحقول الثلاثة المطلوبة | P1 | إضافة حالة اكتمال مثبتة إلى bootstrap أو dashboard read، وعرضها فقط |
| اسم الطالب والصورة | `profiles` / `public_profiles` | `GET /me` ثم Header/avatar حرفي | `MATCHED` ضمن العرض الحالي | `routes/profile.ts` و`index.tsx` | P1 | لا تغيير |
| أقرب حصة | `bookings` مع المستقبل أو `in_progress`، إثراء المعلم والمادة | `GET /sessions?view=upcoming` ثم أول عنصر | `PARTIAL` | Home يعرض أول Session فقط؛ `Session` لا يحمل `session_status` أو روابط الجلسة/الدردشة | P1 | توحيد اختيار الجلسة الجارية أولاً وإظهار الإجراء المناسب إن كان مثبتاً |
| الجلسات الفورية | `bookings.session_status = in_progress` | غير ممثلة كحالة مستقلة في عقد `Session` أو `SessionCard` | `MISMATCH` | عقد `Session` يحصر الحالة في upcoming/done/cancelled/expired | P0 | توسيع القراءة/العقد داخل التطبيق فقط إن كان متوافقاً مع الحقول المثبتة، دون تعديل Production |
| إحصاءات الجلسات | `bookings`, `sessions`, `reviews`، ومنها completed/cancelled/وقت فعلي | متوسط تقدم الواجبات، عدد الجلسات القادمة، والواجبات المكتملة | `MISMATCH` | `index.tsx` يحسب `averageProgress`, `sessions.length`, `completed assignments` فقط | P1 | إضافة قراءة dashboard للحقول المثبتة أو عرضها في Home من مصدرها الصحيح |
| الرصيد والدقائق | `user_subscriptions` + `subscription_plans` | لا يوجد استعلام أو بطاقة رصيد في Home | `MISMATCH` | لا endpoint أو query للاشتراك داخل Home | P0 | إضافة قراءة read-only من نفس الجداول وعرض حالات active/low/empty فقط |
| تنبيه الرصيد | remaining minutes مقابل session duration مع رابط pricing | لا يوجد | `MISMATCH` | موثق في `student-dashboard-architecture` وغير موجود في `index.tsx` | P1 | إضافة بطاقة تنبيه مرتبطة ببيانات الاشتراك دون تنفيذ دفع |
| طلبات الحجز المفتوحة | `booking_requests` بحالة open مع Realtime | API وشاشة `/bookings` يدعمان الطلبات، Home لا يقرأها | `PARTIAL` | `bookings.tsx` يستخدم `useListBookingRequests`، `index.tsx` لا يستخدمه | P1 | عرض ملخص الطلبات المفتوحة في Home وإبقاء التفاصيل في `/bookings` |
| التقويم والجدول | `ScheduledSessionsCalendar` و`StudentScheduleTable` في StudentDashboard | شاشة `/bookings` منفصلة، وHome يعرض Session واحدة | `PARTIAL` | `index.tsx` يوجه إلى `/bookings` ولا يعرض التقويم | P1 | لا نسخ منطق الحجز؛ إضافة رابط/ملخص فقط ما لم تثبت حاجة لدمج التقويم |
| المواد والتسجيلات | `session_materials`, `sessions.ai_report`, `bookings`, `subjects`, Storage | Home لا يعرض مواداً؛ يوجد مسار `/materials` منفصل | `PARTIAL` | `DashboardActions` يوفر رابط المواد فقط | P1 | عرض مؤشر/ملخص read-only إن توفر مصدر API مثبت؛ لا تنفيذ تنزيل جديد هنا |
| الواجبات | `assignments` و`assignment_submissions` مع حالات التسليم والتصحيح | Home يعرض أول عنصرين من `GET /assignments`، والعقد يلخص progress/status | `PARTIAL` | `index.tsx` و`learning.ts` يعرضان title/subject/due/progress/kind/status فقط | P1 | إبقاء Home مختصراً، وعدم اختراع درجات أو ملاحظات غير موجودة في العقد |
| الإشعارات | `notifications`، unread badge، mark read، Realtime في المنصة | `GET /notifications` وbadge؛ شاشة التنبيهات تدعم القراءة | `PARTIAL` | Home يحسب unread من fetch فقط ولا يربط Realtime خاصاً به | P1 | تحديث الملخص بعد أحداث التطبيق القائمة، دون مضاعفة fetch/Realtime |
| الرسائل | `chat_messages` وعداد Navbar/Toast في المنصة | تبويب Messages موجود، لكن Home لا يعرض عداد الرسائل | `PARTIAL` | `index.tsx` لا يستعلم messages؛ مصدر العداد في tabs يحتاج إثباتاً منفصلاً | P1 | لا إضافة عداد قبل إثبات endpoint/Realtime الحالي |
| النقاط والمستوى والشارات | `student_points`, `student_levels`, `badges`, `student_badges` | لا API أو query أو بطاقة في Home | `MISMATCH` | المصادر موثقة، ولا تظهر في `index.tsx` أو العقود الحالية | P1 | إضافة قراءة read-only فقط إذا أمكن تحديد عقد آمن من الجداول المثبتة |
| المعلمون المقترحون | البحث في `/search` موثق، وليس هناك بلوك توصيات مؤكد داخل StudentDashboard | Home يوفر Action إلى `/find-teacher` فقط | `NOT_APPLICABLE` | الوثيقة تثبت البحث كمسار مستقل ولا تثبت قائمة توصيات في Home | — | لا تغيير تخميني |
| الدعم | `CustomerServiceButton`/`/support` | شريط مساعدة يفتح `/support` | `MATCHED` ضمن المسار | `index.tsx` و`platform-master` | P1 | لا تغيير |
| loading | تحميل واضح قبل dashboard وProtectedRoute | `LoadingBlock` عام، مع إبقاء بعض المحتوى الفارغ أثناء التحميل | `PARTIAL` | `index.tsx` يعرض LoadingBlock بعد Header/Actions | P1 | إضافة حالات تحميل للبيانات الجديدة دون حجب التطبيق كله |
| empty | حالات فارغة للجلسات والواجبات | موجودة للجلسات والواجبات والأخطاء | `MATCHED` للبيانات الحالية، `PARTIAL` للوحدات الغائبة | `EmptyState` في Home | P1 | إضافة empty states للبطاقات الجديدة |
| error | مصدر الخطأ وخيار retry | error aggregate للـsessions/assignments/notifications | `PARTIAL` | retry موجود، لكن لا توجد أخطاء مستقلة للوحدات غير المقروءة | P1 | فصل أخطاء dashboard read الجديدة وإظهار retry مناسب |
| مصدر البيانات وعدم وجود local fallback | Supabase/RLS مصدر الحقيقة | API يستخدم Supabase عند Bearer، ويمنع endpoints الطالب عند غياب Bearer | `MATCHED` | `learning.ts` و`supabaseAuth.ts` | P0 | لا تغيير؛ لا استخدام mock/local data في Home |

## 5. الفروقات المؤكدة القابلة للإصلاح

الفروقات المؤكدة داخل نطاق الهاتف/API هي:

1. Home لا يقرأ ولا يعرض رصيد الطالب والدقائق رغم أن المصدر والحقول موثقة.
2. Home لا يقرأ ولا يعرض طلبات الحجز المفتوحة رغم وجود endpoint قائم لنفس الطالب.
3. عقد الجلسة الحالي لا يميز الجلسة الفورية `in_progress`، لذلك لا يمكن لـHome اختيارها وإظهارها كما تفعل المنصة.
4. Home لا يعرض أي قراءة للنقاط/المستوى/الشارات رغم توثيق مصادرها.
5. Home لا يعرض اكتمال الملف، لكن API الحالي لا يعيد الحقول اللازمة؛ يلزم إصلاح عقد قراءة داخل التطبيق/API دون تعديل Production.

## 6. البنود التي لا يجوز إصلاحها بالتخمين

- معنى كل عمود إضافي في `student_points`, `student_levels`, `badges`, `student_badges` إذا لم يظهر في المخطط أو قراءة مؤكدة.
- تفاصيل material download أو signed URL داخل Home.
- عداد الرسائل إذا لم يوجد endpoint/Realtime مثبت في التطبيق الحالي.
- قواعد إخفاء أو ترتيب الحصص التاريخية من Home.
- أي احتساب مالي أو خصم أو كتابة على الاشتراك.
- أي تغيير في RLS أو RPC أو Triggers لتسهيل القراءة.

## 7. قرار ما قبل التنفيذ

**الحالة:** `PARTIAL` مع `MISMATCH` مؤكدة في الرصيد، الجلسة الفورية، النقاط، وعدم عرض الطلبات المفتوحة واكتمال الملف.

سيتم الإصلاح داخل:

- `artifacts/ajyal-mobile`
- `artifacts/api-server`
- عقود API اللازمة فقط إذا احتاجت القراءة عقداً جديداً

لن يتم تعديل:

- Production Database أو Schema أو RLS أو RPC أو Functions أو Triggers.
- Auth/OAuth أو Storage Policies أو Realtime configuration.
- VPS أو Nginx أو Kong.
- كود المنصة الأصلية.
- الاشتراكات أو الحجز أو الدفع كمسارات مستقلة.

## 8. الإصلاحات المنفذة

تم تنفيذ الإصلاحات المؤكدة داخل الهاتف/API فقط:

- إضافة `GET /api/student/dashboard` محمي بـSupabase Bearer، ويقرأ profile، الجلسات، الحجوزات المكتملة/الملغاة، الاشتراكات النشطة، طلبات الحجز المفتوحة، الإشعارات غير المقروءة، والنقاط.
- إضافة عقد OpenAPI وReact Query/Zod مولد للاستجابة الجديدة.
- إضافة حالة `sessionStatus` إلى عقد الجلسة وترتيب `in_progress` قبل الجلسات القادمة الأخرى.
- ربط Home بالـdashboard الموحد بدلاً من قراءة جلسات مستقلة للطالب.
- عرض تنبيه اكتمال الملف عند غياب `full_name` أو `phone` أو `teaching_stage`.
- عرض تقدم الجلسات، الجلسات المكتملة، النقاط، الرصيد بالدقائق، الجلسات المتبقية، واسم الخطة عند توفرها.
- عرض ملخص طلبات الحجز المفتوحة مع إبقاء التفاصيل في `/bookings`.
- عرض الحالة المرئية `الجلسة جارية الآن` عند `session_status = in_progress`.
- إبقاء المواد، التقويم، التوصيات، الدفع، ودورة الجلسة التفصيلية خارج هذه المرحلة عندما لا يثبت وجود عقد Home آمن لها.

## 9. الحالة النهائية بعد الإصلاح

| FEATURE | FINAL STATUS | ملاحظة التحقق |
|---|---|---|
| اكتمال الملف | `MATCHED` على مستوى الكود والعقد | يعتمد على الحقول الثلاثة الموثقة؛ لم يُستخدم حساب طالب حقيقي |
| أقرب جلسة والجلسة الجارية | `MATCHED` على مستوى القراءة والترتيب | `in_progress` يسبق الجلسات الأخرى؛ فتح غرفة الجلسة التفصيلي بقي خارج النطاق |
| إحصاءات الجلسات | `PARTIAL` | اكتمل completed/cancelled/progress/points؛ وقت التعلم الفعلي وتقارير AI ليسا جزءاً من العقد الجديد |
| الرصيد والدقائق | `MATCHED` على مستوى القراءة | تجميع read-only من الاشتراكات النشطة والخطة؛ لا يوجد أي احتساب أو كتابة مالية |
| طلبات الحجز المفتوحة | `MATCHED` على مستوى Home | الملخص من dashboard والتفاصيل من `/bookings` |
| النقاط | `PARTIAL` | تمت إضافة القراءة الموثقة لـ`student_points.total_points`، لكن الاستجابة بحساب طالب حقيقي غير مثبتة في هذه المرحلة |
| الإشعارات غير المقروءة | `MATCHED` على مستوى عداد Home | القراءة التفصيلية بقيت في شاشة الإشعارات |
| الواجبات | `PARTIAL` | بقيت قائمة مختصرة من endpoint الواجبات؛ لا تمت إضافة نتائج/تصحيح غير موجودة في العقد |
| المواد والتسجيلات | `PARTIAL` | ما زالت ضمن مسار المواد المنفصل؛ لا إضافة تخمينية لـStorage أو AI |
| التقويم | `PARTIAL` | ما زال ضمن الحجوزات؛ Home يعرض أقرب جلسة وملخص الطلبات فقط |
| المعلمون المقترحون | `NOT_APPLICABLE` | لا يوجد بلوك توصيات Home مثبت في المصدر |
| مصدر الحقيقة وعدم وجود fallback محلي | `MATCHED` | dashboard الجديد يرفض غياب Bearer بـ401 ولا يضيف بيانات محلية |

## 10. التحقق المنفذ

نجحت الفحوص التالية بعد الإصلاح:

- `pnpm --filter @workspace/api-spec run codegen`
- `pnpm --filter @workspace/ajyal-mobile exec tsc --noEmit`
- `pnpm --filter @workspace/api-server exec tsc --noEmit`
- `pnpm --filter @workspace/api-server run build`
- `pnpm --filter @workspace/ajyal-mobile run build`
  - Android bundle
  - iOS bundle
  - manifests
  - 44 asset
- `git diff --check`
- `GET http://127.0.0.1:8080/api/healthz` أعاد `200`.
- `GET http://127.0.0.1:8080/api/student/dashboard` دون Authorization أعاد `401` دون بيانات.
- أعيد تشغيل workflow الخاص بـAPI وExpo، وكلاهما يعمل.
- معاينة Expo وصلت إلى شاشة تسجيل الدخول دون أخطاء JavaScript مانعة.

## 11. التحذيرات والحدود المتبقية

- `libglib-2.0.so.0` مفقود في NixOS، ويؤثر على React Native DevTools الاختياري فقط؛ Metro وbundles يعملان.
- لم تُستخدم بيانات أو كتابات Production بحساب طالب حقيقي؛ لذلك تبقى مطابقة القيم الفعلية للجداول في Production `UNVERIFIED`.
- لم تبدأ مرحلة الاشتراكات أو الحجز أو الجلسة كوظائف مستقلة.