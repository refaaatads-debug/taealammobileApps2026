---
name: Supabase Replit egress fallback
description: How the API handles a custom Supabase domain that is reachable publicly but blocked from Replit egress.
---

When the custom Supabase/VPS domain works from other networks but times out from Replit, route API Supabase requests through the added Replit Supabase connector and pass the user's Bearer token to PostgREST. Keep direct HTTP as the non-Replit fallback.

**Why:** A public website recovery does not guarantee that a Replit workflow can open TCP to the VPS; treating the timeout as an authentication failure leaves mobile users on the account-verification gate.

**How to apply:** Do not bypass authorization with decoded JWT claims alone. Accept the decoded subject only after the same Bearer token successfully passes a user-scoped PostgREST/RLS query.