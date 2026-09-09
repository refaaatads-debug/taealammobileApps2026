# Baseline Audit — Auth / Role / Navigation Parity

**تاريخ التدقيق:** 2026-09-05  
**النطاق:** المرحلة الأولى فقط: AUTH، PROFILE، ROLES، NAVIGATION، DASHBOARD  
**المكونات:** `artifacts/ajyal-mobile` و`artifacts/api-server` وعقود API والمخططات الهندسية المرفقة  
**نوع التدقيق:** قراءة وتحليل قبل التنفيذ

## 1. قواعد التدقيق

تم تطبيق القواعد التالية:

- منصة الويب وSupabase Production هما مصدر الحقيقة.
- لا تعديل على Production أو Schema أو RLS أو RPC أو Functions أو Triggers أو Auth/OAuth settings.
- لا تعديل على VPS أو Docker أو Nginx أو Kong أو GoTrue أو PostgREST.
- لا بيانات تجريبية ولا قاعدة بديلة لمحاكاة Production.
- أي معلومة لا يمكن إثباتها من المخططات أو الكود معلّمة `UNVERIFIED`.
- الإصلاحات المسموحة محصورة في تطبيق الهاتف وAPI الخاص به.

## 2. مصادر المقارنة

### مصادر المنصة والمواصفات

- `attached_assets/platform-master-integrated-architecture_1788629894258.md`
- `attached_assets/student-dashboard-architecture_1788629894440.md`
- `attached_assets/teacher-dashboard-architecture_1788629894486.md`
- `attached_assets/Pasted--OAuth-Supabase--1788459122115_1788459122115.txt`
- الملف المرفق: `Pasted--1-BASELINE-AUDIT-AUTH-ROLE-NAVIGATION-PARITY-Produc-17_1788632064339.txt`

### مصادر التطبيق وAPI

- `artifacts/ajyal-mobile/lib/supabase.ts`
- `artifacts/ajyal-mobile/lib/auth.tsx`
- `artifacts/ajyal-mobile/app/_layout.tsx`
- `artifacts/ajyal-mobile/app/auth/callback.tsx`
- `artifacts/ajyal-mobile/app/forgot-password.tsx`
- `artifacts/ajyal-mobile/hooks/useAjyal.tsx`
- `artifacts/ajyal-mobile/app/(tabs)/index.tsx`
- `artifacts/api-server/src/lib/supabaseAuth.ts`
- `artifacts/api-server/src/middlewares/authMiddleware.ts`
- `artifacts/api-server/src/routes/profile.ts`
- `artifacts/api-server/src/routes/learning.ts`

## 3. حالات التقرير

| الحالة | معناها |
|---|---|
| `MATCHED` | السلوك والعقد مثبتان ومتوافقان من المصادر المتاحة |
| `PARTIAL` | جزء من السلوك موجود، لكن توجد فجوة محددة أو نطاق الهاتف أضيق |
| `MISMATCH` | اختلاف مؤكد في كود الهاتف/API عن العقد الموثق |
| `UNVERIFIED` | لا يمكن إثباته دون Production أو إعداد خارجي أو حساب حقيقي |

## 4. جدول التدقيق الأساسي

### 4.1 AUTH

