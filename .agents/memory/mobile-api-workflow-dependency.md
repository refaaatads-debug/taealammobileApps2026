---
name: Mobile API workflow dependency
description: The native mobile app needs the API artifact workflow running alongside Expo for authenticated profile bootstrap and dashboard calls.
---

The mobile bundle can load its native manifest and JavaScript successfully while the authenticated app remains on the account-verification screen if the API workflow is stopped. The mobile client calls the shared `/api` routes on the Expo public domain, which the Replit router forwards to the API artifact.

**Why:** Native startup and Supabase authentication can succeed independently, but profile bootstrap and dashboard requests still require the API service; a stopped API therefore looks like an authentication/profile failure rather than a Metro failure.

**How to apply:** When validating the mobile simulator, keep `artifacts/api-server: API Server` running with `artifacts/ajyal-mobile: expo`; verify `/api/healthz` is `200` and authenticated `/api/me`/dashboard calls are not failing before debugging app UI.