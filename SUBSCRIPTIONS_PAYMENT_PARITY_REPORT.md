# تقرير مطابقة الاشتراكات والباقات والدفع والعودة من الدفع

**تاريخ التدقيق:** 2026-09-06  
**نطاق المرحلة:** الاشتراكات، تعريف الباقات، الاشتراك الفعال، اكتمال الملف، promo code، Checkout، provider، حالات الدفع، Payment Return، وروابط Android/iOS.  
**حدود التنفيذ:** لم يتم تنفيذ Checkout أو دفع حقيقي، ولم تتم أي كتابة على Production أو تعديل في Supabase أو Edge Functions أو Stripe أو المخطط أو RLS أو RPC أو Triggers أو Storage أو Realtime أو VPS.

## منهجية ومصادر الحقيقة

تمت المقارنة بين:

- مخططات المنصة المرفقة، خصوصاً:
  - `attached_assets/Pasted--4-SUBSCRIPTIONS-PLANS-CHECKOUT-PAYMENT-RETURN--1788634_1788634004988.txt`
  - `attached_assets/full-session-booking-finance-assignments-architecture_1788629894391.md`
  - `attached_assets/student-dashboard-architecture_1788629894440.md`
- تطبيق الهاتف:
  - `artifacts/ajyal-mobile/components/ConnectedSectionScreen.tsx`
  - `artifacts/ajyal-mobile/app/subscriptions.tsx`
  - `artifacts/ajyal-mobile/app/subscription.tsx`
  - `artifacts/ajyal-mobile/app/_layout.tsx`
  - `artifacts/ajyal-mobile/app/auth/callback.tsx`
  - `artifacts/ajyal-mobile/app.json`
- خادم الـAPI:
  - `artifacts/api-server/src/routes/index.ts`
  - `artifacts/api-server/src/routes/learning.ts`
  - `lib/api-spec/openapi.yaml`

المصدر المالي الملزم هو الحالة المؤكدة في الخادم/قاعدة البيانات/المزود وفق ما يثبته المصدر الأصلي. لا تعتبر إعادة التوجيه إلى `success_url` وحدها نجاحاً للدفع.

## جدول المقارنة قبل الإصلاح

