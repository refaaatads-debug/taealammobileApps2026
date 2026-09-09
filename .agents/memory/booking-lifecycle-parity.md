---
name: Booking lifecycle parity
description: Durable rules extracted from the published Ajyal booking flow for future mobile/API matching.
---

The published booking flow treats a grouped booking request as one teacher decision: accepting uses `accept_booking_group` and creates one confirmed booking per returned request; rejecting uses `reject_booking_request` with the full request-id list. A single request uses the corresponding singular RPC.

**Why:** Treating grouped rows independently can leave only part of a student's requested schedule accepted, create duplicate bookings during a race, or show the teacher a different decision surface than the platform.

**How to apply:** Before allowing a teacher decision, use the group's earliest expiry, block a teacher with an in-progress session scheduled within the last four hours, and check each requested slot against pending/confirmed bookings in the platform's bounded conflict window. After confirmation, mirror the platform's notification and first-chat behavior.

Cancellation is asymmetric: a student cancellation updates booking/session status and notifies the teacher; a teacher cancellation requires a non-empty reason, records the cancellation metadata, tracks the monthly cancellation count, and warns administration after the published limit. Session listings use confirmed/pending bookings within the platform's bounded history/future window.

Booking requests use the platform's broadcast model: `booking_requests` has no assigned teacher column, and teacher visibility is controlled by RLS using the resolved subject and (when present) the student's teaching stage. The published direct-teacher flow sends a notification to the selected teacher but does not enforce target-only visibility in the table.

**Why:** Adding a local stage gate or `teaching_stage` value to the direct-teacher flow diverges from the published implementation and can reject otherwise valid requests or make them invisible when stage formats differ. A missing subject still causes the original RLS filter to hide a request.

**How to apply:** Resolve the subject and selected approved teacher before insertion, but do not invent target-teacher schema/RLS behavior. Treat strict target-only visibility as a Production schema/RLS follow-up, not a mobile workaround.

The teacher request-list endpoint should return rows authorized by Supabase RLS and avoid a second local subject/stage visibility filter. Legacy stage formats or profile differences can otherwise hide a valid incoming request and add avoidable upstream latency.

**Why:** A valid student request was missing from the teacher's incoming list while the endpoint repeated subject/stage filtering already represented by the platform's RLS.

**How to apply:** Keep only the incoming-request time/status bounds in the API list query, then map the RLS-authorized rows for display. Investigate RLS or source-data mismatches separately instead of silently dropping rows in the mobile/API adapter.

The mobile API must not add a second subscription-balance gate to teacher acceptance; the published flow creates the booking with optional subscription metadata and leaves minute deduction to the verified session-completion trigger. Rejection depends on the platform's `reject_booking_request` RPC.

**Why:** An extra balance check made a visible teacher action fail before the platform's booking flow ran, while direct request updates are blocked by RLS and cannot replace the rejection RPC safely.

**How to apply:** Preserve the platform RPCs and trigger-driven billing. If rejection fails, surface the Supabase RPC error and verify the production function rather than changing schema or updating rows directly.

The platform's schedule is sourced from `bookings`, not merely accepted `booking_requests`; upcoming uses confirmed/pending future rows, while history must include confirmed/pending/completed/cancelled past rows. Accepted requests without a booking are a Production consistency issue and must not be silently repaired by the mobile client.

**Why:** Production currently contains accepted requests with no matching booking rows, and treating those requests as live sessions would create unusable session IDs and diverge from the platform's source of truth.

**How to apply:** Show the real booking rows in the schedule, surface request/bookings mismatches separately if needed, and obtain explicit approval before mutating Production data to repair historical records.

The mobile calendar is a combined schedule view: it must load both future and bounded/unbounded history rows even when the adjacent list is filtered to “upcoming”. A pending or confirmed booking whose scheduled time has passed is displayed as expired and is not joinable.

**Why:** Calendar navigation can select a previous day independently of the list tab. Filtering the calendar request to future timestamps makes a real booking appear to disappear, while leaving its status as upcoming invites an invalid session join.

**How to apply:** Keep list filters for the “upcoming/past” sections, but merge the relevant booking history into the calendar source and derive expiration from the scheduled timestamp plus booking status without mutating Production rows.

Availability enforcement needs a verified timezone contract before the API compares a requested instant with a teacher's local day or hours; Mobile-only filtering is not sufficient protection.

**Why:** An ISO timestamp from the student's device does not identify the teacher's local calendar day, and assuming UTC or Riyadh can accept a slot on the wrong day.

**How to apply:** Treat server-side availability parity as unverified until the authoritative timezone field/conversion rule is confirmed. Do not add a guessed timezone fallback; keep client filtering as UX only and reject API bypasses only after the contract is available.