---
name: Booking subject metadata
description: The production booking row shape used by the mobile conversation list.
---

Conversation and booking reads must request `subject_id` rather than `bookings.subject` or `bookings.title`; a subject label may be used as a local fallback when the subject lookup is unavailable.

**Why:** Production PostgREST rejects any nonexistent selected column instead of returning a partial row, which makes the entire messages list fail to load.

**How to apply:** Keep booking queries compatible with the production schema and treat subject-name enrichment as optional. Never translate a schema error into an empty conversation list.