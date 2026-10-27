import assert from "node:assert/strict";
import test from "node:test";
import { resolveSessionPresentationStatus, sessionTeachingDurationMinutes } from "../sessionPresentation.ts";

test("uses the saved teaching duration for in-person sessions, not the package debit", () => {
  assert.equal(sessionTeachingDurationMinutes({
    delivery_mode: "in_person",
    instruction_duration_minutes: 60,
    balance_cost_minutes: 100,
    duration_minutes: 100,
  }), 60);
});

test("supports the explicit in-person teaching snapshot and configured durations", () => {
  assert.equal(sessionTeachingDurationMinutes({
    delivery_mode: "in_person",
    in_person_teaching_minutes: 45,
    instruction_duration_minutes: 60,
  }), 45);
  assert.equal(sessionTeachingDurationMinutes({ delivery_mode: "in_person" }), 60);
});

test("keeps online session duration sourced from its booking duration", () => {
  assert.equal(sessionTeachingDurationMinutes({
    delivery_mode: "online",
    duration_minutes: 100,
    instruction_duration_minutes: 60,
  }), 100);
});

test("honors the platform completion status even when the session row has no ended_at", () => {
  assert.equal(resolveSessionPresentationStatus(
    { status: "completed", session_status: "completed", delivery_mode: "in_person" },
    { started_at: "2026-10-27T07:00:00Z", ended_at: null },
  ), "completed");
});

test("shows attendance-confirmed in-person booking as active until platform completion", () => {
  assert.equal(resolveSessionPresentationStatus(
    { status: "confirmed", session_status: "in_progress", delivery_mode: "in_person" },
    { started_at: "2026-10-27T07:00:00Z", ended_at: null },
  ), "in_progress");
});

test("does not let a stale session row override a cancelled booking", () => {
  assert.equal(resolveSessionPresentationStatus(
    { status: "cancelled", session_status: "in_progress" },
    { started_at: "2026-10-27T07:00:00Z", ended_at: null },
  ), "cancelled");
});
