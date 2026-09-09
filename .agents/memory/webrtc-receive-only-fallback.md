---
name: WebRTC receive-only fallback
description: A student can join a lesson even when the mobile client cannot open local camera or microphone devices.
---

The student media client must treat local camera/microphone acquisition as optional for joining. If device access fails, create receive-only audio/video transceivers where supported and keep signaling/data-channel setup alive; surface a nonfatal media warning separately from connection errors.

**Why:** Physical devices, browser previews, permissions, and emulators can report `Requested device not found` even though the student should still be able to receive the teacher's lesson.

**How to apply:** Do not let the final `getUserMedia` rejection escape the session start path. Keep a real connection failure distinct from a media-input warning, and validate the full path in an Expo Development Build.