---
name: Push notification audio names
description: Custom Expo push sounds must use the exact packaged asset filenames across server payloads and Android channels.
---

Use the packaged audio filenames exactly, including underscores and the `.wav` suffix, in Expo push payloads and Android notification channels.

**Why:** Expo Android custom sounds are resolved by resource filename; a different separator or basename can make the notification fall back to silent/default audio.

**How to apply:** When adding or renaming a notification sound, update `app.json`, the native channel configuration, and server-side Expo payload presentation together.

Android also persists a channel's sound and importance after the first creation. If those policies change, use a new channel id in the mobile and server constants together, then rebuild the Android artifact; updating the old id alone is not reliable.

**Why:** Devices can retain a previously silent channel configuration even after the app code requests a different sound.

**How to apply:** Version channel ids when notification behavior changes, and verify the new channel on a real Android Preview build.