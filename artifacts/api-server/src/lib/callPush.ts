import { randomUUID } from "node:crypto";
import { db, pushTokensTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendApnsVoipPush } from "./apnsVoip";
import {
  ExpoPushError,
  INCOMING_CALL_CATEGORY,
  INCOMING_CALL_CHANNEL,
  isExpoPushToken,
  sendExpoPushMessage,
} from "./expoPush";
import { decodePushTokenBundle } from "./pushTokenBundle";

export type CallPushEventType = "incoming_call" | "call_accepted" | "call_ended";

export type CallPushEvent = {
  eventKey: string;
  eventType: CallPushEventType;
  payload: Record<string, unknown>;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getDestination(recipientId: string): Promise<{ token: string; platform: string } | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
    const [destination] = await tx.select({
      token: pushTokensTable.token,
      platform: pushTokensTable.platform,
    }).from(pushTokensTable).where(eq(pushTokensTable.userId, recipientId));
    return destination ?? null;
  });
}

export async function sendCallPushNotification(event: CallPushEvent): Promise<boolean> {
  const callId = asNonEmptyString(event.payload.callId);
  const recipientId = asNonEmptyString(event.payload.recipientId);
  if (!callId || !recipientId) return false;

  const destination = await getDestination(recipientId);
  if (!destination) {
    console.warn("[push] call_notification_skipped", { reason: "missing_token", eventType: event.eventType });
    return false;
  }

  const tokenBundle = decodePushTokenBundle(destination.token);
  if (!tokenBundle || !isExpoPushToken(tokenBundle.expoToken)) {
    console.warn("[push] call_notification_skipped", { reason: "invalid_token", eventType: event.eventType });
    return false;
  }

  const platform = destination.platform.toLowerCase();
  const ttl = event.eventType === "incoming_call" ? 60 : 30;
  const data: Record<string, unknown> = {
    type: event.eventType,
    callId,
    eventId: event.eventKey,
    ...(event.eventType === "incoming_call"
      ? {
          callerId: asNonEmptyString(event.payload.callerId) ?? "",
          callerName: asNonEmptyString(event.payload.callerName) ?? "مستخدم أجيال المعرفة",
          callerRole: asNonEmptyString(event.payload.callerRole) ?? "مستخدم",
          roomId: asNonEmptyString(event.payload.roomId)
            ?? asNonEmptyString(event.payload.bookingId)
            ?? `call:${callId}`,
        }
      : {}),
  };

  if (platform === "ios" && tokenBundle.apnsVoipToken && tokenBundle.apnsVoipEnvironment) {
    try {
      if (event.eventType === "incoming_call") {
        const callerId = asNonEmptyString(event.payload.callerId);
        if (!callerId) return false;
        const callUuid = isUuid(callId) ? callId : randomUUID();
        await sendApnsVoipPush(tokenBundle.apnsVoipToken, tokenBundle.apnsVoipEnvironment, {
          aps: { "content-available": 1 },
          type: "incoming_call",
          callId,
          callUuid,
          uuid: callUuid,
          handle: callerId,
          callerId,
          callerName: asNonEmptyString(event.payload.callerName) ?? "مستخدم أجيال المعرفة",
          callerRole: asNonEmptyString(event.payload.callerRole) ?? "مستخدم",
          roomId: asNonEmptyString(event.payload.roomId)
            ?? asNonEmptyString(event.payload.bookingId)
            ?? `call:${callId}`,
        });
      } else {
        await sendApnsVoipPush(tokenBundle.apnsVoipToken, tokenBundle.apnsVoipEnvironment, {
          aps: { "content-available": 1 },
          type: event.eventType,
          callId,
          uuid: callId,
        });
      }
      return true;
    } catch (error) {
      console.warn("[push] apns_voip_fallback", {
        eventType: event.eventType,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  try {
    await sendExpoPushMessage({
      to: tokenBundle.expoToken,
      ...(event.eventType === "incoming_call" && platform !== "android"
        ? {
            title: "مكالمة واردة",
            body: `${asNonEmptyString(event.payload.callerName) ?? "مستخدم أجيال المعرفة"} يتصل بك الآن`,
            categoryId: INCOMING_CALL_CATEGORY,
            channelId: INCOMING_CALL_CHANNEL,
            sound: "incoming_call.wav",
          }
        : {}),
      data,
      priority: "high",
      ttl,
      ...(platform === "ios" ? { _contentAvailable: true } : {}),
    });
    return true;
  } catch (error) {
    console.warn("[push] call_notification_failed", {
      eventType: event.eventType,
      errorName: error instanceof Error ? error.name : "unknown",
      providerCode: error instanceof ExpoPushError ? error.providerCode ?? null : null,
    });
    return false;
  }
}