| FEATURE | PLATFORM SOURCE | API SOURCE | MOBILE SOURCE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| تعريف الباقات | `subscription_plans`، وحقول `tier`, `name_ar`, `price`, `sessions_count`, `session_duration_minutes`, `has_ai_tutor`, `has_recording`, `has_priority_booking` | لا يوجد endpoint مستقل للباقات | قراءة مباشرة من `subscription_plans` مع `select("*")` | MATCHED | مصدر المنصة يحدد الجدول والحقول؛ التطبيق يقرأ الجدول نفسه ولا ينشئ قائمة ثابتة | متوسط | لا تغيير مطلوب في هذه المرحلة |
| ترتيب الباقات | قراءة الباقات من المصدر وترتيب السعر عند العرض | لا يوجد ترتيب API مستقل | `.order("price", { ascending: true })` | MATCHED | `ConnectedSectionScreen.tsx` | منخفض | لا تغيير |
| السعر | السعر من `subscription_plans.price` وتحويله في Checkout الأصلي إلى Stripe cents | لا يحسب السعر ولا يقبل سعراً من الهاتف | يعرض `price` القادم من Supabase | MATCHED | لا توجد قيمة سعرية بديلة في التطبيق | عالٍ إذا أضيف سعر محلي لاحقاً | إبقاء السعر server-authoritative |
| الدقائق/مدة الجلسة | `session_duration_minutes` مثبتة في `user_subscriptions` عند الإنشاء، ورصيد الطالب من الاشتراكات الفعالة | `learning.ts` يجمع `remaining_minutes` من عدة اشتراكات فعالة للحجز واللوحة | يعرض `session_duration_minutes` من الخطة ويجمع الدقائق من الصفوف الفعالة | PARTIAL | API اللوحة يقرأ مدة الخطة من `subscription_plans` وليس القيمة المثبتة داخل الاشتراك؛ الهاتف لا يملك مسار دفع مستقل | عالٍ | عدم تغيير مالي غير مثبت؛ توثيق الفرق وإبقاء الخصم في المصدر |
| اختيار الاشتراك الفعال للعرض | المصدر يثبت شروط الفعالية: `is_active=true`, `remaining_minutes>0`, و`ends_at>now()` | اللوحة ترتب `ends_at` وتختار أول صف للعرض، مع جمع كل الدقائق | يختار أول active، ثم fallback لأول اشتراك حتى لو لم يكن فعالاً | MISMATCH | `ConnectedSectionScreen.tsx`: `activeRows[0] ?? subscriptions[0]` | عالٍ: قد يظهر اشتراك منتهٍ كأنه الحالي | إزالة fallback غير الفعال، وجعل العرض بلا اشتراك فعال عند عدم وجود صف مؤهل |
| تجميع الرصيد عند تعدد الاشتراكات | جميع الاشتراكات الفعالة تدخل في الرصيد | `getBookingSubscription` وdashboard يستخدمان `reduce` على الصفوف المؤهلة | يجمع الدقائق والجلسات من `activeRows` | MATCHED | `learning.ts` و`ConnectedSectionScreen.tsx` | متوسط | لا تغيير |
| صلاحية `ends_at` | `ends_at > now` وفق وصف المنصة؛ null ليس مثبتاً كاشتراك منتهٍ في كل السياقات | بعض استعلامات API تستخدم `is.null` أو `gte` | `subscriptionStatus` يعتبر الصف فعالاً إذا لم ينتهِ، لكنه لا يفرض وجود `ends_at` | PARTIAL | اختلاف null/`gte` بين المصادر وعدم وجود عقد موحد للعرض | عالٍ | لا اختراع سياسة انتهاء؛ إبقاء السلوك الموثق في التقرير واعتبار الحالات غير المثبتة UNVERIFIED |
| حالة `is_active` | الحقل جزء من شرط الاشتراك الفعال | API يقيده في استعلامات الرصيد واللوحة | الهاتف يقرأ الحقل ويصنفه | MATCHED | الاستعلامات والحسابات الحالية | متوسط | لا تغيير |
| حالة depleted | الاشتراك لا يدخل الرصيد إذا `remaining_minutes <= 0` | API يفرض `remaining_minutes=gt.0` عند الحجز، واللوحة تجمع الصفوف دون هذا الشرط | الهاتف يصنفه منتهياً ولا يجمعه في `activeRows` | PARTIAL | اختلاف dashboard API عن شروط الرصيد الموثقة | عالٍ: قد تعرض اللوحة اشتراكاً فعالاً بلا دقائق | إصلاح API dashboard ليستخدم نفس شرط الرصيد عند اختيار/عرض balance، مع الحفاظ على إحصاءات الاشتراكات إن لزم |
| اكتمال ملف الطالب | يتطلب `profiles.full_name`, `phone`, `teaching_stage` قبل المسارات المالية/التعليمية الحساسة | dashboard يحسب الحقول الناقصة | الهاتف يحسب `profileComplete` من الحقول الثلاثة | MATCHED | `learning.ts` و`ConnectedSectionScreen.tsx` | متوسط | لا تغيير |
| منع الشراء مع ملف ناقص | المنصة تشترط اكتمال الملف قبل إتمام المسار | لا يوجد Checkout API محلي يفرض الشرط | زر اختيار الباقة لا يمنع بوضوح عند `profileComplete=false`؛ المنع/التحقق الفعلي في Edge Function غير ظاهر | UNVERIFIED | لا يوجد عقد محلي يثبت قرار الخادم | عالٍ | لا إضافة رفض محلي قد يختلف عن المصدر؛ يلزم إثبات Edge Function أو عقد API |
| Promo code | `create-checkout` يستقبل `promo_code` ويطبقه على Stripe لا على دقائق الاشتراك | لا route محلي | الهاتف يرسل قيمة promo إلى Edge Function | MATCHED | payload الموثق ومسار `create-checkout` | متوسط | لا تغيير |
| Checkout endpoint | Supabase Edge Function `create-checkout` | لا يوجد route checkout في API المحلي | `supabase.functions.invoke("create-checkout")` | MATCHED | التطبيق يستخدم نفس اسم الوظيفة الموثق | عالٍ إذا فُرض API محلي بديل | لا إنشاء route بديل |
| Checkout payload | `plan_id`, `success_url`, `cancel_url`, `promo_code` | لا يوجد عقد OpenAPI للـCheckout | الهاتف يرسل الحقول المذكورة | MATCHED | `ConnectedSectionScreen.tsx` والتوثيق المرفق | عالٍ إذا تغيّر contract | لا تغيير |
| Provider | Stripe هو المزود الموثق | لا يوجد provider flow في API المحلي | الهاتف لا يتعامل مع provider مباشرة؛ يفتح الرابط المعاد | MATCHED | مخططات المنصة و`create-checkout` | عالٍ | لا تغيير provider |
| أخطاء Checkout | المنصة/Edge Function هي مصدر قرار الخطأ | لا route محلي | الهاتف يعرض خطأ الاستدعاء ويفك `data.url`; لا يوجد contract تفصيلي للحالات | PARTIAL | catch في `checkout()`، مع نقص عقد حالات الخطأ | متوسط | تحسين رسالة/حالة الهاتف فقط دون اختراع حالات مالية |
| الدفع الناجح | يجب تأكيده من Webhook/الخادم/قاعدة البيانات وبشكل idempotent حسب معرف Stripe | لا يوجد route/تحقق Payment Return واضح | يفتح `data.url` ولا يثبت حالة الدفع بعد العودة | MISMATCH | لا route `payment-success` ولا قراءة مؤكدة من `payment_records`/`user_subscriptions` بعد العودة | حرج: نجاح ظاهري أو اشتراك غير مؤكد | إضافة شاشة عودة هاتفية تقرأ الحالة من Supabase فقط ولا تفعل اشتراكاً، مع عدم اعتبار redirect دليلاً |
| Webhook وإنشاء الاشتراك | التوثيق يشترط إنشاء/تحديثاً idempotent عبر Webhook | غير موجود في API المحلي وممنوع تعديله ضمن النطاق | لا وصول مباشر إلى Webhook | UNVERIFIED | كود Webhook الإنتاجي غير متاح في workspace | حرج | BLOCKED — REQUIRES PRODUCTION SOURCE/VERIFICATION؛ لا تعديل |
| `payment_records` و`invoices` | مصدر سجل الدفع والفواتير | لا endpoint مالي مستقل ظاهر | Realtime وقراءة مباشرة في شاشة الاشتراكات/الفواتير | PARTIAL | الهاتف يقرأ سجلات المصدر لكن لا يربطها بنتيجة Checkout محددة | عالٍ | شاشة العودة تعيد التحميل وتعرض حالة المصدر فقط |
| نجاح/فشل/إلغاء | حالات المزود/الاشتراك المحلي هي مصدر الحقيقة | لا contract محلي للحالات | يوجد `cancel_url` ثابت للويب ولا screens للحالات | PARTIAL | لا مسار مستقل للـfailure/pending/expired | عالٍ | إضافة معالجة routes للعودة والإلغاء على الهاتف فقط، دون تحديث مالي |
| pending | يجب ألا يتحول إلى اشتراك فعال قبل تأكيد الخادم | لا endpoint | لا شاشة/حالة pending بعد العودة | UNVERIFIED | لا مصدر تنفيذ Webhook متاح | عالٍ | عرض “جارٍ التحقق” ثم إعادة قراءة المصدر؛ تفاصيل الحالة تبقى UNVERIFIED |
| expired | حالة الاشتراك المؤكدة من `ends_at`/`is_active`/الرصيد | API الحجز يفلتر، لكن dashboard لا يفرض remaining > 0 | بعد الإصلاح لا fallback لاشتراك منتهٍ في العرض | PARTIAL | اختلاف dashboard عن booking | عالٍ | إصلاح API dashboard والفallback في الهاتف |
| duplicate return / idempotency | يجب عدم إنشاء اشتراك ثانٍ عند تكرار العودة؛ Webhook يعتمد معرف Stripe | لا endpoint | لا ينشئ الهاتف اشتراكاً لكنه لا يملك شاشة return idempotent | UNVERIFIED | لا كود Webhook متاح | حرج | عدم إضافة mutation؛ BLOCKED للتحقق الإنتاجي |
| Payment Return route | `PaymentSuccess.tsx` موجود في المنصة الأصلية | لا route API واضح | لا route `payment-success` في Expo Router | MISMATCH | `app/_layout.tsx` لا يسجل route العودة؛ `auth/callback` خاص بالمصادقة | عالٍ: العودة إلى رابط ويب لا تعيد المستخدم للتطبيق | إضافة route `payment-success` للهاتف واستقبال deep link، مع قراءة لا-كتابية من Supabase |
| Success URL | المنصة تستخدم مسار نجاح ويب، لكن النجاح لا يثبت الدفع | لا يستخدم | ثابت: `https://ajyalalmaerifa.com/payment-success` | PARTIAL | checkout الحالي يرسل رابط ويب ثابت | عالٍ على الأجهزة: قد يفتح المتصفح ولا يعود للتطبيق | استخدام scheme الهاتف فقط إذا كان مدعوماً بعقد المنصة؛ لا تغيير الرابط الإنتاجي دون إثبات، لذلك يبقى تكامل provider BLOCKED |
| Cancel URL | المنصة تملك مسار إلغاء ويب | لا يستخدم | ثابت: `https://ajyalalmaerifa.com/pricing?payment=cancelled` | PARTIAL | checkout الحالي | متوسط | إضافة حالة إلغاء داخل التطبيق عند فتح route المدعوم؛ عدم تغيير endpoint الأصلي بلا إثبات |
| Android deep link | scheme التطبيق `ajyalalmaerifa` | لا يستخدم | `app.json` يعلن scheme فقط ولا يوجد route دفع | PARTIAL | scheme موجود، handler الدفع مفقود | عالٍ | إضافة route/قراءة query آمنة، مع بقاء provider redirect بحاجة تحقق |
| iOS deep link | scheme التطبيق نفسه | لا يستخدم | `app.json` يعلن scheme فقط ولا يوجد route دفع | PARTIAL | scheme موجود، handler الدفع مفقود | عالٍ | نفس إصلاح Android |
| local fallback/mock | المصدر يمنع fallback المالي | لا يوجد fallback محلي ظاهر في API لهذه الوظيفة | الخطط والاشتراكات من Supabase؛ يوجد fallback عرضي للنصوص فقط | MATCHED | لا أسعار أو دقائق مالية ثابتة في مسار الخطط | عالٍ إذا توسع fallback | إبقاء البيانات المالية من Supabase فقط |
| API/OpenAPI contract | Checkout عبر Edge Function خارج API المحلي | لا contract Checkout/Payment Return في `openapi.yaml` | لا يعتمد على API المحلي لهذه الوظيفة | NOT_APPLICABLE | المسار الحالي ليس API server route | منخفض حالياً | لا إضافة عقد غير مثبت |

