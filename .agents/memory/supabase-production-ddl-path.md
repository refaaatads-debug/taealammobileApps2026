---
name: Supabase production DDL path
description: How to apply and verify approved RLS changes when the connected Supabase REST key cannot manage schema.
---

The live Ajyal Supabase instance is self-hosted on the VPS, with PostgreSQL in the `supabase-db` container. The Replit Supabase connector is REST-only and may use a publishable/anon key, so 403 responses and missing metadata access do not provide a DDL path.

**Why:** The booking deletion fix required a real RLS policy, but the connector could not inspect or create policies. The authoritative live policy check and approved DDL had to run through the internal PostgreSQL service.

**How to apply:** Treat connector 403s as inconclusive, obtain explicit approval before production DDL, apply an idempotent migration through the authorized VPS database path, and verify both `pg_policies` and an RLS-scoped operation before claiming success. Keep user-facing API code aligned with the live policy.