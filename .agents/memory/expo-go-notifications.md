---
name: Expo Go notifications
description: Compatibility boundary for expo-notifications in the Android Expo Go client.
---

On Android Expo Go, expo-notifications remote push support is removed and the package can throw while its native module is evaluated. A runtime platform check after a static import is too late.

**Why:** The app crashed before rendering because InternalCallContext statically imported expo-notifications, even though its push setup was guarded for Expo Go.

**How to apply:** Keep notification imports type-only, dynamically load the runtime module only for supported native builds, and keep foreground call state independent of push notification availability.