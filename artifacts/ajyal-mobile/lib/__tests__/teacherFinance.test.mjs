import assert from "node:assert/strict";
import test from "node:test";
import {
  getAvailableTeacherBalance,
  groupTeacherEarningsByMonthAndType,
} from "../teacherFinance.ts";

test("reads the current platform balance field", () => {
  assert.equal(getAvailableTeacherBalance({ available_balance: 125.5 }), 125.5);
});

test("supports the previous balance field while older RPC data is still served", () => {
  assert.equal(getAvailableTeacherBalance({ available_for_withdrawal: 80 }), 80);
});

test("returns zero for missing or invalid balance values", () => {
  assert.equal(getAvailableTeacherBalance(null), 0);
  assert.equal(getAvailableTeacherBalance({ available_balance: "not-a-number" }), 0);
});

test("groups monthly transfers, bonuses, and deductions separately", () => {
  const groups = groupTeacherEarningsByMonthAndType([
    { id: "transfer-1", month: "2026-10", earning_type: "monthly_transfer", amount: 450, hours: 10, status: "confirmed" },
    { id: "transfer-2", month: "2026-10", earning_type: "monthly_transfer", amount: 50, hours: 1, status: "confirmed" },
    { id: "bonus", month: "2026-10", earning_type: "bonus", amount: 100, hours: 0, status: "confirmed" },
    { id: "deduction", month: "2026-10", earning_type: "deduction", amount: -20, hours: 0, status: "confirmed" },
    { id: "legacy", month: "2026-09", amount: 75, hours: 2, status: "confirmed" },
  ]);

  assert.equal(groups.length, 4);
  assert.deepEqual(
    groups.map(({ month, earningType }) => `${month}:${earningType}`),
    [
      "2026-10:bonus",
      "2026-10:deduction",
      "2026-10:monthly_transfer",
      "2026-09:monthly_transfer",
    ],
  );
  assert.equal(groups.find((group) => group.earningType === "monthly_transfer" && group.month === "2026-10")?.amount, 500);
  assert.equal(groups.find((group) => group.earningType === "deduction")?.amount, -20);
  assert.equal(groups.find((group) => group.month === "2026-09")?.hours, 2);
});
