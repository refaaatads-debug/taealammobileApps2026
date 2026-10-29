import assert from "node:assert/strict";
import test from "node:test";
import { mapAgoraConnectionEvent } from "../sessionAgoraConnectionState.ts";

test("Agora remains connecting until the remote audio stream is playing", () => {
  assert.equal(mapAgoraConnectionEvent("joined-channel"), "connecting");
  assert.equal(mapAgoraConnectionEvent("remote-joined"), "connecting");
  assert.equal(mapAgoraConnectionEvent("remote-audio-starting"), "connecting");
  assert.equal(mapAgoraConnectionEvent("remote-audio-playing"), "connected");
});

test("remote leave and Agora errors do not continue to claim peer audio is connected", () => {
  assert.equal(mapAgoraConnectionEvent("remote-left"), "disconnected");
  assert.equal(mapAgoraConnectionEvent("remote-audio-interrupted"), "disconnected");
  assert.equal(mapAgoraConnectionEvent("error"), "failed");
});