| المجال | المنصة الأصلية | التطبيق الحالي | الحالة | الملف | الخطورة |
|---|---|---|---|---|---|
| Supabase URL | نطاق Supabase/النطاق المخصص للمنصة | `EXPO_PUBLIC_SUPABASE_URL` مع fallback إلى `https://ajyalalmaerifa.com` | `PARTIAL` — قيمة Production الفعلية في بيئة البناء غير قابلة للإثبات من الكود فقط | `artifacts/ajyal-mobile/lib/supabase.ts` | P1 |
| Auth client | Supabase Auth client | `createClient` من `@supabase/supabase-js` | `MATCHED` | `lib/supabase.ts` | P0 |
| session persistence | استمرار الجلسة عبر Auth storage | SecureStore native وAsyncStorage web، مع `persistSession: true` | `MATCHED` | `lib/supabase.ts` | P0 |
| access token | JWT المستخدم يرسل إلى الخدمات المحمية | `getAuthToken()` يقرأ `session.access_token` وAPI client يرسله كـBearer | `MATCHED` | `lib/auth.tsx`, `app/_layout.tsx` | P0 |
| refresh token | تجديد تلقائي للجلسة | `autoRefreshToken: true`، وSupabase يدير التجديد | `MATCHED` | `lib/supabase.ts` | P0 |
| PKCE | تدفق Auth يعتمد PKCE | `flowType: "pkce"`، وOAuth native يستبدل code عبر `exchangeCodeForSession` | `MATCHED` | `lib/supabase.ts`, `lib/auth.tsx` | P0 |
| `getSession` | استعادة الجلسة عند بدء التطبيق | موجود مع مهلة 12 ثانية وحماية من race condition | `MATCHED` | `lib/auth.tsx` | P0 |
| `onAuthStateChange` | تحديث الهوية عند login/logout/refresh | listener موجود ويحدّث المستخدم وحالة التحميل | `MATCHED` | `lib/auth.tsx` | P0 |
| `signInWithPassword` | دخول البريد وكلمة المرور | مطبق مع تطبيع البريد وتحديث UI الفوري | `MATCHED` | `lib/auth.tsx` | P0 |
| `signUp` الطالب | إنشاء مستخدم مع بيانات الحساب | مطبق مع `role: student` في metadata، لكن إثبات إنشاء role في `user_roles` يعتمد على Production | `PARTIAL` | `lib/auth.tsx` | P1 |
| `signUp` المعلم بالبريد | تسجيل معلم عبر مسار طلب الدور/الدور الأصلي | metadata تحتوي `role: teacher` فقط؛ لا تحفظ `pending_role` ولا تستدعي `set_new_user_role` بعد تسجيل البريد | `MISMATCH` | `lib/auth.tsx` | P0 |
| `signOut` | إنهاء جلسة المستخدم | `scope: "local"` مع تنظيف UI وPush token best-effort | `PARTIAL` — مناسب لعميل الهاتف، لكن سلوك الإنهاء العالمي للمنصة غير مثبت | `lib/auth.tsx` | P1 |
| Google OAuth | callback عبر Supabase ثم redirect إلى التطبيق | `signInWithOAuth` مع redirect native/web، وexchange أو hash session native | `PARTIAL` | `lib/auth.tsx`, `app/auth/callback.tsx` | P1 |
| Deep links | رابط mobile مضاف إلى Auth/Supabase ويفتح callback | scheme ومسار callback موجودان، لكن allowlist وGoogle/Supabase Production لا يمكن إثباتها قراءةً فقط | `UNVERIFIED` | `app.json`, `lib/auth.tsx` | P0 |
| callback handling | استلام code/session ثم بناء الجلسة | native يعالج النتيجة في `openAuthSessionAsync`، والويب يعتمد `detectSessionInUrl` ثم شاشة callback | `PARTIAL` — لا يوجد مسار مستقل لاستكمال reset password | `lib/auth.tsx`, `app/auth/callback.tsx` | P1 |
| forgot password | `/forgot-password` ثم `/reset-password` وتحديث كلمة المرور | إرسال رابط موجود، لكن لا توجد شاشة reset ولا `updateUser({ password })` | `MISMATCH` | `app/forgot-password.tsx`, `app/auth/callback.tsx` | P1 |

### 4.2 PROFILE

