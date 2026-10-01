---
name: Replit Expo Go simulator routing
description: Non-obvious requirements for loading an Expo artifact in Replit's streamed iOS and Android simulators.
---

Replit's streamed iOS and Android simulators use Expo Go. When `expo-dev-client` is installed, the development workflow must explicitly start Expo with `--go`; otherwise the generated launch flow can target a Development Build and fail before the app renders.

**Why:** A project can produce valid iOS and Android bundles while the simulators remain on Expo Go Home or show client/signature errors when the launch target is ambiguous. Replit's artifact proxy also needs the Metro URL without its internal port.

**How to apply:** Run Expo behind a small proxy on the artifact's assigned port, set `EXPO_PACKAGER_PROXY_URL` to the Replit Expo domain, forward Metro requests to an internal port, remove the proxy `Origin` header, and add `expo-platform` for native root/manifest requests when missing. Keep generic browser root requests on Web.

Signed Expo Go manifests can fail with a transient `ENOENT` during a rename of Expo's development code-signing cache when iOS and Android open at the same time. The web preview and unsigned manifests can remain healthy while both simulator launch screens report HTTP 500.

**Why:** Expo lazily initializes the shared development signing cache for signed native manifests; concurrent first requests can race on its cache write.

**How to apply:** Verify native requests with the `expo-expect-signature` header and check both platform bundles via the public Expo preview domain. Retry only this specific cache-rename failure once within the development preview proxy; do not disable signature verification or hide unrelated 500 responses. The simulator's existing error screen still needs a manual retry after the service recovers.

Expo Go's signed native manifest uses `Accept: multipart/mixed`, and the response must remain multipart. A proxy that forces JSON or rewrites the response content type can return HTTP 200 with a signature header and a working bundle but omit the certificate chain. iOS then rejects the project with a misleading code-signing extended-key-usage error, while Android can show its generic blue failure screen.

**Why:** Expo CLI attaches the public certificate chain only to the multipart response; JSON-only smoke checks gave a false sense of success while the actual simulators still failed.

**How to apply:** Preserve the client's Accept header and Expo's upstream Content-Type. Test the public preview domain with the signed multipart request used by Expo Go, confirm both certificates are present with Code Signing EKU, and separately verify the iOS/Android bundle URLs. Do not infer native simulator health from Web or signed JSON responses.