---
name: Manual map selection boundary
description: Keep map coordinates and reverse-geocoded labels separate from Google Places city upserts.
---

Only details selected from Google Places should flow through the `selectedPlace` path that calls the Saudi-city upsert RPC. A manually tapped or device-derived coordinate should save its coordinates and display address while preserving the user's selected city; do not synthesize a Places result from reverse geocoding.

**Why:** Reverse geocoding can return noncanonical or localized city names, which could create unintended city rows through a Places-specific write path.

**How to apply:** In the in-person address picker, only set a pending Places object for a Google Places result. Keep manual map taps and current-location selection as coordinate/address results.
