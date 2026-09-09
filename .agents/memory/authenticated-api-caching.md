---
name: Authenticated API caching
description: Cache behavior for the mobile app's authenticated API client and role resolution.
---

Authenticated API endpoints must not leave the client with a bodyless `304` response. The API disables caching and the shared fetcher retries a 304 without validators so profile and role queries retain their JSON data.

**Why:** A browser-generated 304 was treated as a failed query, which removed the profile data and caused the mobile UI to fall back to the student role for a teacher account.

**How to apply:** Keep dynamic `/api` responses `no-store`; if a proxy or browser still returns 304, retry without `If-None-Match`/`If-Modified-Since` before parsing the response.