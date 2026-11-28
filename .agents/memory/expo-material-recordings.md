---
name: In-app material recordings
description: The mobile materials screen’s private session recordings must stay inside the Expo app.
---

Private recording files are resolved to short-lived Supabase Storage signed URLs and played with the Expo video player inside an app modal. Do not send these URLs to `Linking.openURL`, because that hands playback to Safari or another external system player.

**Why:** `Linking.openURL` opens a new browser tab or external media handler, which breaks the intended in-app learning flow and makes the private recording feel like it left the product.

**How to apply:** Keep the storage bucket private, preserve signed URL expiry, show loading/playback/close states, and use a development build when native video support requires it. Mount the player only after the signed URL is ready; on web, set `preload="none"` before attaching the source and leave playback to the browser controls. Retry by resolving a fresh signed URL.

**Why:** Handing a private media URL to an external player breaks the in-app learning flow. These MediaRecorder WebM files can also have unknown duration, and Chromium's metadata preload can trigger a demuxer seek failure before playback.