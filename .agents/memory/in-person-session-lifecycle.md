---
name: In-person session lifecycle parity
description: Platform rules for in-person attendance confirmation, teaching duration, package debit, and automatic completion.
---

In-person code confirmation starts the teaching session and consumes the package debit recorded for that booking. Keep that debit separate from the teaching duration captured from admin settings. A scheduled platform worker marks the booking complete after the saved teaching duration has elapsed; clients must display these authoritative booking states rather than end the session or debit minutes locally.

**Why:** The platform snapshots the configured teaching duration and package debit independently, and its server-side completion flow is the source of truth for billing and status.

**How to apply:** Map `in_person_teaching_minutes` or `instruction_duration_minutes` to the displayed lesson duration, never to the package debit. Respect `bookings.status` and `session_status` completion even if `sessions.ended_at` remains unset for in-person lessons. Do not route in-person attendance into the online video room.
