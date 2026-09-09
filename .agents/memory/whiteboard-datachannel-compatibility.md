---
name: Whiteboard data-channel compatibility
description: Session whiteboard messages may use event/kind envelopes and varied nested path or permission payloads.
---

The session whiteboard transport must normalize incoming DataChannel messages before dispatching them to the mobile UI. Do not require `type` alone: compatible messages may identify the event with `event` or `kind`, may be nested under `payload` or `data`, and may arrive as text or binary data.

**Why:** The mobile client previously dropped valid teacher drawings and student-write permissions before the session screen saw them, so neither side appeared synchronized even though the WebRTC channel was connected.

**How to apply:** Keep the transport parser tolerant of event aliases and normalize whiteboard paths and permission fields at the boundary. Preserve both the wrapped action and direct point fields when sending student drawings so the desktop peer can consume the same action without a second protocol.