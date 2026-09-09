# Teachers / Subjects / Teaching Stages / Availability — Parity Audit

**تاريخ التدقيق:** 2026-09-05  
**النطاق:** المرحلة الثالثة فقط — قائمة المعلمين، ملف المعلم العام، المواد، المراحل، التوفر، البحث، الفلاتر، والترتيب.  
**حالة التنفيذ:** تدقيق وإصلاح محدودان داخل API والهاتف فقط؛ لا توجد تغييرات في Production.

## 1. Executive Summary

المسار الحالي يملك أساساً جيداً للقراءة من Supabase عند وجود Supabase Bearer:

- يقرأ `public_teacher_profiles` مع `is_approved = true`.
- يربط الاسم والصورة عبر `public_profiles`.
- يربط المواد عبر `teacher_subjects → subjects`.
- يعيد `teaching_stages`, `available_days`, `available_from`, `available_to`, `hourly_rate`, `avg_rating`, و`total_sessions`.
- يوفر بحثاً بالاسم أو اسم المادة، وفلاتر محلية للمادة والمرحلة، وترتيباً حسب التقييم أو السعر.

وكانت فروقات مؤكدة قبل الإصلاح:

1. `GET /teachers` لم يكن يفرض دور الطالب ولا وجود Supabase Bearer، وكان يمكنه السقوط إلى قاعدة البيانات المحلية المنفصلة.
2. قائمة المعلمين لم تكن تعرض مؤشر التوفر.
3. اختيار فلتر لا يطابق أي معلم كان يعرض قائمة فارغة بلا `EmptyState`.
4. المواد والمراحل تُستخرج من المعلمين المعادين فقط، ولا يوجد مصدر قراءة مستقل لقائمة `subjects` أو مرجع stages.
5. بيانات الملف العام المعادة للهاتف أضيق من البيانات الموثقة للمنصة؛ لا يوجد `bio` أو عدد المراجعات.
6. دلالات الوقت والدقائق في `available_from/to` لم تُثبت من Production أو المصدر الأصلي الكامل.

تم إصلاح البنود 1–3 داخل الهاتف/API. البنود 4–6 بقيت مصنفة `PARTIAL` أو `UNVERIFIED` لأن توسيعها يتطلب عقداً مثبتاً من المنصة، ولا يجوز تخمينه.

لا يوجد دليل يسمح بإعلان تطابق كامل. تغييرات Production أو schema أو RLS أو RPC أو Auth أو Storage أو VPS ممنوعة وتبقى خارج التنفيذ.

## 2. Platform Reference

### مصادر الحقيقة

- `attached_assets/student-dashboard-architecture_1788629894440.md`
- `attached_assets/student-dashboard-architecture_1788591912035.md`
- `attached_assets/full-session-booking-finance-assignments-architecture_1788629894391.md`
- `PLATFORM_PARITY_AUDIT.md`
- `PLATFORM_NON_PARITY_DETAILED_REPORT.md`

المستودع المحلي لا يحتوي مستودع الويب الأصلي كاملاً. لذلك تُصنف التفاصيل التي تتطلب قراءة المصدر الأصلي أو جلسة Production حقيقية كـ`UNVERIFIED` بدلاً من تخمينها.

### نموذج القراءة الموثق

| المجال | المصدر |
|---|---|
| بوابة ظهور المعلم | `public_teacher_profiles.is_approved = true` |
| الاسم والصورة | `public_profiles` عبر `user_id` |
| الملف العام | `public_teacher_profiles` |
| المواد | `teacher_subjects.teacher_id → subjects.id` |
| المراحل | `public_teacher_profiles.teaching_stages` |
| التوفر | `public_teacher_profiles.available_days`, `available_from`, `available_to` |
| السعر | `public_teacher_profiles.hourly_rate` |
| التقييم | `public_teacher_profiles.avg_rating`، وعدد المراجعات إن كان جزءاً من المصدر |
| البحث | اسم المعلم أو اسم المادة |
| الفلاتر | المادة، المرحلة، ومؤشر التوفر |
| الترتيب | التقييم أو خيار ترتيب متاح في الواجهة |

