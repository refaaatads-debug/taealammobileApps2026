import assert from "node:assert/strict";
import test from "node:test";
import { mapAgoraConnectionEvent, stateAfterOwnLinkConnected } from "../sessionAgoraConnectionState.ts";

test("joining our own channel alone is still connecting", () => {
  assert.equal(mapAgoraConnectionEvent("joined-channel"), "connecting");
});

test("a remote user joining counts as connected even if they never publish audio (muted web teacher)", () => {
  assert.equal(mapAgoraConnectionEvent("remote-joined"), "connected");
});

test("remote audio stopped or frozen (mute, weak network) does not become disconnected", () => {
  assert.equal(mapAgoraConnectionEvent("remote-audio-interrupted"), "connected");
  assert.equal(mapAgoraConnectionEvent("remote-audio-starting"), "connected");
  assert.equal(mapAgoraConnectionEvent("remote-audio-playing"), "connected");
});

test("remote leave and Agora errors still report disconnected and failed", () => {
  assert.equal(mapAgoraConnectionEvent("remote-left"), "disconnected");
  assert.equal(mapAgoraConnectionEvent("error"), "failed");
});

test("our own link reconnecting keeps connected when the peer is still present", () => {
  assert.equal(stateAfterOwnLinkConnected(true), "connected");
  assert.equal(stateAfterOwnLinkConnected(false), "connecting");
});