## خلاصة ما قبل الإصلاح

1. **MISMATCH المؤكد داخل نطاق Mobile:** fallback يعرض أول اشتراك حتى عند عدم وجود اشتراك فعال، ولا يوجد route هاتف للعودة من Checkout.
2. **PARTIAL المؤكد داخل نطاق API:** dashboard يقيّد الاشتراكات بـ`is_active` ومدة الانتهاء لكنه لا يطبق `remaining_minutes > 0` في قراءة الرصيد، رغم أن مسار الحجز يطبقه.
3. **UNVERIFIED/BLOCKED خارج النطاق:** Webhook، معرفات Stripe، idempotency الإنتاجية، وحالات provider التفصيلية لا يثبتها الكود المتاح. لا يجوز اختراعها أو تعديل Production لإغلاقها.
4. لن يضيف التطبيق أي اشتراك، أو دقائق، أو سجل دفع، أو refund، ولن يعتبر `success_url` نجاحاً. أي شاشة عودة ستكون قراءةً وتحققاً فقط.

## الإصلاحات المسموح بها بعد إنشاء هذا التقرير

- Mobile:
  - منع عرض اشتراك غير فعال كاشتراك فعال.
  - إضافة شاشة/مسار Payment Return آمن للقراءة وإعادة التحميل.
  - عدم تنفيذ أي mutation مالية من المسار.