### قواعد التوفر المثبتة

- التوفر العام للمعلم منفصل عن المواعيد المحجوزة فعلياً.
- لا يجوز اختراع أيام أو ساعات عند خلو `available_days` أو `available_from/to`.
- الجلسة الفورية لا تعتمد بالضرورة على جدول التوفر، بينما الحجز المجدول يستخدمه في الواجهة.
- تفاصيل تفسير timezone أو دقة الدقائق في الحقول الزمنية غير مثبتة من Production في هذه المرحلة.

## 3. API Comparison

| FEATURE | PLATFORM | MOBILE | API | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| مصدر قائمة المعلمين | `public_teacher_profiles` مع بوابة الاعتماد | يستخدم `useListTeachers` | Supabase فقط مع Bearer | `MATCHED` | الفرع المحلي أزيل، واستدعاء Supabase محاط بمعالجة خطأ | صحة بيانات Production/RLS غير مختبرة بحساب طالب | لا تغيير |
| صلاحية الطالب لرؤية القائمة | مسار الطالب محمي بالمصادقة/RLS | الصفحة خلف حارس المصادقة | `/teachers` يفرض Bearer ودور `student` | `MATCHED` | `directory.ts` يستدعي `hasSupabaseRole(..., "student")` | role الفعلي في Production غير مختبر بحساب حقيقي | لا تغيير |
| اعتماد المعلم | `is_approved = true` | لا يعرض إلا نتيجة API | query يحتوي `is_approved=eq.true` | `MATCHED` من الكود | `directory.ts:64-68` | صحة RLS الفعلية غير مثبتة | لا تغيير |
| اسم وصورة المعلم | `public_profiles` عبر `user_id` | بطاقة الاسم والصورة الرمزية | يقرأ `full_name, avatar_url` | `MATCHED` جزئياً | `directory.ts:69-74, 100-108` | profile مفقود يسمح ببطاقة اسم عام | تحديد سلوك الصف المفقود من Production قبل تشديده |
| نبذة المعلم | profile العام/الموثق | غير معروضة | غير معادة | `PARTIAL` | المصادر توثق `bio` لكن `TeacherSummary` لا يحتويها | فقدان معلومات الملف | إضافة فقط بعد إثبات الحقل والعقد الأصلي |
| التقييم | `avg_rating` | يعرض نجوم التقييم | يعيد `avg_rating` | `MATCHED` من الكود | `directory.ts:108-110` | القيمة الفعلية غير مختبرة بحساب طالب | لا تغيير |
| عدد المراجعات | موثق ضمن بيانات الملف إن كان جزءاً من المصدر | غير معروض | غير معاد | `UNVERIFIED` | لا يوجد حقل مثبت في العقد المحلي الحالي | قد نخترع اسماً أو مصدراً خاطئاً | يحتاج مصدر منصة/Production مثبت |
| عدد الجلسات | بيانات المعلم العامة | يعرض `totalSessions` | يعيد `total_sessions` | `MATCHED` من الكود | `directory.ts:109` و`find-teacher.tsx:155` | القيمة الفعلية غير مختبرة | لا تغيير |
| المواد وربطها بالمعلم | `teacher_subjects → subjects` | يعرض subjects القادمة من API | nested select `subjects(name)` | `MATCHED` من الكود | `directory.ts:76-92` | join/RLS الفعلي غير مثبت | لا تغيير |
| قائمة المواد العامة | `subjects` المستقلة | خيارات المادة مشتقة من المعلمين المعادين | لا endpoint مستقل للمواد | `PARTIAL` | `find-teacher.tsx:24-27` | مادة بلا معلم لا تظهر كخيار، وقد يختلف empty behavior | لا تضف endpoint قبل إثبات عقد المنصة |
| المراحل الدراسية | `teaching_stages` في الملف العام/المصدر الموثق | خيارات مشتقة من النتائج | يعيد stages لكل معلم | `PARTIAL` | `find-teacher.tsx:20-23`, `directory.ts:111-113` | لا يوجد master source أو تطبيع مثبت | إبقاء القيم الأصلية وعدم توليد مراحل |
| بحث اسم المعلم | الاسم العام | يرسل `search` | يطابق الاسم/الاسم الأول/الأخير | `MATCHED` من الكود | `remoteMatchesSearch` في `directory.ts` | تطبيع العربية الكامل غير مثبت | لا تغيير إلا بعد دليل |
| بحث اسم المادة | اسم المادة المرتبطة | يرسل `search` | يطابق subject names بعد join | `MATCHED` من الكود | `remoteMatchesSearch` و`subjectsByTeacherId` | لا يشمل مادة غير مرتبطة بمعلم | مطابق لنطاق المعلم |
| فلتر المادة | نتائج joined | فلترة محلية في الهاتف | لا query param مستقل | `PARTIAL` | `find-teacher.tsx:29-33` | القائمة مشتقة من response وليست source مستقلة | إبقاء الفلترة محلية ما لم يثبت API مختلف |
| فلتر المرحلة | مراحل المعلمين | فلترة محلية | لا query param مستقل | `PARTIAL` | `find-teacher.tsx:29-33` | قد لا تعرض مرحلة غير ممثلة في النتائج الحالية | لا توليد قيم بديلة |
| ترتيب التقييم | default descending rating | يعيد الترتيب محلياً | `order=avg_rating.desc` | `MATCHED` من الكود | `directory.ts:67`, `find-teacher.tsx:34-37` | null handling غير مثبت من المنصة | لا تغيير |
| ترتيب السعر | خيار واجهة الهاتف | `hourlyRate` تصاعدياً وnull في النهاية | API لا يدعم sort param | `PARTIAL` | `find-teacher.tsx:34-37` | قد يختلف عن ترتيب المنصة الأصلي | يحتاج إثبات ترتيب السعر الأصلي |
| مؤشر التوفر في بطاقة المعلم | مؤشر من days/from/to موثق | يعرض حالة مبنية على الحقول الأصلية فقط | يعيد حقول التوفر فقط | `MATCHED` منطقياً | `find-teacher.tsx` يعرض `متاح الآن` أو حالة الجدول/النقص | timezone الرسمي غير مثبت | لا تغيير حتى يثبت timezone مختلف |
| `available_days` | أيام منشورة فقط | تمرر إلى booking | يعيد array عند وجودها وإلا `[]` | `PARTIAL` | `directory.ts:114-116`, `booking.tsx:215-225` | تطبيع أسماء الأيام غير مثبت | لا إنشاء أيام افتراضية |
| `available_from/to` | حدود وقت منشورة | تمرر إلى booking | يعيد string أو null | `PARTIAL` | `directory.ts:117-118`, `booking.tsx:227-239` | parse أول ساعتين يهمل الدقائق/timezone | تصنيف semantics `UNVERIFIED` وعدم توسيعها بالتخمين |
| معلم بلا `available_days` | لا availability افتراضي | لا يعرض أياماً | يرسل `[]` | `MATCHED` من الكود | `booking.tsx:215-225, 332-334` | لا يوجد indicator في القائمة | إضافة empty state للقائمة فقط |
| معلم بلا ساعات | لا slots افتراضية | لا يعرض أوقاتاً قابلة للاختيار | يرسل null | `MATCHED` من الكود | `booking.tsx:227-239, 335+` | fallback hour داخلي غير قابل للإرسال بسبب guard | لا تغيير في منطق الحجز خارج النطاق |
| Pagination/Limit | يحتاج إثبات من المنصة | يحمل كل response | لا `limit` أو pagination | `UNVERIFIED` | لا دليل محلي على السلوك الأصلي | قائمة كبيرة قد تكون بطيئة | يحتاج دليل منصة/Production |
| Loading | loading واضح للقائمة | `LoadingBlock` | API request | `MATCHED` | `find-teacher.tsx:119` | لا skeleton خاص للبطاقات | لا تغيير |
| Error | خطأ قابل لإعادة المحاولة | `EmptyState` مع retry | catch صريح يعيد 502 عاماً | `MATCHED` | route يعالج فشل Supabase دون كشف تفاصيله | لا توجد قراءة Production حقيقية | لا تغيير |
| Empty بدون معلمين | رسالة no teachers | `EmptyState` | يرجع `[]` | `MATCHED` | `find-teacher.tsx:168-173` | لا تحقق Production فعلي | لا تغيير |
| Empty بعد فلترة محلية | رسالة no results | يختبر `visibleTeachers.length` ويعرض EmptyState | لا ينطبق | `MATCHED` | تم إصلاح الفرع الشرطي في `find-teacher.tsx` | لا توجد قراءة Production مطلوبة | لا تغيير |
| Auth بدون Bearer | Supabase Bearer مطلوب للموبايل | session client موجود | 401 إذا غاب Bearer | `MATCHED` | لا يوجد fallback محلي لمسار teachers | لا يمكن اختبار جلسة cookie legacy دون حساب حقيقي | لا تغيير |
| عدم وجود local fallback | Supabase Production فقط | لا mock في الشاشة | لا يوجد فرع Drizzle في `/teachers` | `MATCHED` | الفرع المحلي أزيل من route | بقية endpoints خارج نطاق directory قد تملك سياسات مختلفة | لا تغيير |

