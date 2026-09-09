---
name: Mobile session device policy
description: The mobile app is a student join client; teacher session lifecycle remains desktop-owned.
---

The Expo app must never start or complete a teacher session. It may read session lifecycle changes and let the booking owner join when `bookings.session_status` is `in_progress` and the session has not ended; `sessions.started_at` is authoritative for timing/billing but is not an extra mobile join gate. It may publish device presence/heartbeat in `active_sessions`, while teacher start and billing lifecycle remain owned by the platform desktop flow.

**Why:** The platform engineering contract explicitly requires teacher start from a computer and uses the original session trigger for billing. The original student screen enables joining from the booking's `in_progress` state; requiring a second `started_at` read can leave the student stuck on “waiting” during the same start transition.

**How to apply:** Keep booking/session start/end operations read-only on mobile, subscribe to session/booking Realtime changes, and reject or hide any mobile teacher start action even when an internal call is active. Presence writes must be scoped to the authenticated student, booking, and persisted device id, and stop after the student leaves. Do not assume a production unique constraint on `active_sessions`; heartbeat code must tolerate read-then-update/insert semantics.