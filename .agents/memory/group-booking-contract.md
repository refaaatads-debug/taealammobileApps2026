---
name: Group booking contract
description: Durable contract and verification boundary for multi-slot booking requests.
---

Grouped booking requests use a separate API contract from single-slot requests. The grouped input contains shared booking context plus a `slots` array, and the server creates one request row per slot under one `group_id`; the legacy single-slot endpoint remains unchanged.

**Why:** The source platform models groups as multiple database rows, while changing the existing single-slot request/response contract would break existing Mobile/API consumers and blur the distinction between one request and a group.

**How to apply:** Keep local codegen, typechecks, and bundles separate from Production E2E evidence. Do not classify Group Booking as fully matched until real student/teacher acceptance, rejection, race, and persistence checks pass against Production.