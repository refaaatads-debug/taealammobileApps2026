---
name: Profile bootstrap caching
description: Performance and freshness rules for the authenticated /api/me bootstrap response
---

The authenticated profile bootstrap is assembled from several remote Supabase checks, so it should not be refreshed on focus, reconnect, or a short interval. Keep client query data fresh for about a minute, and use a short user-scoped in-memory server cache to absorb repeated bootstrap requests.

**Why:** The upstream Supabase path can take seconds in the Replit environment. Repeated bootstrap calls overlap, saturate the API, and make Preview appear to clear or reload while the UI is waiting.

**How to apply:** Run independent role/profile/ban checks in parallel, select only the profile columns needed by `/api/me`, cache successful responses briefly by authenticated user, and preserve explicit Realtime or user-action refetches for data that truly needs immediacy.