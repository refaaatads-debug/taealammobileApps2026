let activeBookingIds = new Set<string>();
let activeSupportTicketId: string | null = null;

const CHAT_MESSAGE_TYPES = new Set(["chat_message", "message", "new_message"]);
const SUPPORT_MESSAGE_TYPES = new Set([
  "support_reply",
  "support_message",
  "support_response",
  "support_ticket_reply",
  "ticket_reply",
]);

export function setActiveChatBookingIds(bookingIds: readonly string[]): void {
  activeBookingIds = new Set(bookingIds.filter((bookingId) => bookingId.trim().length > 0));
}

export function setActiveSupportTicketId(ticketId: string | null): void {
  activeSupportTicketId = ticketId?.trim() || null;
}

function supportTicketIdFrom(data: Record<string, unknown>): string | null {
  for (const key of ["supportTicketId", "support_ticket_id", "ticketId", "ticket_id"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function shouldSuppressActiveConversationNotification(
  data: Record<string, unknown>,
  appState: string,
): boolean {
  if (appState !== "active") return false;

  const type = data.type;
  if (typeof type !== "string") return false;
  if (CHAT_MESSAGE_TYPES.has(type)) {
    const bookingId = typeof data.bookingId === "string" ? data.bookingId : "";
    return Boolean(bookingId && activeBookingIds.has(bookingId));
  }
  if (SUPPORT_MESSAGE_TYPES.has(type)) {
    const ticketId = supportTicketIdFrom(data);
    return Boolean(ticketId && activeSupportTicketId === ticketId);
  }
  return false;
}
