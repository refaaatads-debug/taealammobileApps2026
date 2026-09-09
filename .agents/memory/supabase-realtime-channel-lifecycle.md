---
name: Supabase Realtime channel lifecycle
description: Prevent duplicate postgres_changes bindings when React effects are mounted and cleaned up quickly.
---

Supabase Realtime topics must not be reused while a previous channel is still subscribed. React Strict Mode can run an effect twice before asynchronous channel cleanup finishes, causing `cannot add postgres_changes callbacks ... after subscribe()`.

**Why:** The failure is synchronous and can take down the screen even though the initial Supabase query is valid.

**How to apply:** Give effect-created channels a unique topic per subscription, wrap channel setup in a synchronous try/catch, and treat `CHANNEL_ERROR` or `TIMED_OUT` as a non-fatal loss of live updates when the screen has a direct reload path.