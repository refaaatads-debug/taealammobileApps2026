---
name: Mobile realtime and polling
description: Performance policy for mobile Realtime subscriptions, query invalidation, and polling fallbacks.
---

Route Realtime events only to the query families affected by that table; do not refresh unrelated dashboard, balance, booking, and assignment data together. Keep Realtime as the fast path and run periodic fallback polling only while the relevant screen is focused.

**Why:** Broad event handlers and hidden-tab polling create unnecessary network work and rerenders, which compete with interactive tasks such as joining live sessions. The user confirmed Replit felt faster and notifications arrived promptly after the performance updates.

**How to apply:** When adding or changing mobile subscriptions, filter chat events to the signed-in user's booking IDs, invalidate only affected query keys, and preserve focused-screen polling as recovery when Realtime misses an event.
