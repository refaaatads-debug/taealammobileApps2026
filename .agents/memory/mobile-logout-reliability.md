---
name: Mobile logout reliability
description: The mobile app's logout behavior must remain reliable when the Supabase network is unavailable.
---

Mobile logout should use Supabase Auth's local scope and clear client query state immediately. Push-token cleanup and global server revocation are best-effort and must not block removing the local session.

**Why:** The previous flow waited on the default global sign-out and push-token cleanup, so network failures could make logout appear stuck or leave persisted credentials available for the next launch.

**How to apply:** Keep the UI action asynchronous with visible progress/error handling; use `signOut({ scope: "local" })` for the app's guaranteed exit path and clear React Query cache after the auth state is removed.