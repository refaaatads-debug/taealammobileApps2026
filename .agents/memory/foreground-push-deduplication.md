---
name: Foreground push deduplication
description: Foreground notifications can arrive through both Expo Push and Supabase Realtime.
---

Foreground account notifications are rendered by the app's banner instead of the native foreground banner, while background notifications remain native. Realtime and Push deliveries are deduplicated by notification identity or a short title/body fingerprint.

**Why:** API-created notification rows can produce a Supabase INSERT and a remote Push for the same event; showing both makes one event appear twice.

**How to apply:** Preserve the split foreground/background presentation and keep stable notification or event identifiers in Push data whenever a producer has them.

In Replit Preview, the API can start with the persistent push worker disabled when the notification outbox table is unavailable. A notification endpoint accepting or persisting a row is not proof that a device received a push.

**Why:** Preview logs showed `outbox_table_missing`; the route's accepted response reflects notification persistence, not end-device delivery.

**How to apply:** Check the target API environment's outbox-worker status separately from the mobile client's notification response, and avoid claiming device delivery without a delivery signal.