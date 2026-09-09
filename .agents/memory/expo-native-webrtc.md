---
name: Expo native WebRTC
description: Native react-native-webrtc sessions require a development build and the Expo config plugin.
---

Expo Go does not include native WebRTC. A mobile session using `react-native-webrtc` must ship through an Expo Development Build with `expo-dev-client` and `@config-plugins/react-native-webrtc`; web preview can still use browser WebRTC.

**Why:** Installing the JavaScript package alone makes TypeScript and web bundling pass but leaves the native module unavailable at runtime.

**How to apply:** When adding or debugging native WebRTC in this Expo app, verify the plugin output and rebuild the native client before treating a physical-device call as validated.