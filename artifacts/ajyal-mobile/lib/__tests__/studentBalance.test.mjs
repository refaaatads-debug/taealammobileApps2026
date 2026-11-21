import assert from "node:assert/strict";
import test from "node:test";
import { aggregateStudentBalance } from "../studentBalance.ts";

test("includes active packages with minutes even when ends_at is historical", () => {
  assert.deepEqual(
    aggregateStudentBalance([
      {
        is_active: true,
        remaining_minutes: 120,
        sessions_remaining: 2,
        ends_at: "2020-01-01T00:00:00.000Z",
        subscription_plans: { name_ar: "تجربة مجانية" },
      },
      { is_active: true, remaining_minutes: 60, sessions_remaining: 1 },
    ]),
    { remainingMinutes: 180, sessionsRemaining: 3, planName: "تجربة مجانية" },
  );
});

test("excludes inactive and depleted packages", () => {
  assert.equal(aggregateStudentBalance([
    { is_active: false, remaining_minutes: 60, sessions_remaining: 1 },
    { is_active: true, remaining_minutes: 0, sessions_remaining: 1 },
  ]), null);
});
