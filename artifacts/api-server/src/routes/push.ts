import {
  RegisterPushTokenBody,
  RegisterPushTokenResponse,
  SendUserNotificationBody,
  SendUserNotificationResponse,
  SendCallEndedBody,
  SendCallEndedParams,
  SendCallEndedResponse,
  SendCallAcceptedBody,
  SendCallAcceptedParams,
  SendCallAcceptedResponse,
  SendIncomingCallBody,
  SendIncomingCallResponse,
  UnregisterPushTokenResponse,
} from "@workspace/api-zod";
import { db, notificationsTable, pushTokensTable } from "@workspace/db";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { decodePushTokenBundle, mergePushTokenBundle } from "../lib/pushTokenBundle";
import { findNotificationImageUrl } from "../lib/notificationImage";
import { getSupabaseRoles, readBearerToken, supabaseTable } from "../lib/supabaseAuth";
import { sendUserPushNotification } from "../lib/userPush";
import { hasPushEligibleRole, incomingCallRowMatches } from "../lib/pushIdentity";
import { enqueuePushOutboxEvent, sendLegacyPlatformNotification } from "../lib/pushOutbox";

const router: IRouter = Router();

function requireUser(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id;
}

async function findRecentNotificationId(
  recipientId: string,
  title: string,
  body: string,
): Promise<string | null> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${recipientId}, true)`);
      const [notification] = await tx.select({ id: notificationsTable.id })
        .from(notificationsTable)
        .where(and(
          eq(notificationsTable.userId, recipientId),
          eq(notificationsTable.title, title),
          eq(notificationsTable.body, body),
          gt(notificationsTable.createdAt, new Date(Date.now() - 60_000)),
        ))
        .orderBy(desc(notificationsTable.createdAt))
        .limit(1);
      return notification?.id ?? null;
    });
  } catch {
    return null;
  }
}

router.post("/push-tokens", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const parsed = RegisterPushTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid Expo push token" });
    return;
  }
  const supabaseToken = readBearerToken(req.get("authorization") ?? undefined);
  if (!supabaseToken) {
    res.status(401).json({ error: "A Supabase bearer token is required for push registration" });
    return;
  }

  let pushUserReady = false;
  try {
    pushUserReady = hasPushEligibleRole(await getSupabaseRoles(supabaseToken, userId));
  } catch (error) {
    req.log.warn({
      reason: "push_user_role_verification_failed",
      errorName: error instanceof Error ? error.name : "unknown",
    }, "Push token registration could not verify the Supabase user role");
    res.status(503).json({ error: "Could not verify the account for push registration" });
    return;
  }
  if (!pushUserReady) {
    res.status(403).json({ error: "A verified student or teacher role is required for push registration" });
    return;
  }

  let storedToken = "";
  let invalidBundle = false;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
    const existingTokens = await tx.select({
      id: pushTokensTable.id,
      userId: pushTokensTable.userId,
      token: pushTokensTable.token,
    }).from(pushTokensTable);
    const existingUserToken = existingTokens.find((row) => row.userId === userId)?.token ?? null;
    try {
      storedToken = mergePushTokenBundle(existingUserToken, {
        expoToken: parsed.data.token,
        apnsVoipToken: parsed.data.apnsVoipToken,
        apnsVoipEnvironment: parsed.data.apnsVoipEnvironment,
      });
    } catch {
      invalidBundle = true;
      return;
    }
    const duplicateIds = existingTokens
      .filter((row) => row.userId !== userId && decodePushTokenBundle(row.token)?.expoToken === parsed.data.token)
      .map((row) => row.id);
    for (const duplicateId of duplicateIds) {
      await tx.delete(pushTokensTable).where(eq(pushTokensTable.id, duplicateId));
    }
    await tx.insert(pushTokensTable).values({
      id: crypto.randomUUID(),
      userId,
      token: storedToken,
      platform: parsed.data.platform,
    }).onConflictDoUpdate({
      target: pushTokensTable.userId,
      set: {
        token: storedToken,
        platform: parsed.data.platform,
        updatedAt: new Date(),
      },
    });
  });

  if (invalidBundle) {
    res.status(400).json({ error: "Invalid push token bundle" });
    return;
  }
  res.json(RegisterPushTokenResponse.parse({ registered: true }));
});

router.delete("/push-tokens", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    await tx.delete(pushTokensTable).where(eq(pushTokensTable.userId, userId));
  });

  res.json(UnregisterPushTokenResponse.parse({ registered: true }));
});

router.post("/push/notifications", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const parsed = SendUserNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const notificationId = await findRecentNotificationId(
    parsed.data.recipientId,
    parsed.data.title,
    parsed.data.body,
  );
  const imageUrl = findNotificationImageUrl({ imageUrl: parsed.data.imageUrl });
  const delivered = await sendLegacyPlatformNotification(
    notificationId,
    () => sendUserPushNotification(parsed.data.recipientId, {
      title: parsed.data.title,
      body: parsed.data.body,
      data: {
        type: parsed.data.type,
        ...(notificationId ? { notificationId } : {}),
        ...(parsed.data.route ? { route: parsed.data.route } : {}),
        ...(parsed.data.bookingId ? { bookingId: parsed.data.bookingId } : {}),
        ...(imageUrl ? { imageUrl } : {}),
      },
      ...(imageUrl ? { richContent: { image: imageUrl } } : {}),
    }),
  );
  res.status(202).json(SendUserNotificationResponse.parse({ delivered }));
});

router.post("/push/messages", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const bookingId = typeof req.body?.bookingId === "string" ? req.body.bookingId.trim() : "";
  const recipientId = typeof req.body?.recipientId === "string" ? req.body.recipientId.trim() : "";
  const messageId = typeof req.body?.messageId === "string" ? req.body.messageId.trim() : "";
  const kind = req.body?.kind === "voice" || req.body?.kind === "file" ? req.body.kind : "text";
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!bookingId || !recipientId || !supabaseToken) {
    res.status(400).json({ error: "Invalid message notification request" });
    return;
  }

  const bookings = await supabaseTable<Record<string, unknown>>(supabaseToken, "bookings", {
    id: `eq.${bookingId}`,
    or: `(student_id.eq.${userId},teacher_id.eq.${userId})`,
    select: "student_id,teacher_id",
    limit: "1",
  });
  const booking = bookings[0];
  const studentId = typeof booking?.student_id === "string" ? booking.student_id : "";
  const teacherId = typeof booking?.teacher_id === "string" ? booking.teacher_id : "";
  const expectedRecipient = studentId === userId ? teacherId : teacherId === userId ? studentId : "";
  if (!expectedRecipient || expectedRecipient !== recipientId) {
    res.status(403).json({ error: "Message recipient is not part of this booking" });
    return;
  }
  if (messageId) {
    const messages = await supabaseTable<Record<string, unknown>>(supabaseToken, "chat_messages", {
      id: `eq.${messageId}`,
      booking_id: `eq.${bookingId}`,
      sender_id: `eq.${userId}`,
      select: "id",
      limit: "1",
    });
    if (!messages.length) {
      res.status(403).json({ error: "The message does not belong to the authenticated sender and booking" });
      return;
    }
  }

  let queued = false;
  if (messageId) {
    try {
      queued = await enqueuePushOutboxEvent(`chat-message:${messageId}`, "chat_message", {
        messageId,
        bookingId,
        senderId: userId,
        recipientId,
        kind,
      });
    } catch (error) {
      req.log.warn({
        reason: "message_push_enqueue_failed",
        errorName: error instanceof Error ? error.name : "unknown",
      }, "Message was saved, but the API could not confirm its push queue entry");
    }
  }
  res.status(202).json({ delivered: false, queued });
});

router.post("/push/assignment-submissions", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const assignmentId = typeof req.body?.assignmentId === "string" ? req.body.assignmentId.trim() : "";
  const submissionId = typeof req.body?.submissionId === "string" ? req.body.submissionId.trim() : "";
  const event = req.body?.event === "graded" ? "graded" : req.body?.event === "submitted" ? "submitted" : "";
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!assignmentId || !submissionId || !event || !supabaseToken) {
    res.status(400).json({ error: "Invalid assignment notification request" });
    return;
  }

  const [assignments, submissions] = await Promise.all([
    supabaseTable<Record<string, unknown>>(supabaseToken, "assignments", {
      id: `eq.${assignmentId}`,
      select: "id,title,total_points,teacher_id",
      limit: "1",
    }),
    supabaseTable<Record<string, unknown>>(supabaseToken, "assignment_submissions", {
      id: `eq.${submissionId}`,
      assignment_id: `eq.${assignmentId}`,
      select: "id,student_id",
      limit: "1",
    }),
  ]);
  const assignment = assignments[0];
  const submission = submissions[0];
  const teacherId = typeof assignment?.teacher_id === "string" ? assignment.teacher_id : "";
  const studentId = typeof submission?.student_id === "string" ? submission.student_id : "";
  if (!assignment || !submission || !teacherId || !studentId) {
    res.status(404).json({ error: "Assignment submission not found" });
    return;
  }

  const isStudentSubmission = event === "submitted" && studentId === userId;
  const isTeacherGrade = event === "graded" && teacherId === userId;
  if (!isStudentSubmission && !isTeacherGrade) {
    res.status(403).json({ error: "Assignment notification is not authorized for this account" });
    return;
  }

  const recipientId = isStudentSubmission ? teacherId : studentId;
  const title = isStudentSubmission ? "حل واجب جديد" : "تم تصحيح واجبك";
  const assignmentTitle = typeof assignment.title === "string" && assignment.title.trim()
    ? assignment.title.trim()
    : "واجب";
  const body = isStudentSubmission
    ? `تم تسليم حل جديد لواجب "${assignmentTitle}".`
    : `تم تصحيح واجب "${assignmentTitle}". افتح المهام لعرض الدرجة والملاحظات.`;
  const delivered = await sendUserPushNotification(recipientId, {
    title,
    body,
    data: {
      type: isStudentSubmission ? "assignment_submission" : "assignment_graded",
      assignmentId,
      submissionId,
      route: "/assignments",
    },
  });
  res.status(202).json({ delivered });
});

router.post("/calls/incoming", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const parsed = SendIncomingCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const callId = typeof parsed.data.callId === "string" ? parsed.data.callId.trim() : "";
  if (!callId) {
    res.status(400).json({ error: "A valid call ID is required" });
    return;
  }
  if (parsed.data.recipientId.trim() === userId.trim()) {
    res.status(400).json({ error: "The call recipient must be another user" });
    return;
  }
  const supabaseToken = readBearerToken(req.get("authorization") ?? undefined);
  if (!supabaseToken) {
    res.status(401).json({ error: "A Supabase bearer token is required to verify the call" });
    return;
  }

  let callRows: Record<string, unknown>[];
  try {
    callRows = await supabaseTable<Record<string, unknown>>(supabaseToken, "internal_calls", {
      id: `eq.${callId}`,
      select: "*",
      limit: "1",
    });
  } catch (error) {
    req.log.warn({
      reason: "incoming_call_row_verification_failed",
      errorName: error instanceof Error ? error.name : "unknown",
    }, "Incoming call push skipped because the call could not be verified");
    res.status(202).json(SendIncomingCallResponse.parse({ callId, delivered: false }));
    return;
  }
  if (!incomingCallRowMatches(callRows[0], callId, userId, parsed.data.recipientId)) {
    req.log.warn({ reason: "incoming_call_participants_mismatch" }, "Incoming call push rejected");
    res.status(403).json({ error: "The call does not match the authenticated caller and recipient" });
    return;
  }

  const callRow = callRows[0];
  const bookingId = typeof callRow?.booking_id === "string" ? callRow.booking_id : null;
  const roomId = bookingId ?? parsed.data.roomId;
  let queued = false;
  try {
    queued = await enqueuePushOutboxEvent(`internal-call:${callId}:incoming`, "incoming_call", {
      callId,
      callerId: userId,
      recipientId: parsed.data.recipientId,
      bookingId,
      roomId,
    });
  } catch (error) {
    req.log.warn({
      reason: "incoming_call_push_enqueue_failed",
      errorName: error instanceof Error ? error.name : "unknown",
    }, "Call was created, but the API could not confirm its push queue entry");
  }

  res.status(202).json({ callId, delivered: false, queued });
});

router.post("/calls/:callId/end", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const params = SendCallEndedParams.safeParse(req.params);
  const parsed = SendCallEndedBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid call end request" });
    return;
  }
  if (parsed.data.recipientId === userId) {
    res.status(400).json({ error: "Call recipient must be another user" });
    return;
  }

  res.status(202).json(SendCallEndedResponse.parse({ callId: params.data.callId, delivered: false }));
});

router.post("/calls/:callId/accept", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const params = SendCallAcceptedParams.safeParse(req.params);
  const parsed = SendCallAcceptedBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid call acceptance request" });
    return;
  }
  if (parsed.data.recipientId === userId) {
    res.status(400).json({ error: "Call recipient must be another user" });
    return;
  }

  res.status(202).json(SendCallAcceptedResponse.parse({ callId: params.data.callId, delivered: false }));
});

export default router;