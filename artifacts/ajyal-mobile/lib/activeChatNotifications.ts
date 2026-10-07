let activeBookingIds = new Set<string>();

export function setActiveChatBookingIds(bookingIds: readonly string[]): void {
  activeBookingIds = new Set(bookingIds.filter((bookingId) => bookingId.trim().length > 0));
}

export function shouldSuppressActiveChatMessage(
  data: Record<string, unknown>,
  appState: string,
): boolean {
  if (appState !== "active") return false;

  const type = data.type;
  if (type !== "chat_message" && type !== "message" && type !== "new_message") return false;

  const bookingId = typeof data.bookingId === "string" ? data.bookingId : "";
  return Boolean(bookingId && activeBookingIds.has(bookingId));
}
