export type SessionLifecycleSnapshot = {
  endedAt?: string | null;
  durationSeconds?: number | null;
  sessionStatus?: string | null;
  bookingStatus?: string | null;
};

export function isSessionEnded(snapshot: SessionLifecycleSnapshot): boolean {
  const terminalStatuses = new Set(["completed", "cancelled"]);
  return Boolean(snapshot.endedAt)
    || terminalStatuses.has(snapshot.sessionStatus ?? "")
    || terminalStatuses.has(snapshot.bookingStatus ?? "");
}
