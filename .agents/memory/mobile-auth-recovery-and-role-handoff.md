---
name: Native auth recovery and role handoff
description: Native Supabase reset links and deferred teacher signup roles require explicit client-side state handling.
---

Native Supabase clients with `detectSessionInUrl` disabled do not necessarily hydrate a password-recovery link automatically. A deep link can carry the access and refresh tokens in its fragment, so the callback must explicitly call `setSession` before presenting the password update UI.

**Why:** Web URL detection and native deep-link delivery are different paths. Without explicit hydration, the app can open a callback screen without an authenticated recovery session.

**How to apply:** Keep recovery state separate from ordinary `SIGNED_IN`; set it from the recovery callback/event and clear it only after `updateUser({ password })` or sign-out. When deferring a teacher role after email signup, persist the signup email with the pending role and verify it before calling the role RPC, while clearing stale email state when starting another OAuth signup. Do not expose the authenticated user to profile bootstrap until that RPC completes; otherwise `/me` can resolve before the role row exists and permanently show the account-verification gate.