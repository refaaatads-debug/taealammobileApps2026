import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendCallPushNotification, type CallPushEvent, type CallPushEventType } from "./callPush";
import { logger } from "./logger";
import { sendUserPushNotification, type UserPushPayload } from "./userPush";

const POLL_INTERVAL_MS = 1_000;
const LOCK_DURATION_SECONDS = 120;
const CLAIM_BATCH_SIZE = 10;
const MAX_ATTEMPTS = 8;
const RETRY_DELAYS_SECONDS = [2, 5, 15, 30, 60, 180, 300, 600];

const OUTBOX_EVENT_TYPES = new Set<PushOutboxEventType>([
  "chat_message",
  "platform_notification",
  "session_reminder",
  "incoming_call",
  "call_accepted",
  "call_ended",
]);

export type PushOutboxEventType = "chat_message" | "platform_notification" | "session_reminder" | CallPushEventType;

export type PushOutboxEvent = {
  id: string;
  event_key: string;
  event_type: string;
  payload: unknown;
  attempt_count: number;
};

export type ChatPushNotification = {
  recipientId: string;
  notification: UserPushPayload;
};

const MAX_MESSAGE_PREVIEW_LENGTH = 160;

export type PushDeliveryHandlers = {
  sendMessage: (recipientId: string, notification: UserPushPayload) => Promise<boolean>;
  sendCall: (event: CallPushEvent) => Promise<boolean>;
};

let outboxTableAvailable: Promise<boolean> | null = null;
let workerStarted = false;
let polling = false;

function rowsFrom<T>(result: unknown): T[] {
  if (!result || typeof result !== "object" || !("rows" in result)) return [];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? rows as T[] : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function messagePreview(value: unknown): string | null {
  const normalized = asNonEmptyString(value)
    ?.replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) return null;
  const characters = [...normalized];
  if (characters.length <= MAX_MESSAGE_PREVIEW_LENGTH) return normalized;
  return `${characters.slice(0, MAX_MESSAGE_PREVIEW_LENGTH - 1).join("").trimEnd()}…`;
}

function parseTimestamp(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function retryDelaySeconds(attemptCount: number): number {
  const index = Math.max(0, Math.floor(attemptCount) - 1);
  return RETRY_DELAYS_SECONDS[Math.min(index, RETRY_DELAYS_SECONDS.length - 1)];
}

export function isCallEventCurrent(
  eventType: CallPushEventType,
  status: string,
  expiresAt: unknown,
  now = Date.now(),
): boolean {
  const normalized = status.trim().toLowerCase();
  if (eventType === "incoming_call") {
    const expiry = parseTimestamp(expiresAt);
    return normalized === "ringing" && (expiry === null || expiry > now);
  }
  if (eventType === "call_accepted") {
    return ["connecting", "connected", "active"].includes(normalized);
  }
  return ["ended", "cancelled", "canceled", "missed", "rejected", "declined", "busy", "failed", "expired"]
    .includes(normalized);
}

export function buildChatPushNotification(
  eventKey: string,
  payload: Record<string, unknown>,
): ChatPushNotification | null {
  const recipientId = asNonEmptyString(payload.recipientId);
  const bookingId = asNonEmptyString(payload.bookingId);
  const messageId = asNonEmptyString(payload.messageId);
  if (!recipientId || !bookingId || !messageId) return null;

  const kind = payload.kind === "voice" || payload.kind === "file" ? payload.kind : "text";
  const body = kind === "voice"
    ? "لديك رسالة صوتية جديدة في المحادثة."
    : kind === "file"
      ? "لديك مرفق جديد في المحادثة."
      : messagePreview(payload.messageText) ?? "لديك رسالة نصية جديدة في المحادثة.";
  const senderName = asNonEmptyString(payload.senderName);

  return {
    recipientId,
    notification: {
      title: senderName ? `رسالة من ${senderName}` : "رسالة جديدة في المحادثة",
      body,
      data: {
        type: "chat_message",
        bookingId,
        messageId,
        eventId: eventKey,
        route: "/messages",
      },
    },
  };
}

export function buildSessionReminderNotification(
  eventKey: string,
  payload: Record<string, unknown>,
): ChatPushNotification | null {
  const recipientId = asNonEmptyString(payload.recipientId);
  const bookingId = asNonEmptyString(payload.bookingId);
  const recipientRole = payload.recipientRole;
  const subjectName = asNonEmptyString(payload.subjectName);
  const scheduledAt = asNonEmptyString(payload.scheduledAt);
  if (
    !recipientId
    || !bookingId
    || (recipientRole !== "student" && recipientRole !== "teacher")
    || !scheduledAt
  ) return null;

  const scheduledAtMs = Date.parse(scheduledAt);
  if (!Number.isFinite(scheduledAtMs)) return null;
  const time = new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    hour: "numeric",
    minute: "2-digit",
  }).format(scheduledAtMs);
  const subject = subjectName?.slice(0, 80) ?? "الحصة";

  return {
    recipientId,
    notification: {
      title: "تذكير بموعد الحصة",
      body: `موعد حصتك في مادة ${subject} الساعة ${time}.`,
      data: {
        type: "session_reminder",
        bookingId,
        eventId: eventKey,
        route: "/bookings",
      },
    },
  };
}

