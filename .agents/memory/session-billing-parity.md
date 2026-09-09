---
name: Session billing parity
description: Durable rules for matching mobile session completion and cancellation to the published platform billing flow.
---

The published billing path is trigger-driven: a teacher-side transition of `sessions.ended_at` from null causes `auto_complete_session()` to derive the duration, skip charges under five minutes, and deduct `user_subscriptions.remaining_minutes` for longer sessions. The mobile client must record session timestamps and duration, never deduct minutes locally.

**Why:** The production RLS policy grants session updates to teachers, while the platform's session trigger is the only verified minute-deduction path. Direct mobile balance changes would bypass the source of truth and risk double charging.

**How to apply:** Let the teacher finalize the session, including when the student's call-end event reaches the teacher. Treat cancellation and `session_compensations` as separate administrative flows; do not promise or implement automatic minute refunds without a verified production function or trigger.

Booking eligibility and billing are separate: future open/accepted requests and pending/confirmed bookings reserve capacity, but `remaining_minutes` is deducted only by session completion. The intended capacity rule is `floor((active remaining minutes - future reservations) / lesson duration)`.

**Why:** A student who books but never joins must not be charged, yet allowing unlimited new reservations would let bookings exceed the paid balance. A 45-minute balance supports one 45-minute lesson; 90 minutes supports two, assuming each lesson is reserved once.

**How to apply:** Keep the booking guard and the completion trigger separate. Reconcile any accepted-request/booking pair before counting reservations; Production's current validation function currently counts both representations, so changing that behavior requires an explicit database migration rather than a client-side workaround.