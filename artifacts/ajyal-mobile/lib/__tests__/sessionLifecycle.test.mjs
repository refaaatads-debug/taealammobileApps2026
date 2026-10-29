import assert from "node:assert/strict";
import test from "node:test";
import { isSessionEnded } from "../sessionLifecycle.ts";

test("recognizes the teacher's authoritative ended_at update", () => {
  assert.equal(isSessionEnded({ endedAt: "2026-10-19T10:00:00.000Z" }), true);
});

test("recognizes completed booking state when Realtime delivers the booking first", () => {
  assert.equal(isSessionEnded({ bookingStatus: "completed" }), true);
  assert.equal(isSessionEnded({ sessionStatus: "completed" }), true);
});

test("recognizes cancelled sessions as terminal", () => {
  assert.equal(isSessionEnded({ bookingStatus: "cancelled" }), true);
  assert.equal(isSessionEnded({ sessionStatus: "cancelled" }), true);
});

test("does not treat an in-progress session as ended", () => {
  assert.equal(isSessionEnded({ sessionStatus: "in_progress", bookingStatus: "confirmed" }), false);
});