export function buildPlatformNotification(
  eventKey: string,
  payload: Record<string, unknown>,
): ChatPushNotification | null {
  const recipientId = asNonEmptyString(payload.recipientId);
  const notificationId = asNonEmptyString(payload.notificationId);
  const title = asNonEmptyString(payload.title);
  const body = asNonEmptyString(payload.body);
  if (!recipientId || !notificationId || !title || !body) return null;

  return {
    recipientId,
    notification: {
      title,
      body,
      data: {
        type: asNonEmptyString(payload.type) ?? "system_notification",
        notificationId,
        eventId: eventKey,
      },
    },
  };
}

export async function dispatchPushOutboxEvent(
  event: Pick<PushOutboxEvent, "event_key" | "event_type" | "payload">,
  handlers: PushDeliveryHandlers = {
    sendMessage: sendUserPushNotification,
    sendCall: sendCallPushNotification,
  },
): Promise<boolean | "skip"> {
  const payload = asRecord(event.payload);
  if (!payload || !OUTBOX_EVENT_TYPES.has(event.event_type as PushOutboxEventType)) return "skip";

  if (event.event_type === "chat_message") {
    const message = buildChatPushNotification(event.event_key, payload);
    if (!message) return "skip";
    return handlers.sendMessage(message.recipientId, message.notification);
  }

  if (event.event_type === "session_reminder") {
    const reminder = buildSessionReminderNotification(event.event_key, payload);
    if (!reminder) return "skip";
    return handlers.sendMessage(reminder.recipientId, reminder.notification);
  }

  if (event.event_type === "platform_notification") {
    const notification = buildPlatformNotification(event.event_key, payload);
    if (!notification) return "skip";
    return handlers.sendMessage(notification.recipientId, notification.notification);
  }

  const callId = asNonEmptyString(payload.callId);
  const recipientId = asNonEmptyString(payload.recipientId);
  if (!callId || !recipientId) return "skip";
  return handlers.sendCall({
    eventKey: event.event_key,
    eventType: event.event_type as CallPushEventType,
    payload,
  });
}

async function hasOutboxTable(): Promise<boolean> {
  if (!outboxTableAvailable) {
    outboxTableAvailable = db.execute(
      sql`SELECT to_regclass('public.push_delivery_outbox') IS NOT NULL AS available`,
    ).then((result) => {
      const [row] = rowsFrom<{ available?: boolean }>(result);
      return row?.available === true;
    }).catch((error) => {
      outboxTableAvailable = null;
      throw error;
    });
  }
  return outboxTableAvailable;
}

export async function isPushOutboxAvailable(): Promise<boolean> {
  return hasOutboxTable();
}

