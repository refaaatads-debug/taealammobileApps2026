---
name: PostgREST session query batching
description: Large booking history queries need bounded batches when loading session lifecycle rows.
---

When listing many bookings and joining their lifecycle from `sessions`, batch the `booking_id=in.(...)` PostgREST filters instead of putting every booking ID into one URL.

**Why:** A teacher history can exceed the proxy URI limit and turn the whole sessions endpoint into a 414 error, which makes both upcoming and instant classes appear missing.

**How to apply:** Keep lifecycle batches small enough for the deployment proxy, merge the returned rows before mapping session status, and retain `sessions.started_at`/`ended_at` as the authoritative lifecycle signals.