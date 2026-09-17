---
name: Expo Preview build gating
description: Prevent the static Expo Preview workflow from rebuilding on every service restart.
---

The static Expo Preview server should reuse an existing bundle when it is present and rebuild only when the bundle is missing or source files are newer. An explicit force-build switch can be used for intentional rebuilds.

**Why:** Re-running `expo export` during every managed workflow start is resource-heavy and can make the Replit Workspace restart, which appears to users as repeated Preview reloads. Multiple Preview clients can also make API bootstrap requests look like an application polling loop.

**How to apply:** Keep bundle generation isolated from the serving process, gate it by bundle/source freshness, and verify the workflow remains running with `/status` after startup. Do not treat concurrent API requests from different Preview user agents as proof of a single-client React refetch loop.

Native Simulate clients also call the Preview server with an `expo-platform` header and expect JSON from `/manifest`; Web-only static servers must proxy/serve platform manifests and their referenced native bundles. Keep the previous native manifest available while a replacement build is running so clients do not receive HTML or a transient missing-file response.

**Why:** A Web Preview can look healthy while iOS and Android Simulate fail with “Failed to parse manifest JSON” if `/manifest` falls through to the Web shell. Removing native manifests at build start turns a slow rebuild into a visible native outage.

**How to apply:** Serve `ios`/`android` manifests and safe static-build paths from the same Preview origin, build native bundles in the background, and replace the platform manifests only after bundle and asset processing completes.