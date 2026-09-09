---
name: Expo DevTools on NixOS
description: Expo Metro can run normally even when the optional React Native DevTools binary cannot load libglib in the NixOS workspace.
---

The missing `libglib-2.0.so.0` message comes from the optional React Native DevTools installer, not from Metro or the application bundle.

**Why:** The mobile workflow still served Metro, built the app, and rendered the preview while this warning was present.

**How to apply:** Treat it as non-blocking unless Metro, the preview, or the native bundle also fails; do not change application code to work around the warning.