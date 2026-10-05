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
  "incoming_call",
  "call_accepted",
  "call_ended",
]);

export type PushOutboxEventType = "chat_message" | CallPushEventType;

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
      : "لديك رسالة نصية جديدة في المحادثة.";
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

async function isMessageStillValid(payload: Record<string, unknown>): Promise<boolean> {
  const messageId = asNonEmptyString(payload.messageId);
  const bookingId = asNonEmptyString(payload.bookingId);
  const senderId = asNonEmptyString(payload.senderId);
  if (!messageId || !bookingId || !senderId) return false;

  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM public.chat_messages
      WHERE id::text = ${messageId}
        AND booking_id::text = ${bookingId}
        AND sender_id::text = ${senderId}
        AND is_filtered IS NOT TRUE
    ) AS present
  `);
  const [row] = rowsFrom<{ present?: boolean }>(result);
  return row?.present === true;
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
    if (!await isMessageStillValid(payload)) return "skip";
    const senderId = asNonEmptyString(payload.senderId);
    if (senderId) payload.senderName = await currentProfileName(senderId, "مستخدم");
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
