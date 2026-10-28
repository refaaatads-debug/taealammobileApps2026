import assert from "node:assert/strict";
import test from "node:test";
import { parseSessionTransport } from "../sessionTransport.ts";

test("accepts only the complete Agora transport response", () => {
  assert.deepEqual(
    parseSessionTransport({
      provider: "agora",
      appId: "app-id",
      channel: "ajyal_booking",
      uid: "user-id",
      token: "rtc-token",
      expiresAt: 1_900_000_000,
    }),
    {
      provider: "agora",
      appId: "app-id",
      channel: "ajyal_booking",
      uid: "user-id",
      token: "rtc-token",
      expiresAt: 1_900_000_000,
    },
  );
});

test("accepts WebRTC only when the server confirms the booking is legacy-pinned", () => {
  assert.deepEqual(parseSessionTransport({ provider: "webrtc", legacyActive: true }), {
    provider: "webrtc",
    legacyActive: true,
  });
});

test("rejects malformed or unknown provider responses rather than selecting a fallback", () => {
  assert.throws(() => parseSessionTransport({ provider: "agora", token: "incomplete" }));
  assert.throws(() => parseSessionTransport({ provider: "webrtc", legacyActive: false }));
  assert.throws(() => parseSessionTransport({ provider: "unknown" }));
  assert.throws(() => parseSessionTransport(null));
});
