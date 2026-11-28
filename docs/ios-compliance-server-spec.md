# iOS compliance: server-side proposals (NOT applied)

Nothing here has been run. Each item needs the owner's approval and a person with access to the platform (Supabase / VPS).

## 1. Sign in with Apple (Guideline 4.8)
- Apple Developer Program account (owner's): enable "Sign in with Apple" on App ID com.ajyalalmaerifa.app.
- Supabase Auth: enable Apple provider. For native iOS id-token sign-in, add the bundle ID com.ajyalalmaerifa.app to the Apple provider "Client IDs". (A Services ID + key is only needed for web/OAuth Apple login.)
- Keys (.p8, Team ID, Key ID) go only into the Supabase dashboard / vault, never chat or repo.
- App: needs a new native build (expo-apple-authentication is a native module); cannot ship by OTA.
- Role handling: Apple users get the same set_new_user_role flow as Google users.
- Apple only returns name/email on the first authorization; profile creation must not depend on them.

## 2. Delete account (Guideline 5.1.1(v)) - edge function `delete-account`
Called by the app: supabase.functions.invoke("delete-account", { body: { confirm: true } }) with the user's JWT.
Server (service role, inside the function only):
1. Identify user from the JWT; ignore any user id in the body.
2. Block deletion with a clear message (error text returned to the app) if any of: active/ongoing session, pending teacher withdrawal request, wallet balance owed to a teacher (> 0). User must settle or contact support first. (Decision for owner.)
3. Cancel future bookings (status -> cancelled by account deletion), notify the other party, release held minutes/credit per existing refund rules. (Decision for owner: refund policy.)
4. Financial records (invoices, payments, wallet_transactions, withdrawals): keep, but anonymize the person: null/replace name, email, phone, avatar; keep rows needed for tax/legal retention. (Owner/legal to confirm retention period.)
5. Delete or anonymize: profiles, avatar files in storage, chat_messages content + attachments, support tickets/messages, push tokens, teacher certificates and identity documents, session materials/AI reports tied to the user.
6. If the user signed in with Apple: revoke the Apple refresh/identity token via Apple's /auth/revoke (Apple tech note TN3194).
7. Finally auth.admin.deleteUser(id). Return { ok: true }. Log an audit row (user id hash, time) without personal data.
Idempotent: safe to call twice. Rate-limit. Test on a staging project first.
Open questions for owner: refund rule for unused credit; retention period for invoices; whether teachers with earnings can delete.

## 3. Report and block (Guideline 1.2) - SQL proposal
```sql
create table public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
create policy "own blocks select" on public.user_blocks for select using (blocker_id = auth.uid());
create policy "own blocks insert" on public.user_blocks for insert with check (blocker_id = auth.uid());
create policy "own blocks delete" on public.user_blocks for delete using (blocker_id = auth.uid());

create table public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid,
  booking_id uuid,
  reason text not null check (reason in ('abuse','spam','inappropriate','other')),
  status text not null default 'open',
  created_at timestamptz not null default now()
);
alter table public.chat_reports enable row level security;
create policy "insert own reports" on public.chat_reports for insert with check (reporter_id = auth.uid());
-- no select policy for users; admins read via service role / admin dashboard.
```
Also needed on the web platform: an admin view of open chat_reports with a response SLA (Apple asks for timely responses; typical target 24h), and a rule that blocked users cannot message the blocker (RLS or trigger on chat_messages insert). Without that server rule, the app only hides the blocked user's messages on the blocker's side.
Note: column types (uuid vs text for message_id/booking_id) must match the existing chat_messages/bookings schema; check before applying.
