export type SessionLifecycleSnapshot = {
  endedAt?: string | null;
  durationSeconds?: number | null;
  sessionStatus?: string | null;
  bookingStatus?: string | null;
};

export function isSessionEnded(snapshot: SessionLifecycleSnapshot): boolean {
  const terminalStatuses = new Set(["completed", "cancelled", "ended"]);
  return Boolean(snapshot.endedAt)
    || terminalStatuses.has(snapshot.sessionStatus?.trim().toLowerCase() ?? "")
    || terminalStatuses.has(snapshot.bookingStatus?.trim().toLowerCase() ?? "");
}

export function shouldRetrySessionEndRequest(
  snapshot: SessionLifecycleSnapshot,
  now: number,
  nextRetryAt: number,
  deadline: number,
): boolean {
  return !isSessionEnded(snapshot) && now >= nextRetryAt && now < deadline;
}

export function shouldUseSessionEndRealtimeFallback({
  forceRealtimeFallback,
  primarySent,
  connectionConnected,
  dataChannelOpen,
}: {
  forceRealtimeFallback: boolean;
  primarySent: boolean;
  connectionConnected: boolean;
  dataChannelOpen: boolean;
}): boolean {
  return forceRealtimeFallback
    || !primarySent
    || !connectionConnected
    || !dataChannelOpen;
}
