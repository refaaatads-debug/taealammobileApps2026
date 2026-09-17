---
name: Android RTCView track selection
description: react-native-webrtc Android renderer behavior when a remote MediaStream contains camera and screen video tracks.
---

`react-native-webrtc` Android `RTCView` renders only the first video track in the supplied `MediaStream`; it does not automatically choose a later screen-share track. When a teacher adds a second video transceiver, the mobile receiver must preserve the remote track event and build a render stream with the newest video track first. On removal, the camera track must be promoted again.

**Why:** A remote screen track can arrive correctly through Unified Plan, SDP renegotiation, and `ontrack` while remaining invisible because the native renderer keeps attaching to the camera track at index zero.

**How to apply:** Keep audio tracks and remote video tracks together for the session, but order the selected screen/new video before other video tracks before passing the stream URL to Android `RTCView`. Preserve track-id replacement when native wrappers are recreated after stop/start.