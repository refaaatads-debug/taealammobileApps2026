# أجيال المعرفة — تطبيق الطالب والمعلم

تطبيق Android/iOS يستخدم نفس حسابات وبيانات ومنطق منصة أجيال المعرفة للطلاب والمعلمين.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- منصة الويب وSupabase Production هما مصدر الحقيقة الوحيد للهوية والأدوار والجداول وRPC والـFunctions والمنطق المالي.
- كل تعديل خاص بتطبيق الهاتف أو API الخاص به فقط؛ لا ننشئ بديلاً للمنصة أو قاعدة بيانات أو منطقاً مالياً موازياً.

## Product

يوفر التطبيق تسجيل الدخول، اكتشاف المعلمين، الحجز، الجلسات، المحادثات، الإشعارات، الباقات، الرصيد، والمحفظة عبر بيانات المنصة الأصلية.

## User preferences

قاعدة العمل الملزمة: ممنوع تعديل VPS أو المنصة الأصلية أو Production Database أو Schema أو RLS أو RPC أو Triggers أو Auth/OAuth. أي تغيير قد يؤثر على المنصة الأصلية يجب إيقافه وطلب موافقة المستخدم أولاً.

## Gotchas

لا تنفذ أي كتابة أو دفع أو تغيير مالي على Production أثناء المطابقة؛ اختبارات المسارات الحساسة قراءة فقط إلى أن يعتمد المستخدم النتيجة ويصرح باختبار آمن.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
