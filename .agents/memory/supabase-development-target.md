---
name: Development Supabase target
description: The current Replit development Supabase URL resolves to the production custom domain.
---

Do not run live student-account searches from the Replit development preview while `EXPO_PUBLIC_SUPABASE_URL` resolves to `ajyalalmaerifa.com`. Treat it as production, even if the caller is the development or preview app. Use local tests or an already-authorized non-production environment instead; do not create a separate database without explicit approval.

**Why:** Live in-person search requires an authenticated student and reads real profile, address, and teacher availability data; a “read-only” request still targets production data.

**How to apply:** Before any live Supabase request from Replit, inspect the effective development URL without exposing credentials. If it is the production host, stop before invoking the RPC and report that non-production validation is blocked.
