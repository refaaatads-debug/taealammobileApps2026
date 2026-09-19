import { db, pushTokensTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  ExpoPushError,
  isExpoPushToken,
  notificationPresentation,
  sendExpoPushMessage,
  type ExpoPushMessage,
} from "./expoPush";

export type UserPushPayload = Pick<ExpoPushMessage, "title" | "body" | "data"> & Partial<Pick<ExpoPushMessage, "sound" | "priority" | "ttl" | "channelId">>;

const recentPushes = new Map<string, number>();
const PUSH_DEDUPE_WINDOW_MS = 60_000;

function pushDedupeKey(userId: string, payload: UserPushPayload): string | null {
  const data = payload.data ?? {};
  const explicitKey = [data.notificationId, data.eventId, data.dedupeKey]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (explicitKey) return `${userId}:${explicitKey}`;

  const type = typeof data.type === "string" ? data.type : "";
  const bookingId = typeof data.bookingId === "string" ? data.bookingId : "";
  if (type && bookingId) return `${userId}:${type}:booking:${bookingId}`;

  const assignmentId = typeof data.assignmentId === "string" ? data.assignmentId : "";
  const submissionId = typeof data.submissionId === "string" ? data.submissionId : "";
  if (type && assignmentId && submissionId) {
    return `${userId}:${type}:assignment:${assignmentId}:${submissionId}`;
  }
  return null;
}

function reservePushKey(key: string): boolean {
  const now = Date.now();
  const expiresAt = recentPushes.get(key);
  if (expiresAt && expiresAt > now) return false;
  for (const [existingKey, existingExpiry] of recentPushes) {
    if (existingExpiry <= now) recentPushes.delete(existingKey);
  }
  recentPushes.set(key, now + PUSH_DEDUPE_WINDOW_MS);
  return true;
}

/**
 * Deliver a regular account notification to the user's registered device.
 * The in-app notification row remains authoritative; a missing token or a
 * provider failure is deliberately returned to the caller as a best-effort
 * result instead of failing the business operation.
 */
export async function sendUserPushNotification(userId: string, payload: UserPushPayload): Promise<boolean> {
  const dedupeKey = pushDedupeKey(userId, payload);
  if (dedupeKey && !reservePushKey(dedupeKey)) {
    console.info("[push] regular_notification_suppressed_duplicate");
    return false;
  }

  try {
    const destination = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
      const [token] = await tx.select({ token: pushTokensTable.token })
        .from(pushTokensTable)
        .where(eq(pushTokensTable.userId, userId));
      return token;
    });

    if (!destination?.token) {
      console.warn("[push] regular_notification_skipped", { reason: "missing_token" });
      return false;
    }
    if (!isExpoPushToken(destination.token)) {
      console.warn("[push] regular_notification_skipped", { reason: "invalid_token_shape" });
      return false;
    }
    const presentation = notificationPresentation(payload.data?.type);
    await sendExpoPushMessage({
      to: destination.token,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: payload.sound ?? presentation.sound,
      priority: payload.priority ?? "high",
      ttl: payload.ttl ?? 3600,
      channelId: payload.channelId ?? presentation.channelId,
    });
    return true;
  } catch (error) {
    if (dedupeKey) recentPushes.delete(dedupeKey);
    if (error instanceof ExpoPushError && (
      error.providerCode === "DeviceNotRegistered"
      || error.providerCode === "InvalidPushToken"
    )) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
        await tx.delete(pushTokensTable).where(eq(pushTokensTable.userId, userId));
      }).catch(() => undefined);
    }
    console.warn("[push] regular_notification_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
      providerCode: error instanceof ExpoPushError ? error.providerCode ?? null : null,
    });
    return false;
  }
}