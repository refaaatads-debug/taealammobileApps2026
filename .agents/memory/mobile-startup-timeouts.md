---
name: Mobile startup timeouts
description: Startup behavior for Supabase session restoration and the authenticated profile bootstrap.
---

The mobile app must put finite timeouts around session restoration and authenticated bootstrap API calls. A stalled Supabase storage/network request otherwise leaves the native app on its launch skeleton with no actionable error or retry path.

**Why:** Native preview/device startup has encountered requests that remain pending long enough to look like a frozen app, while the Metro bundle and API service are healthy.

**How to apply:** Keep the auth gate fail-open to a login/error state after a bounded wait, keep profile bootstrap retries bounded, and expose retry/logout actions rather than rendering an indefinite loading screen.