| المجال | المنصة الأصلية | التطبيق الحالي | الحالة | الملف | الخطورة |
|---|---|---|---|---|---|
| هوية المستخدم | `auth.users.id` | Supabase user هو مصدر `req.user.id` | `MATCHED` | `lib/auth.tsx`, `supabaseAuth.ts` | P0 |
| ربط الملف | `profiles.user_id = auth.uid()` | API يقرأ `profiles` بالـ`user_id` المستخرج من Bearer | `MATCHED` | `supabaseAuth.ts` | P0 |
| الاسم | `profiles.full_name` | `full_name` ثم اشتقاق first/last/display name | `MATCHED` | `routes/profile.ts` | P1 |
| الصورة | `profiles.avatar_url` | `avatar_url` مع fallback إلى Auth metadata | `MATCHED` | `routes/profile.ts` | P1 |
| الهاتف | profile field في المنصة | لا يُعاد في عقد `UserProfile` ولا يعرضه bootstrap | `PARTIAL` | `routes/profile.ts`, `UserProfile` | P1 |
| حقول الطالب | ملف الطالب واكتماله وبياناته | عقد الملف الحالي يعيد الهوية والدور والحظر فقط | `PARTIAL` | `routes/profile.ts` | P1 |
| حقول المعلم | ملف المعلم والاعتماد | `teacher_profiles.is_approved` موجود، لكن بقية حقول المعلم ليست جزءاً من bootstrap | `PARTIAL` | `supabaseAuth.ts`, `routes/profile.ts` | P1 |
| profile missing/error | عدم فتح مساحة الطالب عند غياب الملف | root يحجب التطبيق ويعرض إعادة المحاولة/الخروج | `MATCHED` | `app/_layout.tsx` | P0 |

### 4.3 ROLES

| المجال | المنصة الأصلية | التطبيق الحالي | الحالة | الملف | الخطورة |
|---|---|---|---|---|---|
| مصدر الدور | `user_roles`، لا قيمة محلية غير موثوقة | API يقرأ `user_roles` مع Bearer | `MATCHED` | `supabaseAuth.ts`, `routes/profile.ts` | P0 |
| الدور الأساسي | `student`, `teacher`, `admin`, `parent` | الأنواع الأربع موجودة في API والعقد | `MATCHED` | `supabaseAuth.ts`, `api-zod` | P0 |
| أولوية الأدوار | `admin -> teacher -> parent -> student` | نفس الترتيب في `roleOrder` | `MATCHED` | `routes/profile.ts` | P0 |
| admin | تحويل إلى `/admin` في المنصة | الهاتف لا يفتح مساحة admin ويعرض أن الدور غير مدعوم | `PARTIAL` — لا يجوز إضافة لوحة إدارية للهاتف دون نطاق صريح | `app/_layout.tsx` | P1 |
| teacher | `/teacher` مع اعتماد المعلم | teacher لا يمر إلا عند `teacherApproved === true` | `MATCHED` | `app/_layout.tsx`, `routes/profile.ts` | P0 |
| student | `/student` | المسار الجذري يفتح تجربة الطالب عند الدور student فقط | `MATCHED` | `app/_layout.tsx` | P0 |
| parent | `/parent` إن كان مدعوماً في المنصة | الدور معروف في API لكنه محجوب على الهاتف | `PARTIAL` — وجود مسار المنصة لا يثبت أن mobile يجب أن يدعمه | `routes/profile.ts`, `app/_layout.tsx` | P1 |
| role unresolved | لا fallback إلى student | root يمنع فتح التطبيق بلا profile/role مؤكد، لكن قيمة context الداخلية الافتراضية ما زالت `student` | `PARTIAL` — لا تظهر للمستخدم مع الحارس الحالي، لكنها نقطة يجب عزلها | `hooks/useAjyal.tsx`, `app/_layout.tsx` | P1 |
| teacher approval | `teacher_profiles.is_approved` وProtectedRoute | `false` يعرض انتظاراً، و`null` يعرض تعذر التحقق، ولا يفتح dashboard | `MATCHED` | `supabaseAuth.ts`, `app/_layout.tsx` | P0 |
| ban guard | الحظر يمنع الوصول غير الإداري | API يقرأ `user_warnings.is_banned`، وroot يمنع الحساب المحظور | `MATCHED` | `supabaseAuth.ts`, `routes/profile.ts`, `app/_layout.tsx` | P0 |
| API authorization | كل طلب محمي بالهوية وRLS | Bearer يسبق cookie، ومسارات التعليم تتحقق من الدور/المالك في الكود وRLS | `PARTIAL` — RLS وRPC الفعلية لا يمكن إثباتها | `authMiddleware.ts`, `learning.ts` | P0 |

### 4.4 NAVIGATION

