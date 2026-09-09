---
name: Internal call delivery
description: The source-of-truth lifecycle and delivery requirements for teacher-to-student internal calls.
---

The internal call lifecycle starts with `start_internal_call` and is persisted in `internal_calls`; a student client must subscribe to that table through Supabase Realtime and also register push delivery for background ringing. Accepting runs `respond_internal_call`; `mark_internal_call_connected` runs only after the peer connection succeeds. Audio uses `internal-voice-<call-id>` with `ready`, `offer`, `answer`, and `ice` broadcasts. Push delivery is best-effort and must never clear an already-created call when a token is missing or the push provider fails. The mobile foreground experience uses a bundled looping call sound and Arabic caller announcement; native WebRTC and custom background notification sounds require a Development Build.

**Why:** The web teacher flow can create a valid call row without sending the mobile-specific notification route, so a mobile client that listens only for push can silently miss a call that is already ringing in production. A missing recipient push token can otherwise turn successful Realtime delivery into a false failed call. Reusing a booking video channel can cross-wire separate calls or start session media unintentionally.

**How to apply:** Keep Realtime as the foreground source and push as the background/wakeup path. Match the web voice channel and wrapped signaling payloads exactly, key the peer lifecycle by stable call ID, and keep session-video signaling separate. Do not replace the platform RPC lifecycle with local state or direct phone dialing; paid phone calls must remain on `make-phone-call`.