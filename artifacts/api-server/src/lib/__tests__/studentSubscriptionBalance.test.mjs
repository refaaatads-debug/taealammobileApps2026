import assert from "node:assert/strict";
import test from "node:test";
import { activeStudentSubscriptionFilters } from "../studentSubscriptionBalance.ts";

test("dashboard balance uses active flag and remaining minutes, not historical end date", () => {
  assert.deepEqual(activeStudentSubscriptionFilters, {
    is_active: "eq.true",
    remaining_minutes: "gt.0",
  });
  assert.equal("or" in activeStudentSubscriptionFilters, false);
});
