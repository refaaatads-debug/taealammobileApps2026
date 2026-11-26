export type PromotionRow = { teacher_id: unknown; starts_at: unknown; ends_at: unknown };

/** Keep only promotions that are live at `nowMs`, in the order given. */
export function livePromotedIds(rows: PromotionRow[], nowMs: number): string[] {
  return rows
    .filter((row) => {
      const start = new Date(String(row.starts_at)).getTime();
      const end = row.ends_at ? new Date(String(row.ends_at)).getTime() : null;
      return start <= nowMs && (end === null || end > nowMs);
    })
    .map((row) => String(row.teacher_id));
}

/** Promoted teachers first (in promotion order); everyone else keeps their current order. */
export function promotedFirst<T>(items: T[], getId: (item: T) => string, promotedIds: string[]): T[] {
  if (!promotedIds.length) return items;
  const rank = new Map(promotedIds.map((id, index) => [id, index]));
  const promoted = items.filter((item) => rank.has(getId(item))).sort((a, b) => (rank.get(getId(a)) ?? 0) - (rank.get(getId(b)) ?? 0));
  const rest = items.filter((item) => !rank.has(getId(item)));
  return [...promoted, ...rest];
}

