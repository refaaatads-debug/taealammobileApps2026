---
name: Mobile onboarding order
description: Startup ordering for the Ajyal mobile app's first-use welcome screens and authentication.
---

Show onboarding only for an unauthenticated first-use device flow, then show the login form. A restored authenticated session must go directly to account verification/home and must never be covered by onboarding.

**Why:** The user confirmed that new users should see welcome screens before login, while returning users should not be interrupted by them.

**How to apply:** Keep the completion marker in local storage for first-use behavior, and gate onboarding with `!isAuthenticated` in addition to the resolved storage/bootstrap state. Treat this as device-level first use, not account-level onboarding, because the flow occurs before login.