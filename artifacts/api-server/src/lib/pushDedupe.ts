export function pushDedupeKey(
  userId: string,
  data: Record<string, unknown> = {},
): string | null {
  const explicitKey = [data.notificationId, data.eventId, data.dedupeKey]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (explicitKey) return `${userId}:${explicitKey}`;

  const type = typeof data.type === "string" ? data.type : "";
  const bookingId = typeof data.bookingId === "string" ? data.bookingId : "";
  const messageId = typeof data.messageId === "string" ? data.messageId : "";
  if (type === "chat_message" && messageId) {
    return `${userId}:${type}:message:${messageId}`;
  }
  if (type && bookingId) return `${userId}:${type}:booking:${bookingId}`;

  const assignmentId = typeof data.assignmentId === "string" ? data.assignmentId : "";
  const submissionId = typeof data.submissionId === "string" ? data.submissionId : "";
  if (type && assignmentId && submissionId) {
    return `${userId}:${type}:assignment:${assignmentId}:${submissionId}`;
  }
  return null;
}
