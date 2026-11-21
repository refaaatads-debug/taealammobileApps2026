import { db, pushTokensTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import {
  ExpoPushError,
  isExpoPushToken,
  notificationPresentation,
  sendExpoPushMessage,
  type ExpoPushMessage,
} from "./expoPush";
import { pushDedupeKey } from "./pushDedupe";
import { decodePushTokenBundle } from "./pushTokenBundle";

export type UserPushPayload = Pick<ExpoPushMessage, "title" | "body" | "data"> & Partial<Pick<ExpoPushMessage, "richContent" | "sound" | "priority" | "ttl" | "channelId">>;

const recentPushes = new Map<string, number>();
const PUSH_DEDUPE_WINDOW_MS = 60_000;

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
  const dedupeKey = pushDedupeKey(userId, payload.data);
  let attemptedToken: string | null = null;
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
      if (dedupeKey) recentPushes.delete(dedupeKey);
      console.warn("[push] regular_notification_skipped", { reason: "missing_token" });
      return false;
    }
    attemptedToken = destination.token;
    const tokenBundle = decodePushTokenBundle(destination.token);
    if (!tokenBundle || !isExpoPushToken(tokenBundle.expoToken)) {
      if (dedupeKey) recentPushes.delete(dedupeKey);
      console.warn("[push] regular_notification_skipped", { reason: "invalid_token_shape" });
      return false;
    }
    const presentation = notificationPresentation(payload.data?.type);
    await sendExpoPushMessage({
      to: tokenBundle.expoToken,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      ...(payload.richContent ? { richContent: payload.richContent } : {}),
      sound: payload.sound ?? presentation.sound,
      priority: payload.priority ?? "high",
      ttl: payload.ttl ?? 3600,
      channelId: payload.channelId ?? presentation.channelId,
    }, async (providerCode) => {
      if (providerCode !== "DeviceNotRegistered" && providerCode !== "InvalidPushToken") return;
      const tokenToInvalidate = attemptedToken;
      if (!tokenToInvalidate) return;
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
        await tx.delete(pushTokensTable).where(and(
          eq(pushTokensTable.userId, userId),
          eq(pushTokensTable.token, tokenToInvalidate),
        ));
      });
      console.warn("[push] invalid_device_token_removed", { providerCode });
    });
    return true;
  } catch (error) {
    if (dedupeKey) recentPushes.delete(dedupeKey);
    const tokenToInvalidate = attemptedToken;
    if (error instanceof ExpoPushError && (
      error.providerCode === "DeviceNotRegistered"
      || error.providerCode === "InvalidPushToken"
    ) && tokenToInvalidate) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
        await tx.delete(pushTokensTable).where(and(
          eq(pushTokensTable.userId, userId),
          eq(pushTokensTable.token, tokenToInvalidate),
        ));
      }).catch(() => undefined);
    }
    console.warn("[push] regular_notification_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
      providerCode: error instanceof ExpoPushError ? error.providerCode ?? null : null,
    });
    return false;
  }
}