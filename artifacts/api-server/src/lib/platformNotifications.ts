import crypto from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type PlatformNotificationInput = {
  recipientId: string;
  title: string;
  body: string;
  type: string;
  icon?: string;
};

export function dedupePlatformNotifications(
  notifications: PlatformNotificationInput[],
): PlatformNotificationInput[] {
  const recipients = new Map<string, PlatformNotificationInput>();

  for (const notification of notifications) {
    const recipientId = notification.recipientId.trim();
    const title = notification.title.trim();
    const body = notification.body.trim();
    const type = notification.type.trim();
    if (!recipientId || !title || !body || !type || recipients.has(recipientId)) continue;
    recipients.set(recipientId, {
      recipientId,
      title,
      body,
      type,
      icon: notification.icon?.trim() || "bell",
    });
  }

  return [...recipients.values()];
}

function resultRows(result: unknown): Array<{ column_name?: string | null }> {
  if (!result || typeof result !== "object") return [];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? rows as Array<{ column_name?: string | null }> : [];
}

export async function persistPlatformNotifications(
  notifications: PlatformNotificationInput[],
): Promise<boolean> {
  const uniqueNotifications = dedupePlatformNotifications(notifications);
  if (uniqueNotifications.length === 0) return true;

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
      const metadata = await tx.execute(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notifications'
      `);
      const availableColumns = new Set(
        resultRows(metadata)
          .map((row) => row.column_name)
          .filter((column): column is string => typeof column === "string"),
      );
      const requiredColumns = ["id", "user_id", "title", "body"];
      if (requiredColumns.some((column) => !availableColumns.has(column))) {
        throw new Error("The platform notifications table is missing required columns.");
      }

      const columns = [...requiredColumns];
      if (availableColumns.has("type")) columns.push("type");
      if (availableColumns.has("icon")) columns.push("icon");

      const values = uniqueNotifications.map((notification) => {
        const rowValues = [
          sql`${crypto.randomUUID()}`,
          sql`${notification.recipientId}`,
          sql`${notification.title}`,
          sql`${notification.body}`,
        ];
        if (availableColumns.has("type")) rowValues.push(sql`${notification.type}`);
        if (availableColumns.has("icon")) rowValues.push(sql`${notification.icon ?? "bell"}`);
        return sql`(${sql.join(rowValues, sql`, `)})`;
      });

      await tx.execute(sql`
        INSERT INTO public.notifications (${sql.join(columns.map((column) => sql.raw(column)), sql`, `)})
        VALUES ${sql.join(values, sql`, `)}
      `);
    });
    return true;
  } catch (error) {
    const errorCode = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "unknown")
      : "unknown";
    console.error("[platform-notifications] Could not persist notification fan-out.", {
      type: uniqueNotifications[0]?.type ?? "unknown",
      recipientCount: uniqueNotifications.length,
      errorCode,
    });
    return false;
  }
}
