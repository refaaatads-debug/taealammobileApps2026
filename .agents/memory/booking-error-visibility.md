---
name: Booking error visibility
description: Durable UI rule for distinguishing a rejected booking request from a button or network failure.
---

When creating a booking request, treat a returned HTTP error as an actionable platform decision, not as a silent reset of the submit button. Preserve and display the structured `error`/`detail` message in the screen as well as any native alert.

**Why:** A real request can reach the API and be rejected by profile, eligibility, subject, teacher, timing, or duplicate-booking validation. Without the response body, the user experiences only a brief loading state and cannot correct the actual problem.

**How to apply:** Keep the platform validation authoritative, never bypass it to make the UI appear successful, and show the API's safe user-facing message inline whenever the mutation fails.