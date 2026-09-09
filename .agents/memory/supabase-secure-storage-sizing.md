---
name: Supabase SecureStore sizing
description: Native persistence constraints for Supabase sessions in the Expo app.
---

Supabase auth session JSON can exceed Android SecureStore's per-value limit. Store native session values in individually secure chunks below the platform limit rather than writing the complete JSON as one value.

**Why:** A failed SecureStore write can leave the current in-memory login looking successful while the next bootstrap cannot restore the session, producing a misleading account-verification failure.

**How to apply:** Keep the storage adapter chunk-aware for `getItem`, `setItem`, and `removeItem`; use a conservative chunk size for Unicode data and remove stale chunks when replacing or clearing a session.