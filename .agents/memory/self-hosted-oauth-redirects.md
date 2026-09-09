---
name: Self-hosted OAuth redirects
description: Redirect allowlists for the self-hosted Supabase Auth deployment used by the Ajyal app.
---

The app can pass a correct OAuth `redirectTo` and still land on the website home page when the self-hosted Supabase Auth allowlist does not contain that URL. In this deployment, Docker Compose maps `ADDITIONAL_REDIRECT_URLS` from the Supabase `.env` into Auth's `GOTRUE_URI_ALLOW_LIST`.

**Why:** Auth uses `GOTRUE_SITE_URL` as the fallback when a callback target is not allowed. This looks like a client-side navigation bug even though Google and the Supabase provider callback are working.

**How to apply:** Keep the native callback (`ajyalalmaerifa://auth/callback`) and the narrowly scoped Expo preview callback pattern in the allowlist, then recreate only the Auth container. Verify the authorize endpoint returns an HTTP 302 for each callback target without printing keys or OAuth state.