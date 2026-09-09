---
name: Production PostgREST timeout
description: Observed behavior of the Ajyal production custom domain during read-only diagnosis.
---

The production custom domain serves the web app at `/` and `/login`, while Supabase endpoints are served through the same host. Auth settings and bounded table probes can respond successfully, but the PostgREST root endpoint may return `500` with `57014` (`statement timeout`) and roughly multi-second latency.

**Why:** A failed REST introspection request does not by itself prove that Auth, the schema, or the application login flow is broken.

**How to apply:** Capture the exact failing Network URL and server logs before changing Nginx, OAuth, RLS, Schema, or RPCs; test bounded read-only endpoints separately and never use credentials visible in screenshots.

The attached browser evidence separately shows the original site's signup request as `POST /auth/v1/signup?redirect_to=...` returning `504`; this must not be conflated with the independently observed `GET /rest/v1/` `500/57014`.

**Why:** Auth signup is handled by GoTrue, while the `57014` response is labeled by the PostgREST gateway; they require different logs and must not be “fixed” through a guessed shared timeout.

**How to apply:** Treat signup as the user-visible affected flow, but require GoTrue/Kong/Nginx timing or server logs to prove whether its upstream database work is the same timeout.