## 4. Mobile Comparison

### `find-teacher.tsx`

- يستخدم hook المولد `useListTeachers`.
- يرسل بحث الاسم إلى API مع debounce غير موجود؛ كل تغيير نص يغير query key ويطلب بيانات جديدة.
- يبني خيارات المراحل والمواد من response الحالي.
- يطبق الفلترة محلياً.
- يطبق sort rating/price محلياً.
- يمرر availability إلى `/booking`.
- يعرض حالة مشتقة من `availableDays`, `availableFrom`, `availableTo`: `متاح الآن` أو `جدول التوفر منشور` أو حالة نقص/خلو التوفر.
- يعرض `EmptyState` للنتيجة العامة الفارغة ولنتيجة الفلتر المحلي الفارغة.

### `booking.tsx` ضمن علاقة المعلم/المادة/التوفر

- يقرأ `public_teacher_profiles` و`teacher_subjects` مباشرة من Supabase لإعادة تحميل المواد.
- يعرض المواد المرتبطة بالمعلم فقط عند نجاح القراءة.
- يمنع الإرسال عند وجود `available_days` فارغة أو حدود الوقت ناقصة.
- يفسر الوقت بأول ساعتين من النص، وهو سلوك لم يُثبت أنه يطابق دقة المنصة.
- لا يتم توسيع أو إعادة تصميم هذا المسار في المرحلة الثالثة؛ الحجز الحقيقي خارج النطاق.

