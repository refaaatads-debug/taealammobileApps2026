export type InPersonBookingReference = {
  booking_id?: unknown;
};

export function getInPersonBookingIds(
  sessionIds: readonly string[],
  requests: readonly InPersonBookingReference[],
): string[] {
  const ids = new Set<string>();

  for (const id of sessionIds) {
    if (typeof id === "string" && id.trim()) ids.add(id);
  }
  for (const request of requests) {
    const id = request.booking_id;
    if (typeof id === "string" && id.trim()) ids.add(id);
  }

  return [...ids];
}
