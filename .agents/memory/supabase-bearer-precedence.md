---
name: Supabase bearer precedence
description: Authentication ordering during the transition from legacy OIDC sessions to Supabase Auth.
---

When an app is migrating from a cookie-based auth provider to Supabase Auth, a valid Supabase Bearer token must be evaluated before any legacy session cookie.

**Why:** A stale legacy cookie can exist alongside a valid Supabase session. If middleware chooses the cookie first, authenticated mobile requests are treated as unauthenticated and protected API calls return 401.

**How to apply:** For every protected API request, prioritize the current Authorization Bearer flow; only use the legacy cookie flow when no Bearer token is present, and verify both paths independently.