---
name: Supabase connector schema limits
description: The installed Supabase connector may block PostgREST OpenAPI and throttle concurrent metadata probes.
---

The installed Supabase connector is not sufficient by itself to prove Production schema parity: `GET /rest/v1` may return 403, and concurrent table probes may return 429. Treat both as inconclusive and request safe metadata access from Supabase rather than inferring missing tables or policies.

**Why:** A parallel read-only audit produced 403/429 responses without exposing schema metadata; using those responses as evidence would create false parity or false-gap conclusions.

**How to apply:** Probe slowly and selectively, record status codes without data, and keep RLS, triggers, RPC signatures, Storage policies, and Realtime publication marked as unverified until a reliable metadata source is available.