export async function hasPlatformNotificationOutboxEvent(notificationId: string): Promise<boolean | null> {
  try {
    if (!await hasOutboxTable()) return false;
    const eventKey = `platform-notification:${notificationId}`;
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM public.push_delivery_outbox
        WHERE event_key = ${eventKey}
      ) AS queued
    `);
    const [row] = rowsFrom<{ queued?: boolean }>(result);
    return row?.queued === true;
  } catch (error) {
    logger.warn({
      reason: "platform_notification_outbox_lookup_failed",
      errorName: error instanceof Error ? error.name : "unknown",
    }, "Could not check whether a platform notification is already queued");
    return null;
  }
}

export async function sendLegacyPlatformNotification(
  notificationId: string | null,
  sendDirect: () => Promise<boolean>,
  checkQueued: (notificationId: string) => Promise<boolean | null> = hasPlatformNotificationOutboxEvent,
): Promise<boolean> {
  if (notificationId && await checkQueued(notificationId) !== false) return true;
  return sendDirect();
}

export async function enqueuePushOutboxEvent(
  eventKey: string,
  eventType: PushOutboxEventType,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!await hasOutboxTable()) return false;
  await db.execute(sql`
    INSERT INTO public.push_delivery_outbox (event_key, event_type, payload)
    VALUES (${eventKey}, ${eventType}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (event_key) DO NOTHING
  `);
  return true;
}

async function currentChatMessage(
  payload: Record<string, unknown>,
): Promise<{ kind: "text" | "voice" | "file"; content?: string } | null> {
  const messageId = asNonEmptyString(payload.messageId);
  const bookingId = asNonEmptyString(payload.bookingId);
  const senderId = asNonEmptyString(payload.senderId);
  if (!messageId || !bookingId || !senderId) return null;

  const result = await db.execute(sql`
    SELECT content, file_type
    FROM public.chat_messages
    WHERE id::text = ${messageId}
      AND booking_id::text = ${bookingId}
      AND sender_id::text = ${senderId}
      AND is_filtered IS NOT TRUE
    LIMIT 1
  `);
  const [row] = rowsFrom<{ content?: string | null; file_type?: string | null }>(result);
  if (!row) return null;

  const fileType = asNonEmptyString(row.file_type)?.toLowerCase();
  const kind = !fileType
    ? "text"
    : fileType === "voice" || fileType.startsWith("audio/")
      ? "voice"
      : "file";
  return kind === "text"
    ? { kind, content: asNonEmptyString(row.content) ?? undefined }
    : { kind };
}

async function isCallStillValid(
  eventType: CallPushEventType,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const callId = asNonEmptyString(payload.callId);
  const recipientId = asNonEmptyString(payload.recipientId);
  if (!callId || !recipientId) return false;

  const result = await db.execute(sql`
    SELECT
      status,
      expires_at,
      caller_id::text AS caller_id,
      callee_id::text AS callee_id,
      booking_id::text AS booking_id
    FROM public.internal_calls
    WHERE id::text = ${callId}
    LIMIT 1
  `);
  const [call] = rowsFrom<{
    status?: string;
    expires_at?: Date | string | null;
    caller_id?: string;
    callee_id?: string;
    booking_id?: string | null;
  }>(result);
  if (!call?.status || !isCallEventCurrent(eventType, call.status, call.expires_at)) return false;

  if (eventType === "incoming_call") {
    return call.callee_id === recipientId
      && call.caller_id === asNonEmptyString(payload.callerId)
      && (payload.bookingId == null || payload.bookingId === call.booking_id);
  }
  if (eventType === "call_accepted") return call.caller_id === recipientId;
  return call.caller_id === recipientId || call.callee_id === recipientId;
}

async function currentSessionReminder(
  payload: Record<string, unknown>,
): Promise<{ recipientRole: "student" | "teacher"; subjectName: string; scheduledAt: string } | null> {
  const bookingId = asNonEmptyString(payload.bookingId);
  const recipientId = asNonEmptyString(payload.recipientId);
  const scheduledAt = asNonEmptyString(payload.scheduledAt);
  if (!bookingId || !recipientId || !scheduledAt || !Number.isFinite(Date.parse(scheduledAt))) return null;

  const result = await db.execute(sql`
    SELECT
      b.student_id::text AS student_id,
      b.teacher_id::text AS teacher_id,
      b.scheduled_at::text AS scheduled_at,
      COALESCE(s.name, '') AS subject_name
    FROM public.bookings AS b
    LEFT JOIN public.subjects AS s ON s.id = b.subject_id
    WHERE b.id::text = ${bookingId}
      AND b.status = 'confirmed'
      AND b.scheduled_at > now()
      AND date_trunc('milliseconds', b.scheduled_at)
        = date_trunc('milliseconds', ${scheduledAt}::timestamptz)
    LIMIT 1
  `);
  const [booking] = rowsFrom<{
    student_id?: string;
    teacher_id?: string;
    scheduled_at?: string;
    subject_name?: string | null;
  }>(result);
  if (!booking?.scheduled_at) return null;

  const recipientRole = booking.student_id === recipientId
    ? "student"
    : booking.teacher_id === recipientId
      ? "teacher"
      : null;
  if (
    !recipientRole
    || recipientRole !== payload.recipientRole
    || !Number.isFinite(Date.parse(booking.scheduled_at))
  ) return null;

  return {
    recipientRole,
    subjectName: asNonEmptyString(booking.subject_name) ?? "الحصة",
    scheduledAt: booking.scheduled_at,
  };
}

async function currentPlatformNotification(
  payload: Record<string, unknown>,
): Promise<{ title: string; body: string; type: string } | null> {
  const notificationId = asNonEmptyString(payload.notificationId);
  const recipientId = asNonEmptyString(payload.recipientId);
  if (!notificationId || !recipientId) return null;

  const result = await db.execute(sql`
    SELECT
      n.title,
      n.body,
      COALESCE(to_jsonb(n) ->> 'type', 'system_notification') AS notification_type
    FROM public.notifications AS n
    WHERE n.id::text = ${notificationId}
      AND n.user_id::text = ${recipientId}
    LIMIT 1
  `);
  const [row] = rowsFrom<{
    title?: string | null;
    body?: string | null;
    notification_type?: string | null;
  }>(result);
  const title = asNonEmptyString(row?.title);
  const body = asNonEmptyString(row?.body);
  if (!title || !body) return null;

  return {
    title,
    body,
    type: asNonEmptyString(row?.notification_type) ?? "system_notification",
  };
}

async function currentProfileName(userId: string, fallback: string): Promise<string> {
  try {
    const result = await db.execute(sql`
      SELECT full_name
      FROM public.profiles
      WHERE user_id::text = ${userId}
      LIMIT 1
    `);
    const [profile] = rowsFrom<{ full_name?: string | null }>(result);
    return asNonEmptyString(profile?.full_name)?.slice(0, 64) ?? fallback;
  } catch {
    return fallback;
  }
}

async function deliverCurrentEvent(event: PushOutboxEvent): Promise<boolean | "skip"> {
  const payload = asRecord(event.payload);
  if (!payload || !OUTBOX_EVENT_TYPES.has(event.event_type as PushOutboxEventType)) return "skip";

  if (event.event_type === "chat_message") {
    const message = await currentChatMessage(payload);
    if (!message) return "skip";
    payload.kind = message.kind;
    if (message.kind === "text" && message.content) {
      payload.messageText = message.content;
    } else {
      delete payload.messageText;
    }
    const senderId = asNonEmptyString(payload.senderId);
    if (senderId) payload.senderName = await currentProfileName(senderId, "مستخدم");
    return dispatchPushOutboxEvent({ ...event, payload });
  }

  if (event.event_type === "session_reminder") {
    const reminder = await currentSessionReminder(payload);
    if (!reminder) return "skip";
    payload.recipientRole = reminder.recipientRole;
    payload.subjectName = reminder.subjectName;
    payload.scheduledAt = reminder.scheduledAt;
    return dispatchPushOutboxEvent({ ...event, payload });
  }

  if (event.event_type === "platform_notification") {
    const notification = await currentPlatformNotification(payload);
    if (!notification) return "skip";
    payload.title = notification.title;
    payload.body = notification.body;
    payload.type = notification.type;
    return dispatchPushOutboxEvent({ ...event, payload });
  }

  const eventType = event.event_type as CallPushEventType;
  if (!await isCallStillValid(eventType, payload)) return "skip";
  if (eventType === "incoming_call") {
    const callerId = asNonEmptyString(payload.callerId);
    if (!callerId) return "skip";
    payload.callerName = await currentProfileName(callerId, "مستخدم أجيال المعرفة");
    payload.callerRole = "معلم";
  }
  return dispatchPushOutboxEvent({ ...event, payload });
}

async function claimPendingEvents(): Promise<PushOutboxEvent[]> {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      WITH ready AS (
        SELECT id
        FROM public.push_delivery_outbox
        WHERE processed_at IS NULL
          AND failed_at IS NULL
          AND available_at <= now()
          AND (locked_until IS NULL OR locked_until <= now())
        ORDER BY available_at, created_at
        LIMIT ${CLAIM_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE public.push_delivery_outbox AS outbox
      SET locked_until = now() + (${LOCK_DURATION_SECONDS} * interval '1 second'),
          attempt_count = outbox.attempt_count + 1
      FROM ready
      WHERE outbox.id = ready.id
      RETURNING outbox.id::text AS id,
        outbox.event_key,
        outbox.event_type,
        outbox.payload,
        outbox.attempt_count
    `);
    return rowsFrom<PushOutboxEvent>(result);
  });
}

