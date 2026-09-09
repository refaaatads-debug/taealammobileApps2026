---
name: Supabase session hydration race
description: Auth state ordering rule for the mobile client
---

The initial Supabase session hydration result must be ignored once a newer auth action or auth-state event has occurred.

**Why:** A delayed `getSession()` result can represent the pre-login state and overwrite a successful password login, causing the navigation tree to flash or return to its bootstrap loading screen.

**How to apply:** Version initial hydration and increment that version for login, logout, and auth-state events. Update the local user immediately from a successful sign-in response instead of waiting only for the event callback.