import assert from "node:assert/strict";
import test from "node:test";
import {
  getAvailableTeacherBalance,
  getTeacherMonthlyEarningsSplit,
  groupTeacherEarningsByMonthAndType,
  getTeacherWithdrawalAmountError,
  getSaudiMonthKey,
} from "../teacherFinance.ts";

test("reads the current platform balance field", () => {
  assert.equal(getAvailableTeacherBalance({ available_balance: 125.5 }), 125.5);
});

test("keeps monthly online, in-person, compensation, and combined totals separate", () => {
  assert.deepEqual(
    getTeacherMonthlyEarningsSplit({
      online_earnings: "140",
      in_person_earnings: 60,
      in_person_compensations: 20,
      combined_earnings: 220,
    }),
    { online: 140, inPerson: 60, compensation: 20, total: 220 },
  );
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

test("validates partial withdrawal amounts against the platform minimum and available balance", () => {
  assert.equal(getTeacherWithdrawalAmountError("125", 100, 500), null);
  assert.equal(getTeacherWithdrawalAmountError("99.99", 100, 500), "below_minimum");
  assert.equal(getTeacherWithdrawalAmountError("500.02", 100, 500), "exceeds_available");
  assert.equal(getTeacherWithdrawalAmountError("", 100, 500), "invalid");
});

test("keeps automatically rolled-over earnings distinct from regular monthly transfers", () => {
  const groups = groupTeacherEarningsByMonthAndType([
    { month: "2026-10", earning_type: "monthly_transfer", rollover_source_month: null, amount: 200, hours: 4, status: "confirmed" },
    { month: "2026-09", earning_type: "monthly_transfer", rollover_source_month: "2026-09", amount: 80, hours: 2, status: "confirmed" },
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map(({ month, rolloverSourceMonth }) => `${month}:${rolloverSourceMonth ?? "regular"}`),
    ["2026-10:regular", "2026-09:2026-09"],
  );
});

test("uses the Saudi calendar month when UTC is still on the previous month", () => {
  assert.equal(getSaudiMonthKey(new Date("2026-09-30T22:30:00.000Z")), "2026-10");
});