async function markProcessed(id: string): Promise<void> {
  await db.execute(sql`
    UPDATE public.push_delivery_outbox
    SET processed_at = now(), locked_until = NULL, last_error = NULL
    WHERE id::text = ${id}
  `);
}

async function scheduleRetry(event: PushOutboxEvent, reason: string): Promise<void> {
  if (event.attempt_count >= MAX_ATTEMPTS) {
    await db.execute(sql`
      UPDATE public.push_delivery_outbox
      SET failed_at = now(), locked_until = NULL, last_error = ${reason}
      WHERE id::text = ${event.id}
    `);
    logger.error({
      eventType: event.event_type,
      attemptCount: event.attempt_count,
      reason,
    }, "Push outbox event exhausted retries");
    return;
  }

  const delaySeconds = retryDelaySeconds(event.attempt_count);
  await db.execute(sql`
    UPDATE public.push_delivery_outbox
    SET available_at = now() + (${delaySeconds} * interval '1 second'),
        locked_until = NULL,
        last_error = ${reason}
    WHERE id::text = ${event.id}
  `);
}

async function pollPushOutbox(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const events = await claimPendingEvents();
    for (const event of events) {
      try {
        const result = await deliverCurrentEvent(event);
        if (result === "skip" || result === true) {
          await markProcessed(event.id);
          if (result === true) {
            logger.info({ eventType: event.event_type }, "Push outbox provider accepted event");
          }
        } else {
          await scheduleRetry(event, "provider_not_accepted");
        }
      } catch (error) {
        logger.warn({
          eventType: event.event_type,
          attemptCount: event.attempt_count,
          errorName: error instanceof Error ? error.name : "unknown",
        }, "Push outbox event processing failed");
        await scheduleRetry(event, "processing_error").catch((retryError) => {
          logger.error({
            eventType: event.event_type,
            errorName: retryError instanceof Error ? retryError.name : "unknown",
          }, "Could not reschedule push outbox event");
        });
      }
    }
  } catch (error) {
    logger.warn({
      errorName: error instanceof Error ? error.name : "unknown",
    }, "Push outbox polling failed");
  } finally {
    polling = false;
  }
}

export async function startPushOutboxWorker(): Promise<void> {
  if (workerStarted) return;
  try {
    if (!await hasOutboxTable()) {
      logger.info({ reason: "outbox_table_missing" }, "Persistent push worker is disabled");
      return;
    }
  } catch (error) {
    logger.warn({
      errorName: error instanceof Error ? error.name : "unknown",
    }, "Persistent push worker could not inspect its outbox");
    return;
  }

  workerStarted = true;
  const timer = setInterval(() => {
    void pollPushOutbox();
  }, POLL_INTERVAL_MS);
  timer.unref();
  void pollPushOutbox();
  logger.info({ pollIntervalMs: POLL_INTERVAL_MS }, "Persistent push worker started");
}

export const __testing = { asRecord, parseTimestamp };