| المجال | المنصة الأصلية | التطبيق الحالي | الحالة | الملف | الخطورة |
|---|---|---|---|---|---|
| بعد login | `/dashboard` ثم التحويل حسب الدور | `homeReady` يوجه إلى `/` التي تمثل tabs index | `MATCHED` ضمن تجربة الهاتف | `app/_layout.tsx` | P0 |
| student destination | `/student` | `/` مع محتوى الطالب | `PARTIAL` — اختلاف مسار العرض متعمد في Expo | `app/_layout.tsx`, `app/(tabs)/index.tsx` | P1 |
| teacher destination | `/teacher` | `/` مع لوحة المعلم عند role teacher | `PARTIAL` — اختلاف مسار العرض متعمد في Expo | `app/(tabs)/index.tsx` | P1 |
| admin destination | `/admin` | لا توجد شاشة admin على الهاتف | `PARTIAL` | `app/_layout.tsx` | P1 |
| parent destination | `/parent` | لا توجد شاشة parent على الهاتف | `PARTIAL` | `app/_layout.tsx` | P1 |
| same-path replace | لا يعاد تركيب المسار الحالي | `if (pathname !== "/") router.replace("/")` | `MATCHED` | `app/_layout.tsx` | P0 |
| logout navigation | إزالة الجلسة وإظهار الدخول | auth user يُصفّر فوراً ثم query cache يُمسح | `MATCHED` | `lib/auth.tsx`, `hooks/useAjyal.tsx` | P0 |
| session restoration | loading واضح ثم dashboard أو login | splash/bootstrap loading مع timeout وحالات خطأ مرئية | `MATCHED` | `lib/auth.tsx`, `app/_layout.tsx` | P0 |
| callback route | route مستقل بعد OAuth | route موجود ويكمل pending role ثم يرجع للجذر | `PARTIAL` — reset password غير مكتمل | `app/auth/callback.tsx` | P1 |

### 4.5 DASHBOARD

| المجال | المنصة الأصلية | التطبيق الحالي | الحالة | الملف | الخطورة |
|---|---|---|---|---|---|
| profile loading | profile وrole قبل dashboard | `useGetMyProfile` مفعّل بعد Auth، وroot يحجب العرض حتى ينجح | `MATCHED` | `hooks/useAjyal.tsx`, `app/_layout.tsx` | P0 |
| student endpoint | sessions, assignments, notifications وبيانات الملف | `GET /sessions`, `GET /assignments`, `GET /notifications`, `GET /me` | `MATCHED` جزئياً | `app/(tabs)/index.tsx`, `learning.ts`, `profile.ts` | P1 |
| teacher endpoint | dashboard يعتمد بيانات المعلم والطلبات والجلسات والتنبيهات | `GET /teacher-dashboard` يقرأ teacher profile/bookings/earnings/students/notifications/warnings | `PARTIAL` — يعتمد قراءات مباشرة وRLS/production غير مثبتة | `learning.ts` | P1 |
| permissions | dashboard queries محكومة بالدور وملكية المستخدم | teacher query لا يعمل إلا عند teacher، student queries لا تعمل للمعلم | `MATCHED` في التطبيق، `UNVERIFIED` بالنسبة لـRLS | `app/(tabs)/index.tsx`, `learning.ts` | P0 |
| notifications | badge وبيانات dashboard | الطالب يقرأ API؛ المعلم يحسب unread من teacher dashboard | `PARTIAL` | `app/(tabs)/index.tsx` | P1 |
| role-specific UI | أقسام الطالب/المعلم مختلفة | `DashboardActions` وMore والقوائم تتغير حسب الدور | `MATCHED` ضمن student/teacher | `app/(tabs)/index.tsx`, `app/(tabs)/more.tsx` | P1 |
| admin/parent dashboard | لوحات منفصلة في المنصة | لا dashboard mobile لهذين الدورين | `PARTIAL`، وليس MISMATCH مؤكداً لنطاق تطبيق الطالب/المعلم | `app/_layout.tsx` | P1 |

## 5. الإصلاحات المؤكدة قبل التنفيذ

### MISMATCH 1 — تسجيل المعلم بالبريد

