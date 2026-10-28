import assert from "node:assert/strict";
import test from "node:test";
import {
  getFinalSessionElapsed,
  isSessionTimerPeerReady,
  parseSessionTimerSync,
} from "../sessionTimer.ts";

test("does not consider the local teacher's Agora connection to be a joined pair", () => {
  assert.equal(isSessionTimerPeerReady({
    connectionState: "connected",
    transportProvider: "agora",
    remoteUid: null,
  }), false);
});

test("requires both connected transport and remote Agora participant before showing timer sync", () => {
  assert.equal(isSessionTimerPeerReady({
    connectionState: "connecting",
    transportProvider: "agora",
    remoteUid: "teacher-1",
  }), false);
  assert.equal(isSessionTimerPeerReady({
    connectionState: "connected",
    transportProvider: "agora",
    remoteUid: "teacher-1",
  }), true);
});

test("WebRTC timer readiness requires an established peer connection", () => {
  assert.equal(isSessionTimerPeerReady({
    connectionState: "connected",
    transportProvider: "webrtc",
    remoteUid: null,
  }), true);
  assert.equal(isSessionTimerPeerReady({
    connectionState: "disconnected",
    transportProvider: "webrtc",
    remoteUid: null,
  }), false);
});

test("accepts only timer-sync as the shared elapsed source, not the early timer-start event", () => {
  assert.equal(parseSessionTimerSync({ type: "timer-start", startedAt: "2026-10-19T10:00:00Z" }), null);
  assert.deepEqual(parseSessionTimerSync({ type: "timer-sync", elapsed: 42.9, paused: true }), {
    elapsed: 42,
    paused: true,
  });
});

test("rejects malformed elapsed values and preserves pause state across disconnect/rejoin", () => {
  assert.equal(parseSessionTimerSync({ type: "timer-sync", elapsed: Number.NaN }), null);
  const paused = parseSessionTimerSync({ type: "timer-sync", elapsed: 75, paused: true });
  const resumed = parseSessionTimerSync({ type: "timer-sync", elapsed: 75, paused: false });
  assert.deepEqual(paused, { elapsed: 75, paused: true });
  assert.deepEqual(resumed, { elapsed: 75, paused: false });
});

test("uses the platform's persisted duration at end, never wall-clock started_at math", () => {
  assert.equal(getFinalSessionElapsed({
    endedAt: "2026-10-19T10:10:00Z",
    durationSeconds: 315,
  }), 315);
  assert.equal(getFinalSessionElapsed({
    endedAt: null,
    durationSeconds: 315,
  }), null);
});
