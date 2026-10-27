const TERMINAL_STATUSES = new Set([
  "cancelled",
  "canceled",
  "rejected",
  "declined",
  "expired",
  "ended",
  "failed",
  "complete",
  "completed",
  "done",
  "closed",
]);

export function shouldRedirectFromLiveSession(
  lifecycleLoaded: boolean,
  bookingId: string | undefined,
  bookingStatus: string | null,
  sessionStatus: string | null,
  deliveryMode?: unknown,
): boolean {
  if (!bookingId) return true;
  if (!lifecycleLoaded) return false;
  const normalizedMode = typeof deliveryMode === "string"
    ? deliveryMode.trim().toLowerCase().replace(/[-\s]/gu, "_")
    : "";
  if (normalizedMode === "in_person" || normalizedMode === "inperson" || normalizedMode === "حضوري") return true;
  if (!bookingStatus) return true;
  return TERMINAL_STATUSES.has(bookingStatus.toLowerCase())
    || Boolean(sessionStatus && TERMINAL_STATUSES.has(sessionStatus.toLowerCase()));
}

export function shouldAutoOpenStartedSession(
  bookingId: string | undefined,
  bookingStatus: unknown,
  sessionStatus: unknown,
  deliveryMode?: unknown,
): boolean {
  const normalizedMode = typeof deliveryMode === "string"
    ? deliveryMode.trim().toLowerCase().replace(/[-\s]/gu, "_")
    : "";
  if (normalizedMode === "in_person" || normalizedMode === "inperson" || normalizedMode === "حضوري") {
    return false;
  }
  return !shouldRedirectFromLiveSession(
    true,
    bookingId,
    typeof bookingStatus === "string" ? bookingStatus : null,
    typeof sessionStatus === "string" ? sessionStatus : null,
  );
}
