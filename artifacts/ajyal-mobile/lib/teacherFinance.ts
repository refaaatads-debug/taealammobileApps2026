export type TeacherEarningType = "monthly_transfer" | "bonus" | "deduction";

export type GroupedTeacherEarnings = {
  month: string;
  earningType: TeacherEarningType;
  amount: number;
  hours: number;
  statuses: Set<string>;
};

function finiteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getAvailableTeacherBalance(summary: unknown): number {
  if (!summary || typeof summary !== "object") return 0;
  const values = summary as Record<string, unknown>;
  return finiteNumber(values.available_balance ?? values.available_for_withdrawal);
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
    const key = `${month}:${type}`;
    const item = grouped.get(key) ?? {
      month,
      earningType: type,
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
    return monthOrder || left.earningType.localeCompare(right.earningType);
  });
}
