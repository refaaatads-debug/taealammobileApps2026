type SessionRow = Record<string, unknown>;

function positiveNumber(row: SessionRow, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = row[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return undefined;
}

export function sessionTeachingDurationMinutes(row: SessionRow): number {
  const inPerson = row.delivery_mode === "in_person" || row.deliveryMode === "in_person";
  return inPerson
    ? positiveNumber(row, "in_person_teaching_minutes", "instruction_duration_minutes", "instructionDurationMinutes", "duration_minutes", "durationMinutes") ?? 60
    : positiveNumber(row, "duration_minutes", "durationMinutes") ?? 60;
}

export function resolveSessionPresentationStatus(
  row: SessionRow,
  lifecycle: SessionRow | null,
): string {
  const bookingStatus = String(row.status ?? "").toLowerCase();
  const storedSessionStatus = String(row.session_status ?? row.sessionStatus ?? "").toLowerCase();
  const startedAt = lifecycle?.started_at ?? lifecycle?.startedAt;
  const endedAt = lifecycle?.ended_at ?? lifecycle?.endedAt;

  if (endedAt || bookingStatus === "completed" || storedSessionStatus === "completed") return "completed";
  if (["cancelled", "canceled", "rejected", "expired"].includes(bookingStatus)) return bookingStatus === "canceled" ? "cancelled" : bookingStatus;
  if (["cancelled", "rejected", "expired"].includes(storedSessionStatus)) return storedSessionStatus;
  if (startedAt) return "in_progress";
  if (storedSessionStatus === "waiting_acceptance") return "waiting_acceptance";
  return "not_started";
}