في `login("signup")` يتم إرسال `role` داخل Auth metadata فقط. أما `set_new_user_role` فيُستدعى عبر `pending_role` لمسار Google للمعلم فقط. لذلك لا يوجد مسار مكافئ للمعلم الذي يسجل بالبريد، خصوصاً بعد تأكيد البريد أو إعادة فتح التطبيق.

**الإصلاح المسموح:** حفظ دور المعلم المطلوب محلياً عند بدء التسجيل، ثم استكماله بعد إنشاء جلسة Auth أو عند أول bootstrap مصادق عليه، باستخدام RPC الأصلي فقط. لا يتم إنشاء صف `user_roles` من الهاتف مباشرة.

### MISMATCH 2 — إعادة تعيين كلمة المرور

يوجد `resetPasswordForEmail` فقط. المسار المعاد من البريد يفتح callback، لكن callback لا يميز `PASSWORD_RECOVERY` ولا يعرض كلمة مرور جديدة ولا يستدعي `updateUser`. كما لا توجد شاشة `/reset-password` رغم وجودها في عقد المنصة.

**الإصلاح المسموح:** إضافة شاشة reset داخل الهاتف وربطها بحالة `PASSWORD_RECOVERY` و`supabase.auth.updateUser`. لا يتم تعديل Auth settings أو redirect allowlist من الكود.

## 6. البنود التي لن تُصلح بالتخمين

- قيمة Supabase URL/المفتاح الفعليين في بيئة Production.
- allowlist الخاصة بـSupabase وGoogle للـDeep Links.
- نجاح OAuth على جهاز فعلي وبعد إغلاق التطبيق.
- RLS expressions وRPC security mode وTriggers.
- وجود حاجة فعلية لدعم admin/parent في تطبيق الهاتف.
- اكتمال حقول profile الإضافية المطلوبة في Production.
- sign-out العالمي المطلوب للمنصة مقابل local sign-out المناسب للهاتف.

## 7. قرار المرحلة

قبل الإصلاح:

- الإصلاحات المؤكدة: 2.
- البنود `MATCHED`: أساسيات Auth persistence، token flow، session hydration، role priority، teacher approval، ban guard، same-path navigation، loading/error guards.
- البنود `PARTIAL`: profile fields، OAuth callback، mobile role surface، dashboard parity.
- البنود `UNVERIFIED`: Production OAuth/deep-link configuration وRLS/RPC/Triggers والاختبارات بحسابات حقيقية.

لن يتم الانتقال إلى المرحلة الثانية أو تعديل Production. بعد تطبيق الإصلاحين المؤكدين فقط، يجب تشغيل TypeScript وAPI typecheck/build وMetro وAndroid/iOS bundle إن سمحت بيئة البناء، ثم إصدار تقرير نهائي منفصل.

## 8. التقرير النهائي بعد الإصلاح

### 8.1 ما كان غير مطابقاً

1. تسجيل المعلم بالبريد كان يرسل `role` داخل metadata فقط، ولا يحفظ دوراً معلّقاً ولا يستدعي RPC الدور الأصلي بعد تسجيل الدخول.
2. استعادة كلمة المرور كانت ترسل البريد فقط؛ لم تكن هناك شاشة لتحديث كلمة المرور، ولم يكن callback يميز حالة `PASSWORD_RECOVERY`.
3. على native، رابط الاستعادة قد يحتوي tokens في fragment، بينما `detectSessionInUrl` غير مفعّل native؛ لذلك كان يلزم تحويل الـdeep link إلى جلسة Supabase صراحةً.

### 8.2 ما تم إصلاحه

- تسجيل دور المعلم بالبريد أصبح يحفظ الدور المطلوب محلياً مع بريد الحساب، ثم يستكمل الدور عبر `set_new_user_role` بعد وجود جلسة مصادق عليها.
- تسجيل الدخول اللاحق بعد تأكيد البريد يكمل الدور المعلّق للحساب الصحيح فقط.
- مسار Google يمسح بريد الدور المعلّق القديم حتى لا يمنع حساب Google مختلفاً.
- تمت إضافة `isPasswordRecovery` إلى سياق المصادقة.
- callback يستقبل:
  - `access_token` و`refresh_token` من native fragment.
  - `code` من PKCE.
  - أخطاء OAuth/reset من query أو fragment.
