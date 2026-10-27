---
name: In-person credit history access
description: Security constraint for reading student package reservation, consumption, and refund history.
---

Mobile clients must not read `in_person_credit_reservations` directly. The published schema enables RLS without a student SELECT policy, so exact reservation, consumption, and released-minute history is not available through direct PostgREST reads.

**Why:** A direct client query is rejected by RLS. Adding a broad table grant or bypassing RLS would expose financial records beyond the student's own package.

**How to apply:** Use an authenticated RPC or API endpoint that verifies `auth.uid()` owns the student and subscription before returning the ledger. Until that contract exists, show only booking snapshots available under existing RLS and do not infer refunded minutes from cancellation status.