- API:
  - توحيد اختيار `balance` في dashboard مع شرط الرصيد الموثق، دون تعديل قاعدة البيانات أو RPC أو Edge Function.

## فحوص ما بعد الإصلاح

- TypeScript لتطبيق الهاتف وخادم API.
- API build.
- حزم Expo Android/iOS وقراءة manifest.
- فحص `git diff --check`.
- فحص health و401 لمسار API.
- بحث عن Mock أو أسعار/دقائق مالية hard-coded.
- فحص المسارات والـdeep links دون فتح Checkout أو دفع حقيقي.

## النتيجة بعد الإصلاح المحلي

| FEATURE | PLATFORM SOURCE | API SOURCE | MOBILE SOURCE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| اختيار الاشتراك الفعال للعرض | شروط الفعالية من المصدر | يقرأ الصفوف المؤهلة ويرتبها | لا يستخدم fallback لصف منتهٍ أو depleted؛ لا يعرض balance إلا من صف فعال | MATCHED | `ConnectedSectionScreen.tsx` بعد الإصلاح | متوسط للحالات التي لم يثبت عقدها | لا تغيير إضافي دون مصدر إنتاجي |
| رصيد dashboard | الاشتراكات الفعالة ذات الرصيد الموجب | يفرض `remaining_minutes=gt.0` مع `is_active` والانتهاء | يستهلك بيانات المصدر | MATCHED | `artifacts/api-server/src/routes/learning.ts` | منخفض ضمن النطاق المحلي | لا تغيير إضافي |
| Payment Return داخل الهاتف | صفحة نجاح المنصة لا تثبت الدفع بمفردها | لا mutation أو تحقق مالي محلي | route `payment-success` يقرأ الاشتراكات وسجل الدفع فقط، ولا ينشئ أو يعدل شيئاً | PARTIAL | `app/payment-success.tsx` و`app/_layout.tsx` | لا يمكن ربط العودة الحالية بمعرف Stripe غير متاح | يلزم عقد/مصدر Webhook إنتاجي لإغلاقه |
| نجاح الدفع المرتبط بالمعاملة الحالية | Webhook/provider/database idempotent | غير متاح محلياً | لا يدّعي النجاح اعتماداً على redirect؛ يعرض فقط حالة الحساب الحالية | UNVERIFIED | لا يوجد Stripe session identifier أو Webhook في المصادر المتاحة | حرج خارج النطاق المسموح | BLOCKED — REQUIRES PRODUCTION SOURCE/VERIFICATION |
| Android/iOS route readiness | scheme الإنتاجي غير مثبت للـCheckout | لا يستخدمه | `payment-success` مسجل في Expo Router، مع بقاء success/cancel URLs الويب كما هي | PARTIAL | `app.json` و`app/_layout.tsx` | provider قد لا يعيد إلى التطبيق | لا تغيير URL دون إثبات من المنصة |
| عدم وجود كتابة مالية من الهاتف | الاشتراك والرصيد من المصدر | لا route دفع محلي | شاشة العودة والاستدعاء الحالي لا يضيفان اشتراكاً أو دقائق أو payment record | MATCHED | لا توجد mutation في مسار العودة | منخفض | إبقاء الحقيقة المالية خارج الهاتف |

