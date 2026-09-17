---
name: Dashboard partial failures
description: How role dashboards should behave when an optional Supabase section is unavailable.
---

Role dashboards must keep rendering the sections that loaded successfully when an optional Supabase query fails. The API records the affected section names, and the mobile dashboard shows a visible synchronization warning instead of presenting a misleading empty dashboard or a generic full-screen failure.

**Why:** The dashboard aggregates independent Supabase tables. A single missing table, RLS mismatch, timeout, or upstream outage previously turned the whole student dashboard into a 502 and made every section appear missing.

**How to apply:** Keep core authentication and role checks strict, but isolate optional dashboard queries with named fallbacks. Preserve the section names in the response contract and keep the client warning non-blocking so users can still use working navigation and data.