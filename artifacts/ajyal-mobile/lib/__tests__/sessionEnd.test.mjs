import assert from "node:assert/strict";
import test from "node:test";
import { isSessionEnded, shouldUseSessionEndRealtimeFallback } from "../sessionLifecycle.ts";
import {
  createSessionEndBroadcast,
  isSessionEndBroadcastFromPeer,
  waitForSessionEndConfirmation,
} from "../sessionEnd.ts";

test("creates a normalized Realtime end signal without changing billing data", () => {
  assert.deepEqual(createSessionEndBroadcast("student-1", 91.8), {
    by: "student-1",
    elapsed: 91,
  });
  assert.equal(createSessionEndBroadcast("", 20), null);
  assert.equal(createSessionEndBroadcast("student-1", Number.NaN), null);
  assert.equal(createSessionEndBroadcast("student-1", -1), null);
});

test("accepts only an end signal from the expected other participant", () => {
  const message = { by: "teacher-1", elapsed: 91 };
  assert.equal(isSessionEndBroadcastFromPeer(message, "student-1", "teacher-1"), true);
  assert.equal(
    isSessionEndBroadcastFromPeer({ by: "student-1", elapsed: 91 }, "teacher-1", "student-1"),
    true,
  );
  assert.equal(isSessionEndBroadcastFromPeer(message, "teacher-1", "teacher-1"), false);
  assert.equal(isSessionEndBroadcastFromPeer(message, "student-1", "other-teacher"), false);
  assert.equal(isSessionEndBroadcastFromPeer({ by: "teacher-1", elapsed: "91" }, "student-1", "teacher-1"), false);
});

test("uses Realtime fallback when the data channel is down or confirmation needs a retry", () => {
  assert.equal(shouldUseSessionEndRealtimeFallback({
    forceRealtimeFallback: false,
    primarySent: false,
    connectionConnected: true,
    dataChannelOpen: false,
  }), true);
  assert.equal(shouldUseSessionEndRealtimeFallback({
    forceRealtimeFallback: false,
    primarySent: true,
    connectionConnected: false,
    dataChannelOpen: true,
  }), true);
  assert.equal(shouldUseSessionEndRealtimeFallback({
    forceRealtimeFallback: true,
    primarySent: true,
    connectionConnected: true,
    dataChannelOpen: true,
  }), true);
  assert.equal(shouldUseSessionEndRealtimeFallback({
    forceRealtimeFallback: false,
    primarySent: true,
    connectionConnected: true,
    dataChannelOpen: true,
  }), false);
});

test("waits for platform confirmation before treating a remote end signal as complete", async () => {
  let clock = 0;
  let reads = 0;
  const result = await waitForSessionEndConfirmation(async () => {
    reads += 1;
    return reads === 3 ? { endedAt: "2026-11-13T12:00:00.000Z" } : null;
  }, isSessionEnded, {
    timeoutMs: 1_000,
    pollIntervalMs: 100,
    now: () => clock,
    sleep: async (milliseconds) => { clock += milliseconds; },
  });

  assert.equal(reads, 3);
  assert.equal(result?.endedAt, "2026-11-13T12:00:00.000Z");
});

test("does not accept a broadcast as session completion without authoritative state", async () => {
  let clock = 0;
  const result = await waitForSessionEndConfirmation(async () => ({
    sessionStatus: "in_progress",
    bookingStatus: "confirmed",
  }), isSessionEnded, {
    timeoutMs: 300,
    pollIntervalMs: 100,
    now: () => clock,
    sleep: async (milliseconds) => { clock += milliseconds; },
  });

  assert.equal(result, null);
  assert.equal(clock, 300);
});