### سجل التحقق المنفذ

- `pnpm --filter @workspace/ajyal-mobile run typecheck` — ناجح.
- `pnpm --filter @workspace/api-server run typecheck` — ناجح.
- `pnpm --filter @workspace/api-server run build` — ناجح.
- `pnpm --filter @workspace/ajyal-mobile run build` — ناجح؛ تم إنشاء iOS وAndroid bundles وmanifests و44 asset.
- `git diff --check` — ناجح.
- `GET /api/healthz` — `200` مع `{"status":"ok"}`.
- `GET /api/teachers` دون Authorization — `401` كما هو متوقع.
- لم يتم استدعاء `create-checkout`، ولم يفتح أي رابط دفع، ولم تنفذ كتابة على Production.
- لم يتغير `lib/api-spec/openapi.yaml`، لذلك لم يتم تشغيل توليد OpenAPI.
- تحذير `libglib-2.0.so.0` يخص React Native DevTools الاختياري فقط؛ لم يمنع Metro أو الحزم أو workflow.

## حدود الإغلاق

تمثل هذه المرحلة تدقيقاً وإصلاحاً محلياً محدوداً فقط. لا تبدأ منها مراحل الحجز أو الجلسات أو المحفظة أو السحب، ولا تعد دليلاً على نجاح دفع أو إنشاء اشتراك Production.