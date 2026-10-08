import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseLegacyNotificationFallback,
  hasPushEligibleRole,
  incomingCallRowMatches,
} from "../pushIdentity.ts";

test("withdrawal fallback can only notify the authenticated account itself", () => {
  assert.equal(canUseLegacyNotificationFallback("teacher-1", "teacher-1", "withdrawal", null), true);
  assert.equal(canUseLegacyNotificationFallback("teacher-1", "student-1", "withdrawal", "notification-1"), false);
  assert.equal(canUseLegacyNotificationFallback(" ", " ", "withdrawal", null), false);
});

test("legacy notification fallback requires a matching persisted notification", () => {
  assert.equal(canUseLegacyNotificationFallback("student-1", "teacher-1", "booking_request", "notification-1"), true);
  assert.equal(canUseLegacyNotificationFallback("student-1", "teacher-1", "booking_request", null), false);
});

test("allows push registration only for verified student or teacher roles", () => {
  assert.equal(hasPushEligibleRole(["student"]), true);
  assert.equal(hasPushEligibleRole(["teacher"]), true);
  assert.equal(hasPushEligibleRole([]), false);
  assert.equal(hasPushEligibleRole(["parent"]), false);
  assert.equal(hasPushEligibleRole(["admin"]), false);
});

test("authorizes a verified internal call row with canonical participant IDs", () => {
  assert.equal(
    incomingCallRowMatches(
      { id: "call-123", caller_id: "teacher-1", callee_id: "student-1" },
      "call-123",
      "teacher-1",
      "student-1",
    ),
    true,
  );
});

test("accepts supported internal-call participant aliases", () => {
  assert.equal(
    incomingCallRowMatches(
      { id: "call-123", from_user_id: "teacher-1", to_user_id: "student-1" },
      "call-123",
      "teacher-1",
      "student-1",
    ),
    true,
  );
});

test("rejects unverified, mismatched, missing-ID, and conflicting call rows", () => {
  assert.equal(incomingCallRowMatches(null, "call-123", "teacher-1", "student-1"), false);
  assert.equal(incomingCallRowMatches({ id: "other-call", caller_id: "teacher-1", callee_id: "student-1" }, "call-123", "teacher-1", "student-1"), false);
  assert.equal(incomingCallRowMatches({ id: "call-123", caller_id: "other-teacher", callee_id: "student-1" }, "call-123", "teacher-1", "student-1"), false);
  assert.equal(incomingCallRowMatches({ id: "call-123", caller_id: "teacher-1", callee_id: "other-student" }, "call-123", "teacher-1", "student-1"), false);
  assert.equal(incomingCallRowMatches({ id: "call-123", from_user_id: "other-teacher", caller_id: "teacher-1", callee_id: "student-1" }, "call-123", "teacher-1", "student-1"), false);
});