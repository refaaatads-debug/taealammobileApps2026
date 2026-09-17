---
name: Native OAuth callback idempotency
description: Expo native Google OAuth can deliver the same callback to both the browser session and Expo Router.
---

Native Google OAuth may redeem a PKCE callback in `WebBrowser.openAuthSessionAsync` while Expo Router also processes the deep link. Treat an already-redeemed code as success when `supabase.auth.getSession()` has an authenticated session, and bound every exchange and role-handoff request with a timeout.

**Why:** Handling the second delivery as a fatal code-redeemed error leaves users on the callback loading screen even though authentication succeeded in the other path.

**How to apply:** Keep native callback processing idempotent, clear stale pending signup state on real failure, and show a retry or return-to-login action after a bounded wait.