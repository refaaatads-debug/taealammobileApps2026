import test from "node:test";
import assert from "node:assert/strict";
import { getInPersonBookingSnapshot } from "../inPersonBookingSnapshot.ts";

test("uses only saved booking values and never invents default minutes or prices", () => {
  assert.deepEqual(getInPersonBookingSnapshot({}), {
    instructionMinutes: null,
    packageMinutes: null,
    studentValueSar: null,
    teacherRateSar: null,
    platformShareSar: null,
    pricingSource: null,
  });
});

test("preserves the saved duration, package deduction, and captured pricing", () => {
  assert.deepEqual(getInPersonBookingSnapshot({
    instruction_duration_minutes: 45,
    balance_cost_minutes: 75,
    in_person_student_value_sar: "120.00",
    in_person_teacher_rate_sar: 100,
    in_person_platform_share_sar: 20,
    in_person_pricing_source: "teacher_override",
  }), {
    instructionMinutes: 45,
    packageMinutes: 75,
    studentValueSar: 120,
    teacherRateSar: 100,
    platformShareSar: 20,
    pricingSource: "teacher_override",
  });
});

test("preserves independent 70-minute teaching and 110-minute package snapshots", () => {
  assert.deepEqual(getInPersonBookingSnapshot({
    instruction_duration_minutes: 70,
    balance_cost_minutes: 110,
  }), {
    instructionMinutes: 70,
    packageMinutes: 110,
    studentValueSar: null,
    teacherRateSar: null,
    platformShareSar: null,
    pricingSource: null,
  });
});

test("rejects invalid or negative snapshot values instead of displaying them", () => {
  const snapshot = getInPersonBookingSnapshot({
    instruction_duration_minutes: -30,
    balance_cost_minutes: "unknown",
    in_person_student_value_sar: -10,
    in_person_teacher_rate_sar: null,
  });
  assert.equal(snapshot.instructionMinutes, null);
  assert.equal(snapshot.packageMinutes, null);
  assert.equal(snapshot.studentValueSar, null);
  assert.equal(snapshot.teacherRateSar, null);
});
