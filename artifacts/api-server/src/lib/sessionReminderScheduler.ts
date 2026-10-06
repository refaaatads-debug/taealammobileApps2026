import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { isPushOutboxAvailable } from "./pushOutbox";

const POLL_INTERVAL_MS = 60_000;

let schedulerStarted = false;
let schedulerPolling = false;

function rowsFrom<T>(result: unknown): T[] {
  if (!result || typeof result !== "object" || !("rows" in result)) return [];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? rows as T[] : [];
}

export async function enqueueUpcomingSessionReminders(): Promise<number> {
  const result = await db.execute(sql`
    WITH upcoming AS (
      SELECT id, student_id, teacher_id, scheduled_at
      FROM public.bookings
      WHERE status = 'confirmed'
        AND scheduled_at > now()
        AND scheduled_at <= now() + interval '15 minutes'
        AND student_id IS NOT NULL
        AND teacher_id IS NOT NULL
    ),
    recipients AS (
      SELECT
        upcoming.id,
        upcoming.scheduled_at,
        recipient.recipient_id,
        recipient.recipient_role
      FROM upcoming
      CROSS JOIN LATERAL (
        VALUES
          (upcoming.student_id, 'student'::text),
          (upcoming.teacher_id, 'teacher'::text)
      ) AS recipient(recipient_id, recipient_role)
    )
    INSERT INTO public.push_delivery_outbox (event_key, event_type, payload)
    SELECT
      'session-reminder:'
        || recipients.id::text
        || ':'
        || recipients.recipient_id::text
        || ':'
        || floor(extract(epoch FROM recipients.scheduled_at) * 1000)::bigint::text,
      'session_reminder',
      jsonb_build_object(
        'bookingId', recipients.id::text,
        'recipientId', recipients.recipient_id::text,
        'recipientRole', recipients.recipient_role,
        'scheduledAt', recipients.scheduled_at
      )
    FROM recipients
    ON CONFLICT (event_key) DO NOTHING
    RETURNING id
  `);
  return rowsFrom<{ id: string }>(result).length;
}

async function pollUpcomingSessionReminders(): Promise<void> {
  if (schedulerPolling) return;
  schedulerPolling = true;
  try {
    const queuedCount = await enqueueUpcomingSessionReminders();
    if (queuedCount > 0) {
      logger.info({ queuedCount }, "Upcoming session reminders queued");
    }
  } catch (error) {
    logger.warn({
      errorName: error instanceof Error ? error.name : "unknown",
    }, "Upcoming session reminder scan failed");
  } finally {
    schedulerPolling = false;
  }
}

export async function startSessionReminderScheduler(): Promise<void> {
  if (schedulerStarted) return;
  try {
    if (!await isPushOutboxAvailable()) {
      logger.info({ reason: "outbox_table_missing" }, "Session reminder scheduler is disabled");
      return;
    }
  } catch (error) {
    logger.warn({
      errorName: error instanceof Error ? error.name : "unknown",
    }, "Session reminder scheduler could not inspect its outbox");
    return;
  }

  schedulerStarted = true;
  const timer = setInterval(() => {
    void pollUpcomingSessionReminders();
  }, POLL_INTERVAL_MS);
  timer.unref();
  void pollUpcomingSessionReminders();
  logger.info({
    pollIntervalMs: POLL_INTERVAL_MS,
    reminderWindowMinutes: 15,
  }, "Session reminder scheduler started");
}