## 5. Teachers

### ما هو مثبت

- المصدر العام هو `public_teacher_profiles`.
- الاعتماد شرط ظهور في استعلام Supabase.
- `public_profiles` مصدر الاسم والصورة.
- `teacher_subjects` مع `subjects(name)` مصدر المواد.

### ما يحتاج دليلاً

- سلوك المعلم المعتمد بلا `public_profiles` row.
- عدد المراجعات وحقل النبذة في العرض العام.
- pagination/limit الأصلي.
- سياسة RLS الفعلية التي تمنع قراءة صفوف غير عامة.

## 6. Subjects

- العلاقة الحالية صحيحة من حيث الاتجاه: `teacher_subjects.teacher_id` إلى profile id ثم `subjects`.
- لا يوجد مصدر مستقل في API للهاتف لقائمة `subjects`.
- لا يجوز إنشاء مواد افتراضية أو استخدام local data.
- مادة موجودة في `subjects` بلا معلم مرتبط لا تظهر كخيار في شاشة البحث الحالية؛ حالة هذه المادة `PARTIAL/UNVERIFIED` بحسب سلوك المنصة الأصلي.

## 7. Teaching Stages

- API يعيد `public_teacher_profiles.teaching_stages` كما هي عندما تكون array.
- الهاتف يستخرج الخيارات من teachers الحالية ولا يطبع stages بديلة.
- لا يوجد endpoint مستقل لقائمة teaching stages.
- لا يجوز افتراض spelling أو canonical labels مختلفة عن Production.

