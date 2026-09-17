---
name: Replit Expo Go simulator routing
description: Non-obvious requirements for loading an Expo artifact in Replit's streamed iOS and Android simulators.
---

Replit's streamed iOS and Android simulators use Expo Go. When `expo-dev-client` is installed, the development workflow must explicitly start Expo with `--go`; otherwise the generated launch flow can target a Development Build and fail before the app renders.

**Why:** A project can produce valid iOS and Android bundles while the simulators remain on Expo Go Home or show client/signature errors when the launch target is ambiguous. Replit's artifact proxy also needs the Metro URL without its internal port.

**How to apply:** Run Expo behind a small proxy on the artifact's assigned port, set `EXPO_PACKAGER_PROXY_URL` to the Replit Expo domain, forward Metro requests to an internal port, remove the proxy `Origin` header, and add `expo-platform` for native root/manifest requests when missing. Keep generic browser root requests on Web.