export type BookingRequestStatus = "open" | "accepted" | "rejected" | "cancelled" | "expired";

const BOOKING_REQUEST_STATUSES = new Set<BookingRequestStatus>([
  "open",
  "accepted",
  "rejected",
  "cancelled",
  "expired",
]);

export function normalizeBookingRequestStatus(rawStatus: string, isExpired: boolean): BookingRequestStatus {
  const canonicalStatus = rawStatus === "confirmed" ? "accepted" : rawStatus;
  if (canonicalStatus === "open" && isExpired) return "expired";
  return BOOKING_REQUEST_STATUSES.has(canonicalStatus as BookingRequestStatus)
    ? canonicalStatus as BookingRequestStatus
    : "open";
}