## 8. Search

- البحث من API يطابق الاسم العام ومكونات الاسم واسم المادة.
- البحث يحد الإدخال إلى 80 حرفاً.
- الهاتف يعرض النص المكتوب ويعيد query عند تغييره.
- البحث الكامل في النبذة أو البريد أو aliases غير مثبت؛ لم تتم إضافته.

## 9. Filters

- فلتر المادة والمرحلة يعملان على response الحالي.
- لا يوجد فلتر توفر ظاهر للمستخدم.
- لا يوجد فحص منفصل لمرحلة الطالب قبل عرض القائمة؛ المنصة توثق filter المرحلة، ولا تثبت أن directory يجب أن يخفي المعلم غير المناسب قبل الحجز.

## 10. Sorting

- الترتيب الافتراضي في API حسب `avg_rating.desc`.
- الهاتف يوفر الأعلى تقييماً والأقل سعراً.
- null price يدفع إلى نهاية ترتيب السعر.
- ترتيب السعر الدقيق في المنصة الأصلية `UNVERIFIED`.

## 11. Approval

- `is_approved = true` موجود في Supabase query.
- لا يوجد مسار لإظهار معلم غير معتمد.
- فاعلية RLS وبيانات Production غير مثبتة بجلسة طالب حقيقية.

## 12. Availability

| الحالة | السلوك الحالي | الحالة |
|---|---|---|
| `available_days` صحيح | يمرر إلى booking وتظهر الأيام المطابقة | `MATCHED` من الكود |
| `available_days` فارغ | لا تظهر أيام قابلة للاختيار | `MATCHED` من الكود |
| `available_from/to` صحيحان | يحسب الهاتف ساعات صحيحة على مستوى الساعة | `PARTIAL` بسبب الدقائق/timezone |
| الساعات ناقصة | لا تظهر أوقات قابلة للإرسال | `MATCHED` من الكود |
| توفر غير منشور | يعرض `لا يوجد جدول توفر منشور` في بطاقة المعلم | `MATCHED` منطقياً |
| حجز فعلي متداخل | ليس جزءاً من directory؛ الحماية النهائية خارج الهاتف | `NOT_APPLICABLE` لهذه المرحلة |

## 13. Empty / Error / Loading States

- Loading: موجود في شاشة البحث.
- API error: الهاتف يملك retry، وAPI route يعيد 502 عاماً عند فشل Supabase.
- Empty query: موجود.
- Empty local filter: يعرض EmptyState بعد الإصلاح.
- Teacher without subjects: البطاقة تعرض `تخصصات المنصة` fallback نصياً؛ هذا ليس بيانات مادة بديلة، لكنه قد يخفي أن الربط فارغ. سلوك المنصة الأصلي `UNVERIFIED`.
- Teacher without availability: booking يعرض حالة عدم توفر، وdirectory يعرض حالة الجدول في البطاقة.

## 14. Authentication & Authorization

- `requireUser` يعتمد على `req.isAuthenticated()`.
- middleware يستطيع قبول session cookie legacy أو Supabase Bearer.
- `/teachers` يفرض Bearer ودور الطالب، ولا يستخدم DB محلية بديلة.
- هذا يطابق قاعدة المرحلة الحالية: تطبيق الهاتف يصل إلى مصدر Supabase عبر Bearer فقط.
- لا توجد كتابة Production في هذا التدقيق.

## 15. MISMATCH Addressed

1. `/teachers` كان يسمح بفرع قاعدة محلية منفصلة عند غياب Bearer — أزيل.
2. `/teachers` لم يكن يفرض `student` role — أضيف الفحص.
3. القائمة لم تكن تعرض حالة التوفر الموثقة — أضيف مؤشر مبني على الحقول الأصلية.
4. الفلتر المحلي الذي ينتج صفر نتائج لم يكن يعرض EmptyState — أضيفت الحالة.

## 16. Confirmed PARTIAL

