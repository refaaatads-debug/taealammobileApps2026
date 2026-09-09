---
name: Same-path navigation cancellation
description: Mobile auth navigation rule for data loading
---

After authentication, do not navigate to the dashboard route when the router is already on that route; let the authenticated state render the dashboard in place.

**Why:** Replacing the current route can remount the provider tree and cancel the initial profile request before it reaches the API, presenting a repeated loading screen even though Auth already has a valid Bearer session.

**How to apply:** Gate post-login `router.replace` on the current pathname. Treat a successful profile response with a resolved role as the completion of the auth-to-dashboard transition.