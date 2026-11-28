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
    // Use the default Android channel for automated session events. Some
    // already-installed APKs predate the versioned session channel and Android
    // will not show a remote notification for an unknown channel id.
    return { sound: "default", channelId: DEFAULT_NOTIFICATION_CHANNEL };
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
    // Booking notifications must remain visible on older installed APKs even
    // when their versioned approval channel was never created on the device.
    return { sound: "default", channelId: DEFAULT_NOTIFICATION_CHANNEL };
  }
  return { sound: "default", channelId: DEFAULT_NOTIFICATION_CHANNEL };
}

export type ExpoPushMessage = {
  to: string;
  title?: string;
  body?: string;
  data: Record<string, unknown>;
  richContent?: { image: string };
  sound?: string;
  priority: "high";
  ttl: number;
  categoryId?: string;
  channelId?: string;
  _contentAvailable?: boolean;
};

type ExpoPushTicket = {
  id?: string;
  status?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoPushResponse = {
  data?: ExpoPushTicket | ExpoPushTicket[];
};

type ExpoReceiptResponse = {
  data?: Record<string, {
    status?: string;
    message?: string;
    details?: { error?: string };
  }>;
};

export type ExpoReceiptErrorHandler = (providerCode: string, ticketId: string) => void | Promise<void>;

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

function scheduleExpoReceiptCheck(ticketId: string, onReceiptError?: ExpoReceiptErrorHandler): void {
  setTimeout(() => {
    void checkExpoPushReceipt(ticketId, onReceiptError);
  }, 15_000);
}

async function checkExpoPushReceipt(
  ticketId: string,
  onReceiptError?: ExpoReceiptErrorHandler,
): Promise<void> {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids: [ticketId] }),
      signal: AbortSignal.timeout(8_000),
    });
    const result = await response.json() as ExpoReceiptResponse;
    const receipt = result.data?.[ticketId];
    const providerCode = receipt?.details?.error;
    if (receipt?.status === "error" && providerCode && onReceiptError) {
      try {
        await onReceiptError(providerCode, ticketId);
      } catch (error) {
        console.warn("[push] expo_receipt_error_handler_failed", {
          ticketId,
          providerCode,
          errorName: error instanceof Error ? error.name : "unknown",
        });
      }
    }
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

export async function sendExpoPushMessage(
  message: ExpoPushMessage,
  onReceiptError?: ExpoReceiptErrorHandler,
): Promise<void> {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify([message]),
    signal: AbortSignal.timeout(8_000),
  });

  let result: ExpoPushResponse | null = null;
  try {
    result = await response.json() as ExpoPushResponse;
  } catch {
    // The status below still gives callers a useful provider failure.
  }

  const ticketData = result?.data;
  const ticket = Array.isArray(ticketData) ? ticketData[0] : ticketData;
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
  if (ticket.id) scheduleExpoReceiptCheck(ticket.id, onReceiptError);
}

export const EXPO_PUSH_BATCH_SIZE = 100;

export type ExpoBatchResult = {
  ok: boolean;
  providerCode?: string;
  ticketId?: string;
};

/**
 * Send many messages with as few provider requests as possible (Expo accepts up
 * to 100 messages per request). The result array always has one entry per input
 * message, in the same order. A failed request marks only its own chunk as not
 * ok, so the caller can retry exactly those messages.
 */
export async function sendExpoPushMessages(
  messages: ExpoPushMessage[],
  onReceiptError?: (index: number, providerCode: string, ticketId: string) => void | Promise<void>,
  fetchImpl: typeof fetch = fetch,
): Promise<ExpoBatchResult[]> {
  const results: ExpoBatchResult[] = messages.map(() => ({ ok: false }));
  for (let start = 0; start < messages.length; start += EXPO_PUSH_BATCH_SIZE) {
    const chunk = messages.slice(start, start + EXPO_PUSH_BATCH_SIZE);
    let tickets: ExpoPushTicket[] = [];
    let httpStatus = 0;
    try {
      const response = await fetchImpl("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(15_000),
      });
      httpStatus = response.status;
      const body = await response.json() as ExpoPushResponse;
      if (response.ok && Array.isArray(body.data)) tickets = body.data;
    } catch (error) {
      console.warn("[push] expo_batch_request_failed", {
        size: chunk.length,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
    let accepted = 0;
    chunk.forEach((_, offset) => {
      const ticket = tickets.length === chunk.length ? tickets[offset] : undefined;
      if (ticket?.status === "ok") {
        results[start + offset] = { ok: true, ticketId: ticket.id };
        accepted += 1;
      } else {
        results[start + offset] = { ok: false, providerCode: ticket?.details?.error };
      }
    });
    console.info("[push] expo_batch", { size: chunk.length, accepted, httpStatus });
  }
  if (onReceiptError) {
    const pending = results
      .map((result, index) => ({ index, ticketId: result.ticketId }))
      .filter((item): item is { index: number; ticketId: string } => Boolean(item.ticketId));
    if (pending.length) {
      setTimeout(() => {
        void checkExpoBatchReceipts(pending, onReceiptError, fetchImpl);
      }, 15_000);
    }
  }
  return results;
}

async function checkExpoBatchReceipts(
  pending: Array<{ index: number; ticketId: string }>,
  onReceiptError: (index: number, providerCode: string, ticketId: string) => void | Promise<void>,
  fetchImpl: typeof fetch,
): Promise<void> {
  // Expo allows up to 1000 ticket ids per receipt request.
  for (let start = 0; start < pending.length; start += 300) {
    const chunk = pending.slice(start, start + 300);
    try {
      const response = await fetchImpl("https://exp.host/--/api/v2/push/getReceipts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ids: chunk.map((item) => item.ticketId) }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json() as ExpoReceiptResponse;
      for (const item of chunk) {
        const receipt = result.data?.[item.ticketId];
        const providerCode = receipt?.details?.error;
        if (receipt?.status === "error" && providerCode) {
          await Promise.resolve(onReceiptError(item.index, providerCode, item.ticketId)).catch(() => undefined);
        }
      }
    } catch (error) {
      console.warn("[push] expo_batch_receipt_check_failed", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
  }
}

export const __testing = { checkExpoPushReceipt };