1. قائمة المواد والمراحل مشتقة من teachers الحالية ولا تستخدم source مستقل.
2. الملف المعاد للهاتف لا يشمل bio أو عدد المراجعات الموثقين.
3. التوفر يمرر حقول المصدر، لكن تفسير الوقت في الهاتف بدقة الساعة فقط.
4. sort السعر موجود في الهاتف دون إثبات أنه نفس ترتيب المنصة.

## 17. UNVERIFIED

- القيمة الفعلية وتركيب rows في Production بحساب طالب مصرح.
- RLS الفعلي لـ`public_teacher_profiles`, `public_profiles`, `teacher_subjects`, و`subjects`.
- pagination/limit الأصلي.
- عدد المراجعات والحقل المعتمد للنبذة.
- timezone ودقة الدقائق في `available_from/to`.
- التطبيع الرسمي لأسماء الأيام.
- السلوك الأصلي لمادة بلا teachers أو stage غير ممثل في نتائج البحث.

## 18. BLOCKED

لا توجد عملية يمكن تنفيذها بأمان إذا تطلبت:

- تعديل Production Database أو schema أو columns.
- تعديل RLS أو RPC أو Functions أو Triggers.
- تعديل Auth/OAuth أو Storage/Reatime أو VPS/Nginx/Kong.
- إنشاء availability أو subjects أو stages افتراضية.
- إنشاء بيانات اختبار داخل Production.

## 19. Files Changed

التغييرات الفعلية:

- `TEACHERS_SUBJECTS_AVAILABILITY_PARITY_REPORT.md`
- `artifacts/ajyal-mobile/app/find-teacher.tsx`
- `artifacts/api-server/src/routes/directory.ts`
- لم يتغير `lib/api-spec` أو العقود.

## 20. Verification After Fix

- `pnpm --filter @workspace/api-server run typecheck` — PASS.
- `pnpm --filter @workspace/ajyal-mobile run typecheck` — PASS.
- `pnpm run typecheck:libs` — PASS.
- `pnpm --filter @workspace/api-server run build` — PASS.
- `pnpm --filter @workspace/ajyal-mobile run build` — PASS؛ Android/iOS bundles وmanifests و44 asset نجحت.
- `git diff --check` — PASS.
- `GET http://127.0.0.1:8080/api/healthz` — `200 {"status":"ok"}`.
- `GET http://127.0.0.1:8080/api/teachers` بدون Authorization — `401`.
- API وExpo workflows يعملان بعد إعادة التشغيل.
- تحذير `libglib-2.0.so.0` بقي كما هو؛ يؤثر على React Native DevTools الاختياري، لا على Metro أو bundle.
- لم يتم تنفيذ طلب authenticated إلى Production.
- لم يتم تنفيذ حجز أو دفع أو كتابة.

## 21. Production Safety

| العملية | النتيجة |
|---|---|
| Database changed | NO |
| Schema changed | NO |
| RLS changed | NO |
| RPC changed | NO |
| Functions changed | NO |
| Triggers changed | NO |
| Auth changed | NO |
| Storage Policies changed | NO |
| Realtime changed | NO |
| VPS changed | NO |
| Main platform code changed | NO |
| Production writes | NO |

## 22. Remaining Gaps

- إثبات بيانات القائمة بحساب طالب حقيقي.
- إثبات RLS الفعلي للجداول العامة.
- تثبيت source/contract مستقل لقائمة subjects وteaching stages إن كان مطلوباً.
- إثبات bio وعدد المراجعات وpagination.
- تثبيت timezone ودقة الدقائق في availability.
- تصنيف أي قراءة Production غير منفذة كـ`UNVERIFIED`.

## 23. Stopping Point

تم التوقف بعد إنجاز المرحلة الثالثة ضمن حدودها:

1. جعل `/teachers` Supabase-only ومحمياً بدور الطالب.
2. إضافة catch صريح لخطأ directory API.
3. إصلاح EmptyState بعد الفلترة المحلية.
4. إظهار مؤشر توفر مبني فقط على `available_days/from/to` دون إنشاء توفر.
5. إعادة تشغيل فحوص mobile/API/build/bundles.

**مهم:** لا تبدأ المرحلة الرابعة، الاشتراكات، الدفع، أو الحجز بعد هذا التقرير.