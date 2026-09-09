export const INCOMING_CALL_CATEGORY = "incoming-call";
export const INCOMING_CALL_CHANNEL = "incoming-call-v2";
export const APP_NOTIFICATION_CHANNEL = "app-notifications-v1";
export const MESSAGE_NOTIFICATION_CHANNEL = "message-notifications-v1";
export const SESSION_NOTIFICATION_CHANNEL = "session-notifications-v1";
export const APPROVAL_NOTIFICATION_CHANNEL = "approval-notifications-v1";

export type NotificationPresentation = {
  sound: string;
  channelId: string;
};

export function notificationPresentation(type: unknown): NotificationPresentation {
  if (type === "chat_message" || type === "message" || type === "new_message") {
    return { sound: "message-notification.wav", channelId: MESSAGE_NOTIFICATION_CHANNEL };
  }
  if (
    type === "session_reminder"
    || type === "session_starting"
    || type === "session_started"
    || type === "session_join"
    || type === "session_ended"
  ) {
    return { sound: "session-notification.wav", channelId: SESSION_NOTIFICATION_CHANNEL };
  }
  if (
    type === "booking_request"
    || type === "booking_confirmed"
    || type === "booking_accepted"
    || type === "booking_rejected"
    || type === "booking_cancelled"
    || type === "approval"
  ) {
    return { sound: "approval-notification.wav", channelId: APPROVAL_NOTIFICATION_CHANNEL };
  }
  return { sound: "default", channelId: APP_NOTIFICATION_CHANNEL };
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
    status?: string;
    message?: string;
    details?: { error?: string };
  }>;
};

export function isExpoPushToken(token: string): boolean {
  return /^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token);
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
  if (!response.ok || ticket?.status !== "ok") {
    const providerError = ticket?.details?.error ?? ticket?.message ?? `HTTP ${response.status}`;
    throw new Error(`Expo push rejected notification: ${providerError}`);
  }
}