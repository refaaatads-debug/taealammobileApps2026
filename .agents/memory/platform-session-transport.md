---
name: Platform session transport
description: The original web session uses Supabase Realtime signaling with direct WebRTC and TURN credentials, not a separate VPS room protocol.
---

The verified session contract in the original web repository is Supabase Realtime Broadcast on `webrtc-${bookingId}` with `signal` payloads, direct `RTCPeerConnection` media, and TURN credentials from the `turn-credentials` Edge Function. Join payloads include `{ userId }`; offer creation is driven by `onnegotiationneeded` after tracks/transceivers are added. The VPS may host infrastructure, but no independent WebSocket, LiveKit, Jitsi, Zoom, or room endpoint is proven by the session source.

**Why:** The mobile app must follow the original platform contract; inventing a VPS WebSocket URL or replacing Realtime would create a second session system and break cross-client compatibility.

**How to apply:** Before changing mobile session transport, compare against the original `LiveSession` and `useWebRTC` sources. Treat mobile's matching channel and Edge Function as transport parity, while tracking advanced gaps such as SDP tuning, glare handling, data channels, recording, and ICE quality telemetry separately.