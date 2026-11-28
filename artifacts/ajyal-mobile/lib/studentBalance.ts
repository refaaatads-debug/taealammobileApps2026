export type StudentBalanceSubscription = {
  is_active?: unknown;
  remaining_minutes?: unknown;
  sessions_remaining?: unknown;
  ends_at?: unknown;
  subscription_plans?: unknown;
};

export type StudentBalanceSummary = {
  remainingMinutes: number;
  sessionsRemaining: number;
  planName?: string;
};

function planName(value: unknown): string | undefined {
  const plan = Array.isArray(value) ? value[0] : value;
  if (!plan || typeof plan !== "object" || !("name_ar" in plan)) return undefined;
  return typeof plan.name_ar === "string" && plan.name_ar.trim() ? plan.name_ar : undefined;
}

export function aggregateStudentBalance(
  rows: readonly StudentBalanceSubscription[],
): StudentBalanceSummary | null {
  const eligible = rows.filter((row) =>
    row.is_active === true
    && typeof row.remaining_minutes === "number"
    && Number.isFinite(row.remaining_minutes)
    && row.remaining_minutes > 0,
  );
  if (!eligible.length) return null;

  return {
    remainingMinutes: eligible.reduce((sum, row) => sum + (row.remaining_minutes as number), 0),
    sessionsRemaining: eligible.reduce((sum, row) => (
      sum + (typeof row.sessions_remaining === "number" && Number.isFinite(row.sessions_remaining)
        ? row.sessions_remaining
        : 0)
    ), 0),
    planName: planName(eligible[0].subscription_plans),
  };
}
