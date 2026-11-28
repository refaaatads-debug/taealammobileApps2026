import { db, pushTokensTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  ExpoPushError,
  isExpoPushToken,
  notificationPresentation,
  sendExpoPushMessage,
  sendExpoPushMessages,
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

export type BatchPushItem = { userId: string; payload: UserPushPayload };
/** ok = provider accepted; skip = nothing to deliver (no usable token, duplicate); retry = try again later. */
export type BatchPushOutcome = "ok" | "skip" | "retry";

/**
 * Deliver many account notifications with one token query and one provider
 * request per 100 messages. Same message shape, dedupe and dead-token cleanup
 * as sendUserPushNotification. Returns one outcome per input item, in order.
 * Unlike the single path, a missing token or a duplicate is "skip" (not retried).
 */
export async function sendUserPushNotificationsBatch(items: BatchPushItem[]): Promise<BatchPushOutcome[]> {
  const outcomes: BatchPushOutcome[] = items.map(() => "skip");
  if (!items.length) return outcomes;

  const reserved: Array<string | null> = items.map(() => null);
  const wanted: number[] = [];
  items.forEach((item, index) => {
    const key = pushDedupeKey(item.userId, item.payload.data);
    if (key && !reservePushKey(key)) return;
    reserved[index] = key;
    wanted.push(index);
  });
  const release = (index: number) => {
    const key = reserved[index];
    if (key) recentPushes.delete(key);
  };

  try {
    const userIds = [...new Set(wanted.map((index) => items[index].userId))];
    const tokenByUser = new Map<string, string>();
    for (let start = 0; start < userIds.length; start += 500) {
      const rows = await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
        return tx.select({ userId: pushTokensTable.userId, token: pushTokensTable.token })
          .from(pushTokensTable)
          .where(inArray(pushTokensTable.userId, userIds.slice(start, start + 500)));
      });
      for (const row of rows) tokenByUser.set(row.userId, row.token);
    }

    const sendIndexes: number[] = [];
    const messages: ExpoPushMessage[] = [];
    const sentToken = new Map<number, string>();
    for (const index of wanted) {
      const item = items[index];
      const stored = tokenByUser.get(item.userId);
      const bundle = stored ? decodePushTokenBundle(stored) : null;
      if (!stored || !bundle || !isExpoPushToken(bundle.expoToken)) {
        release(index);
        continue;
      }
      const presentation = notificationPresentation(item.payload.data?.type);
      sendIndexes.push(index);
      sentToken.set(index, stored);
      messages.push({
        to: bundle.expoToken,
        title: item.payload.title,
        body: item.payload.body,
        data: item.payload.data,
        ...(item.payload.richContent ? { richContent: item.payload.richContent } : {}),
        sound: item.payload.sound ?? presentation.sound,
        priority: item.payload.priority ?? "high",
        ttl: item.payload.ttl ?? 3600,
        channelId: item.payload.channelId ?? presentation.channelId,
      });
    }

    const removeToken = async (index: number) => {
      const token = sentToken.get(index);
      if (!token) return;
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
        await tx.delete(pushTokensTable).where(and(
          eq(pushTokensTable.userId, items[index].userId),
          eq(pushTokensTable.token, token),
        ));
      });
    };

    const results = await sendExpoPushMessages(messages, async (position, providerCode) => {
      if (providerCode !== "DeviceNotRegistered" && providerCode !== "InvalidPushToken") return;
      await removeToken(sendIndexes[position]);
    });
    for (let position = 0; position < results.length; position += 1) {
      const index = sendIndexes[position];
      const result = results[position];
      if (result.ok) {
        outcomes[index] = "ok";
      } else if (result.providerCode === "DeviceNotRegistered" || result.providerCode === "InvalidPushToken") {
        release(index);
        await removeToken(index).catch(() => undefined);
        outcomes[index] = "skip";
      } else {
        release(index);
        outcomes[index] = "retry";
      }
    }
    return outcomes;
  } catch (error) {
    wanted.forEach(release);
    console.warn("[push] batch_notification_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return items.map((_, index) => (wanted.includes(index) ? "retry" : "skip"));
  }
}
