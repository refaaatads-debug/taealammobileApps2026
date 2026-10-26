export type TeacherEarningType = "monthly_transfer" | "bonus" | "deduction";

export type GroupedTeacherEarnings = {
  month: string;
  earningType: TeacherEarningType;
  rolloverSourceMonth: string | null;
  amount: number;
  hours: number;
  statuses: Set<string>;
};

function finiteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getSaudiMonthKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Could not format the Saudi calendar month");
  return `${year}-${month}`;
}

export function getAvailableTeacherBalance(summary: unknown): number {
  if (!summary || typeof summary !== "object") return 0;
  const values = summary as Record<string, unknown>;
  return finiteNumber(values.available_balance ?? values.available_for_withdrawal);
}

export function getTeacherMonthlyEarningsSplit(summary: unknown): {
  online: number;
  inPerson: number;
  compensation: number;
  total: number;
} {
  if (!summary || typeof summary !== "object") return { online: 0, inPerson: 0, compensation: 0, total: 0 };
  const values = summary as Record<string, unknown>;
  const online = finiteNumber(values.online_earnings);
  const inPerson = finiteNumber(values.in_person_earnings);
  const compensation = finiteNumber(values.in_person_compensations);
  const total = values.combined_earnings == null
    ? online + inPerson + compensation
    : finiteNumber(values.combined_earnings);
  return { online, inPerson, compensation, total };
}

export function getTeacherWithdrawalAmountError(
  value: unknown,
  minimum: number,
  available: number,
): "invalid" | "below_minimum" | "exceeds_available" | null {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "invalid";
  if (amount < minimum) return "below_minimum";
  if (amount > available + 0.01) return "exceeds_available";
  return null;
}

function earningType(value: unknown): TeacherEarningType {
  return value === "bonus" || value === "deduction" || value === "monthly_transfer"
    ? value
    : "monthly_transfer";
}

export function groupTeacherEarningsByMonthAndType(
  rows: readonly Record<string, unknown>[],
): GroupedTeacherEarnings[] {
  const grouped = new Map<string, GroupedTeacherEarnings>();

  for (const row of rows) {
    const month = typeof row.month === "string" ? row.month : "—";
    const type = earningType(row.earning_type);
    const rolloverSourceMonth = typeof row.rollover_source_month === "string"
      ? row.rollover_source_month
      : null;
    const key = `${month}:${type}:${rolloverSourceMonth ?? ""}`;
    const item = grouped.get(key) ?? {
      month,
      earningType: type,
      rolloverSourceMonth,
      amount: 0,
      hours: 0,
      statuses: new Set<string>(),
    };
    item.amount += finiteNumber(row.amount);
    item.hours += finiteNumber(row.hours);
    if (typeof row.status === "string") item.statuses.add(row.status);
    grouped.set(key, item);
  }

  return [...grouped.values()].sort((left, right) => {
    const monthOrder = right.month.localeCompare(left.month);
    return monthOrder
      || left.earningType.localeCompare(right.earningType)
      || (left.rolloverSourceMonth ?? "").localeCompare(right.rolloverSourceMonth ?? "");
  });
}
