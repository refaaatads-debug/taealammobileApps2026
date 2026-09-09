---
name: RLS policy verification
description: A workspace-specific caution for validating PostgreSQL row-level security after Drizzle schema pushes.
---

After changing Drizzle PostgreSQL policies, inspect `pg_policy` directly instead of relying only on a successful schema push. In this workspace, a push can report success while a policy exists with empty `USING` and `WITH CHECK` expressions.

**Why:** An enabled-but-unqualified policy can expose every row or fail to enforce the user boundary, which is materially different from a typecheck or migration success.

**How to apply:** Query `pg_get_expr(polqual, polrelid)` and `pg_get_expr(polwithcheck, polrelid)` for each protected table in development, and confirm both `relrowsecurity` and `relforcerowsecurity` match the intended isolation model.