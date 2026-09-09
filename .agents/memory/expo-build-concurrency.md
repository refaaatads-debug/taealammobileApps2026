---
name: Expo build concurrency
description: Environment constraint for building the mobile artifact while other preview services are running.
---

Expo's production bundle script must use a configurable Metro port and detect occupied ports with a TCP check, rather than assuming 8081 or relying only on an HTTP status endpoint.

**Why:** The component preview service can occupy 8081; Expo's non-interactive CLI then asks to switch ports and times out instead of completing the build.

**How to apply:** Keep `EXPO_BUILD_PORT`/`PORT` as the starting port, probe availability before starting Metro, and pass the selected port through every bundle, manifest, and asset request.

Expo 57 may log a missing `libglib-2.0.so.0` error while installing React Native DevTools in the Nix preview environment; Metro and Android/iOS bundle generation can still complete successfully.

**Why:** The DevTools helper is optional for the bundle build, so treating this log as a build failure causes unnecessary investigation.

**How to apply:** Confirm that Metro reports ready and both platform bundles finish before treating the DevTools message as a blocker.

Running API codegen with `clean: true` while Expo Metro is already serving can briefly remove `generated/api.ts` and produce a false module-resolution error.

**Why:** Orval cleans and recreates the generated client directory, while Metro may resolve imports during that short window.

**How to apply:** Run codegen before restarting Expo, or restart the Expo workflow after codegen completes before judging its browser logs.