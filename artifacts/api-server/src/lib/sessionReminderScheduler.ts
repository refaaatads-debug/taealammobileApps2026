import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { persistPlatformNotificationOnce } from "./platformNotifications";
import { isPushOutboxAvailable } from "./pushOutbox";

const POLL_INTERVAL_MS = 15_000;
const SESSION_NOTIFICATION_LOOKBACK_MINUTES = 30;

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

export async function enqueueSessionLifecycleNotifications(): Promise<number> {
  const result = await db.execute(sql`
    WITH candidates AS (
      SELECT
        b.id::text AS booking_id,
        b.teacher_id::text AS recipient_id,
        b.created_at AS event_at,
        'طلب جلسة فورية'::text AS title,
        'يريد الطالب بدء جلسة فورية معك. افتح الحجوزات للقبول.'::text AS body,
        'instant_session'::text AS type
      FROM public.bookings b
      WHERE b.status = 'confirmed'
        AND b.session_status = 'waiting_acceptance'
        AND b.teacher_id IS NOT NULL
        AND b.student_id IS NOT NULL
        AND b.created_at >= now() - make_interval(mins => ${SESSION_NOTIFICATION_LOOKBACK_MINUTES})
        AND b.created_at <= now() + interval '1 minute'

      UNION ALL

      SELECT
        b.id::text AS booking_id,
        b.student_id::text AS recipient_id,
        s.started_at AS event_at,
        'بدأت الحصة'::text AS title,
        'بدأ المعلم الجلسة، يمكنك الانضمام الآن من الحجوزات.'::text AS body,
        'session_started'::text AS type
      FROM public.bookings b
      INNER JOIN public.sessions s ON s.booking_id = b.id
      WHERE b.status = 'confirmed'
        AND b.session_status = 'in_progress'
        AND b.student_id IS NOT NULL
        AND s.started_at >= now() - make_interval(mins => ${SESSION_NOTIFICATION_LOOKBACK_MINUTES})
        AND s.ended_at IS NULL
    )
    SELECT
      candidates.booking_id,
      candidates.recipient_id,
      candidates.event_at,
      candidates.title,
      candidates.body,
      candidates.type
    FROM candidates
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.notifications existing
      WHERE existing.user_id::text = candidates.recipient_id
        AND existing.type = candidates.type
        AND (
          existing.link = '/bookings?bookingId=' || candidates.booking_id
          OR (
            (existing.link IS NULL OR existing.link = '')
            AND existing.title = candidates.title
            AND existing.created_at >= candidates.event_at - interval '1 minute'
            AND existing.created_at <= candidates.event_at + interval '10 minutes'
          )
        )
    )
  `);
  const candidates = rowsFrom<{
    booking_id?: unknown;
    recipient_id?: unknown;
    event_at?: unknown;
    title?: unknown;
    body?: unknown;
    type?: unknown;
  }>(result);

  let createdCount = 0;
  for (const candidate of candidates) {
    const bookingId = typeof candidate.booking_id === "string" ? candidate.booking_id : "";
    const recipientId = typeof candidate.recipient_id === "string" ? candidate.recipient_id : "";
    const title = typeof candidate.title === "string" ? candidate.title : "";
    const body = typeof candidate.body === "string" ? candidate.body : "";
    const type = typeof candidate.type === "string" ? candidate.type : "";
    const eventAt = candidate.event_at instanceof Date
      ? candidate.event_at
      : new Date(String(candidate.event_at ?? ""));
    if (!bookingId || !recipientId || !title || !body || !type || Number.isNaN(eventAt.getTime())) continue;

    const created = await persistPlatformNotificationOnce({
      recipientId,
      title,
      body,
      type,
      link: `/bookings?bookingId=${encodeURIComponent(bookingId)}`,
      legacyWindow: {
        from: new Date(eventAt.getTime() - 60_000),
        to: new Date(eventAt.getTime() + 10 * 60_000),
      },
    });
    if (created) createdCount += 1;
  }
  return createdCount;
}

async function pollUpcomingSessionReminders(): Promise<void> {
  if (schedulerPolling) return;
  schedulerPolling = true;
  try {
    const [queuedReminderCount, lifecycleNotificationCount] = await Promise.all([
      enqueueUpcomingSessionReminders(),
      enqueueSessionLifecycleNotifications(),
    ]);
    if (queuedReminderCount > 0 || lifecycleNotificationCount > 0) {
      logger.info({
        queuedReminderCount,
        lifecycleNotificationCount,
      }, "Session notifications queued");
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
    lifecycleLookbackMinutes: SESSION_NOTIFICATION_LOOKBACK_MINUTES,
  }, "Session reminder scheduler started");
}
