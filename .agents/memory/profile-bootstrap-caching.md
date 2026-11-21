---
name: Profile bootstrap caching
description: Performance and freshness rules for the mobile Supabase identity bootstrap
---

The mobile identity bootstrap reads the profile and roles in parallel from Supabase, with teacher approval and ban checks following only when needed. Keep the React Query cache user-scoped and fresh for about 30 seconds; do not poll or refetch on focus/reconnect.

**Why:** Identity checks can be slow, and repeated bootstrap calls increase latency. A user-scoped cache also prevents one account's permissions from appearing in another account's session.

**How to apply:** Query only the profile columns needed by the app, run independent profile/role reads in parallel, and key cached results by authenticated user ID. Keep explicit retry actions for identity failures; do not silently fall back to a student role.