- تمت إضافة شاشة `/reset-password` للتحقق من كلمة المرور وتأكيدها ثم استدعاء `supabase.auth.updateUser`.
- بعد نجاح التحديث تعود الجلسة إلى dashboard دون تسجيل خروج قسري.
- لا يزيل حدث `SIGNED_IN` حالة recovery قبل اكتمال تحديث كلمة المرور؛ الحالة تُغلق بعد نجاح العملية أو `SIGNED_OUT`.

### 8.3 الملفات التي تغيرت

- `BASELINE_AUTH_ROLE_NAVIGATION_PARITY_REPORT.md`
- `artifacts/ajyal-mobile/lib/auth.tsx`
- `artifacts/ajyal-mobile/app/auth/callback.tsx`
- `artifacts/ajyal-mobile/app/reset-password.tsx`
- `artifacts/ajyal-mobile/app/_layout.tsx`

### 8.4 ما بقي PARTIAL

- حقول الهاتف وحقول الطالب/المعلم الإضافية لا تدخل في عقد bootstrap الحالي.
- لوحة الهاتف تستخدم `/` كواجهة dashboard بدلاً من مسارات الويب `/student` و`/teacher`.
- admin وparent معروفان في API لكن لا توجد لهما لوحات هاتف؛ الهاتف ما زال نطاقه الطالب/المعلم.
- لوحة المعلم تعتمد عدة قراءات Supabase مباشرة، ولا تزال parity الكاملة مع لوحة الويب غير مثبتة.
- sign-out المحلي مناسب لعميل الهاتف، لكن الفرق بين local/global sign-out في المنصة الأصلية يحتاج قراراً واختباراً صريحاً.

### 8.5 ما بقي UNVERIFIED

- allowlist الفعلية لـSupabase وGoogle للـdeep links.
- OAuth وreset password على جهاز Android/iOS فعلي وبعد إغلاق التطبيق.
- RLS expressions وRPC security mode وTriggers في Production.
- تحقق الدور واعتماد المعلم والحظر بحسابات حقيقية منفصلة.
- اكتمال profile fields الفعلية في Production.

### 8.6 الفحوصات الناجحة

- `pnpm --filter @workspace/ajyal-mobile run typecheck`
- `pnpm --filter @workspace/api-server run typecheck`
- `pnpm --filter @workspace/api-server run build`
- `EXPO_BUILD_PORT=22032 pnpm --filter @workspace/ajyal-mobile run build`
  - iOS bundle: نجح
  - Android bundle: نجح
  - iOS manifest: نجح
  - Android manifest: نجح
  - معالجة 44 asset: نجحت
- Expo Metro startup بعد آخر تعديل: نجح.
- شاشة `/login` ظهرت في المعاينة دون أخطاء JavaScript.
- `git diff --check`: نجح.

### 8.7 التحذيرات المتبقية

- `libglib-2.0.so.0` مفقود من بيئة NixOS، ويؤثر على React Native DevTools الاختياري فقط؛ Metro وWeb/Android/iOS bundles استمرت بنجاح.
- تحذيرات Expo الحالية الخاصة بـ`shadow*` وReduced Motion موجودة مسبقاً ولا تمنع التشغيل.
- لم تُنفذ عملية Login/Signup/Logout أو reset بحساب حقيقي آلياً، التزاماً بعدم طلب أو استخدام كلمات مرور أو tokens المستخدم.

### 8.8 تأكيدات التغيير

| البند | النتيجة |
|---|---|
| Database changed | NO |
| Schema changed | NO |
| RLS changed | NO |
| RPC changed | NO |
| Functions changed | NO |
| Triggers changed | NO |
| Auth settings changed | NO |
| VPS changed | NO |
| Main platform code changed | NO |
| Production writes | NO |

**قرار المرحلة:** انتهت المرحلة الأولى فقط. لم يتم الانتقال إلى مرحلة الحجوزات أو المالية أو أي تغيير في Production.
