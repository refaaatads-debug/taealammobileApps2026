---
name: Expo DevTools on NixOS
description: Expo Metro can run normally even when the optional React Native DevTools binary cannot load native NixOS libraries.
---

Missing `libglib-2.0.so.0`, `libnspr4.so`, or other desktop GUI libraries such as GTK/GBM come from the optional React Native DevTools installer, not from Metro or the application bundle. In Replit Preview, set Expo's `EXPO_UNSTABLE_HEADLESS=1` so the standalone DevTools shell is not installed or launched.

**Why:** The mobile workflow can serve Metro and build the app while the optional DevTools binary cannot load NixOS desktop libraries; Replit's headless Preview has no need for that shell. A configured `EXPO_TOKEN` also makes the optional `create-launch login --session ...` step fail by design.

**How to apply:** Keep the headless flag in the Preview start command and skip `create-launch login` when `EXPO_TOKEN` is already present. Do not change application code or add desktop dependencies just to support DevTools; verify `/status`, the workflow state, and Metro logs separately.