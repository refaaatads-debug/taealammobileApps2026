import assert from "node:assert/strict";
import test from "node:test";
import { MOBILE_AGORA_SESSION_PUBLISH_OPTIONS } from "../sessionMediaPolicy.ts";

test("mobile lesson sessions publish microphone audio without personal camera or screen capture", () => {
  assert.deepEqual(MOBILE_AGORA_SESSION_PUBLISH_OPTIONS, {
    publishMicrophoneTrack: true,
    publishCameraTrack: false,
    publishScreenCaptureVideo: false,
  });
});
