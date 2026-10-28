import test from "node:test";
import assert from "node:assert/strict";
import { chooseInternalCallProvider, parseInternalCallTransport } from "../internalCallTransport.ts";

test("chooses Agora after acceptance only when the ringing caller advertised support", () => {
  assert.equal(chooseInternalCallProvider({ transportProvider: "webrtc", callerAgoraCapable: true }), "agora");
});

test("keeps a legacy call on WebRTC when the caller did not advertise Agora", () => {
  assert.equal(chooseInternalCallProvider({ transportProvider: "webrtc", callerAgoraCapable: false }), "webrtc");
});

test("does not move an already pinned Agora call back to WebRTC", () => {
  assert.equal(chooseInternalCallProvider({ transportProvider: "agora", callerAgoraCapable: false }), "agora");
});

test("accepts only a complete Agora token response for the authenticated user", () => {
  assert.deepEqual(parseInternalCallTransport({
    provider: "agora",
    appId: "app",
    channel: "ajyal_internal_123",
    userAccount: "user-1",
    token: "temporary",
    expiresAt: 2_000_000_000,
  }, "user-1"), {
    provider: "agora",
    appId: "app",
    channel: "ajyal_internal_123",
    userAccount: "user-1",
    token: "temporary",
    expiresAt: 2_000_000_000,
  });
});

test("rejects a token for a different user or an incomplete provider response", () => {
  const response = {
    provider: "agora",
    appId: "app",
    channel: "call",
    userAccount: "user-2",
    token: "temporary",
    expiresAt: 2_000_000_000,
  };
  assert.throws(() => parseInternalCallTransport(response, "user-1"));
  assert.throws(() => parseInternalCallTransport({ provider: "agora" }, "user-1"));
});
