export const INCOMING_CALL_CATEGORY = "incoming-call";
export const INCOMING_CALL_CHANNEL = "incoming-call-v2";
export const DEFAULT_NOTIFICATION_CHANNEL = "default";
// Channel ids are versioned because Android keeps the user's first channel
// configuration. A new id is required when the sound/importance policy changes.
export const APP_NOTIFICATION_CHANNEL = "app-notifications-v2";
export const MESSAGE_NOTIFICATION_CHANNEL = "message-notifications-v2";
export const SESSION_NOTIFICATION_CHANNEL = "session-notifications-v2";
export const APPROVAL_NOTIFICATION_CHANNEL = "approval-notifications-v2";

export type NotificationPresentation = {
  sound: string;
  channelId: string;
};

export function notificationPresentation(type: unknown): NotificationPresentation {
  if (
    type === "chat_message"
    || type === "message"
    || type === "new_message"
    || type === "support_reply"
    || type === "support_message"
    || type === "support_ticket"
    || type === "support_response"
    || type === "support_ticket_reply"
    || type === "ticket_reply"
  ) {
    return { sound: "message_notification.wav", channelId: MESSAGE_NOTIFICATION_CHANNEL };
  }
  if (
    type === "session_reminder"
    || type === "session_starting"
    || type === "session_started"
    || type === "session_join"
    || type === "session_ended"
    || type === "booking_cancelled"
    || type === "expired_no_show"
    || type === "no_show"
    || type === "booking_expired"
    || type === "session_auto_cancelled"
    || type === "automatic_cancellation"
    || type === "session_cancelled"
  ) {
    return { sound: "session_notification.wav", channelId: SESSION_NOTIFICATION_CHANNEL };
  }
  if (
    type === "booking_request"
    || type === "booking_confirmed"
    || type === "booking_accepted"
    || type === "booking_rejected"
    || type === "first_impression"
    || type === "instant_session"
    || type === "approval"
  ) {
    return { sound: "approval_notification.wav", channelId: APPROVAL_NOTIFICATION_CHANNEL };
  }
  return { sound: "default", channelId: DEFAULT_NOTIFICATION_CHANNEL };
}

export type ExpoPushMessage = {
  to: string;
  title?: string;
  body?: string;
  data: Record<string, unknown>;
  sound?: string;
  priority: "high";
  ttl: number;
  categoryId?: string;
  channelId?: string;
  _contentAvailable?: boolean;
};

type ExpoPushResponse = {
  data?: Array<{
    id?: string;
    status?: string;
    message?: string;
    details?: { error?: string };
  }>;
};

type ExpoReceiptResponse = {
  data?: Record<string, {
    status?: string;
    message?: string;
    details?: { error?: string };
  }>;
};

export class ExpoPushError extends Error {
  constructor(
    message: string,
    readonly providerCode?: string,
  ) {
    super(message);
    this.name = "ExpoPushError";
  }
}

export function isExpoPushToken(token: string): boolean {
  return /^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token);
}

function scheduleExpoReceiptCheck(ticketId: string): void {
  setTimeout(() => {
    void checkExpoPushReceipt(ticketId);
  }, 15_000);
}

async function checkExpoPushReceipt(ticketId: string): Promise<void> {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids: [ticketId] }),
    });
    const result = await response.json() as ExpoReceiptResponse;
    const receipt = result.data?.[ticketId];
    const providerCode = receipt?.details?.error;
    console.info("[push] expo_receipt", {
      ticketId,
      httpStatus: response.status,
      status: receipt?.status ?? "missing",
      message: receipt?.message ?? null,
      error: providerCode ?? null,
    });
  } catch (error) {
    console.warn("[push] expo_receipt_check_failed", {
      ticketId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }
}

export async function sendExpoPushMessage(message: ExpoPushMessage): Promise<void> {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(message),
  });

  let result: ExpoPushResponse | null = null;
  try {
    result = await response.json() as ExpoPushResponse;
  } catch {
    // The status below still gives callers a useful provider failure.
  }

  const ticket = result?.data?.[0];
  const providerCode = ticket?.details?.error;
  console.info("[push] expo_ticket", {
    ticketId: ticket?.id ?? null,
    httpStatus: response.status,
    status: ticket?.status ?? "missing",
    message: ticket?.message ?? null,
    error: providerCode ?? null,
  });
  if (!response.ok || ticket?.status !== "ok") {
    const providerError = providerCode ?? ticket?.message ?? `HTTP ${response.status}`;
    throw new ExpoPushError(`Expo push rejected notification: ${providerError}`, providerCode);
  }
  if (ticket.id) scheduleExpoReceiptCheck(ticket.id);
}