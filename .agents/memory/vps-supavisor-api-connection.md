---
name: VPS Supavisor API connection
description: Production API database connection behavior for the self-hosted Supabase pooler on the Ajyal VPS.
---

When the API uses the VPS-local Supavisor at 127.0.0.1:6543, the existing API database password authenticates as the qualified pooler user `supabase_admin.default`, not as the unqualified `postgres` user. The pooler reports `Tenant or user not found` or password failures before any table/RLS operation when the URL uses the wrong user.

**Why:** Push-token registration and other Drizzle transactions failed in production even though the PostgreSQL container was healthy and PostgREST-backed reads worked. The pooler tenant is `default`, and the API's existing password was valid for `supabase_admin.default`.

**How to apply:** Keep hosted/development DATABASE_URL values unchanged. For this specific self-hosted URL shape, normalize the database user in API code to the qualified `supabase_admin.default` user; do not change schemas, tables, RLS, or Supabase data as a workaround.