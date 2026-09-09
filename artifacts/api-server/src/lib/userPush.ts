import { db, pushTokensTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { isExpoPushToken, notificationPresentation, sendExpoPushMessage, type ExpoPushMessage } from "./expoPush";

export type UserPushPayload = Pick<ExpoPushMessage, "title" | "body" | "data"> & Partial<Pick<ExpoPushMessage, "sound" | "priority" | "ttl" | "channelId">>;

/**
 * Deliver a regular account notification to the user's registered device.
 * The in-app notification row remains authoritative; a missing token or a
 * provider failure is deliberately returned to the caller as a best-effort
 * result instead of failing the business operation.
 */
export async function sendUserPushNotification(userId: string, payload: UserPushPayload): Promise<boolean> {
  try {
    const destination = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
      const [token] = await tx.select({ token: pushTokensTable.token })
        .from(pushTokensTable)
        .where(eq(pushTokensTable.userId, userId));
      return token;
    });

    if (!destination?.token || !isExpoPushToken(destination.token)) return false;
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
  } catch {
    return false;
  }
}