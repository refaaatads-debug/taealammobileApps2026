---
name: Platform session transport
description: Lessons and internal calls use Agora; mobile receives the teacher's screen without publishing a personal camera.
---

The user chose Agora as the only session and internal-call media transport across the mobile app. Lesson teachers start screen sharing from the web platform only; mobile clients join via Agora, publish microphone audio only, and receive the teacher's screen or documents.

The existing Supabase Realtime topic `webrtc-${bookingId}` is retained as a legacy channel name for session data messages; it does not identify the media transport.

**Why:** A prior migration plan preserved active WebRTC calls, but the user later explicitly chose to remove WebRTC throughout the app and use Agora for internal calls as well.

**How to apply:** Keep provider validation Agora-only and never add a WebRTC fallback. Preserve the web-only teacher broadcast boundary, and do not rename the Supabase topic unless the web platform changes it in the same release.
