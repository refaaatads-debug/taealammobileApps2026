import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldAutoOpenStartedSession,
  shouldRedirectFromLiveSession,
} from "../liveSessionRoute.ts";

test("keeps the live-session route while the booking lifecycle is still loading", () => {
  assert.equal(shouldRedirectFromLiveSession(false, "booking-1", "accepted", "waiting_acceptance"), false);
});

test("redirects when the route has no booking or the booking no longer exists", () => {
  assert.equal(shouldRedirectFromLiveSession(false, undefined, null, null), true);
  assert.equal(shouldRedirectFromLiveSession(true, "booking-1", null, null), true);
});

test("keeps accepted sessions waiting for the teacher to start", () => {
  assert.equal(shouldRedirectFromLiveSession(true, "booking-1", "accepted", "waiting_acceptance"), false);
});

test("redirects from cancelled or ended sessions", () => {
  assert.equal(shouldRedirectFromLiveSession(true, "booking-1", "cancelled", "cancelled"), true);
  assert.equal(shouldRedirectFromLiveSession(true, "booking-1", "accepted", "ended"), true);
});

test("does not auto-open a stale started-session record after its booking ended", () => {
  assert.equal(shouldAutoOpenStartedSession("booking-1", "completed", "in_progress"), false);
  assert.equal(shouldAutoOpenStartedSession("booking-1", "cancelled", "in_progress"), false);
  assert.equal(shouldAutoOpenStartedSession("booking-1", "accepted", "ended"), false);
});

test("only auto-opens a started session belonging to a still-valid booking", () => {
  assert.equal(shouldAutoOpenStartedSession("booking-1", "accepted", "in_progress"), true);
  assert.equal(shouldAutoOpenStartedSession("booking-1", "confirmed", "waiting_acceptance"), true);
  assert.equal(shouldAutoOpenStartedSession(undefined, "accepted", "in_progress"), false);
  assert.equal(shouldAutoOpenStartedSession("booking-1", null, "in_progress"), false);
});
