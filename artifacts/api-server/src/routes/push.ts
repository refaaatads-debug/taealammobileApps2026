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
import { db, pushTokensTable, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { ExpoPushError, INCOMING_CALL_CATEGORY, INCOMING_CALL_CHANNEL, sendExpoPushMessage } from "../lib/expoPush";
import { sendApnsVoipPush } from "../lib/apnsVoip";
import { decodePushTokenBundle, mergePushTokenBundle } from "../lib/pushTokenBundle";
import { readBearerToken, supabaseTable } from "../lib/supabaseAuth";
import { sendUserPushNotification } from "../lib/userPush";

const router: IRouter = Router();

function requireUser(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id;
}

function callerRole(role: "student" | "teacher"): string {
  return role === "teacher" ? "معلمة" : "طالبة";
}

router.post("/push-tokens", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const parsed = RegisterPushTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid Expo push token" });
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

  const delivered = await sendUserPushNotification(parsed.data.recipientId, {
    title: parsed.data.title,
    body: parsed.data.body,
    data: {
      type: parsed.data.type,
      ...(parsed.data.route ? { route: parsed.data.route } : {}),
      ...(parsed.data.bookingId ? { bookingId: parsed.data.bookingId } : {}),
    },
  });
  res.status(202).json(SendUserNotificationResponse.parse({ delivered }));
});

router.post("/push/messages", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const bookingId = typeof req.body?.bookingId === "string" ? req.body.bookingId.trim() : "";
  const recipientId = typeof req.body?.recipientId === "string" ? req.body.recipientId.trim() : "";
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

  const profiles = await supabaseTable<Record<string, unknown>>(supabaseToken, "profiles", {
    user_id: `eq.${userId}`,
    select: "*",
    limit: "1",
  });
  const senderName = typeof profiles[0]?.full_name === "string"
    ? profiles[0].full_name
    : typeof profiles[0]?.display_name === "string"
      ? profiles[0].display_name
      : "أحد أطراف جلساتك";
  const body = kind === "voice"
    ? `أرسل ${senderName} رسالة صوتية جديدة.`
    : kind === "file"
      ? `أرسل ${senderName} مرفقاً جديداً.`
      : `أرسل ${senderName} رسالة جديدة.`;
  const delivered = await sendUserPushNotification(recipientId, {
    title: "رسالة جديدة",
    body,
    data: { type: "chat_message", bookingId, route: "/messages" },
  });
  res.status(202).json({ delivered });
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

  const callId = parsed.data.callId ?? crypto.randomUUID();
  const destination = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
    const [caller] = await tx.select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: usersTable.role,
    }).from(usersTable).where(eq(usersTable.id, userId));
    const [recipient] = await tx.select({
      id: usersTable.id,
    }).from(usersTable).where(and(
      eq(usersTable.id, parsed.data.recipientId),
    ));
    const [pushToken] = await tx.select({
      token: pushTokensTable.token,
      platform: pushTokensTable.platform,
    }).from(pushTokensTable).where(eq(pushTokensTable.userId, parsed.data.recipientId));
    return { caller, recipient, pushToken };
  });

  if (!destination.caller || !destination.recipient) {
    // The Supabase call row and Realtime channel are authoritative. The API
    // server may not yet have a local mirror of every Supabase user.
    req.log.warn({
      reason: "missing_local_caller_or_recipient",
      hasCaller: Boolean(destination.caller),
      hasRecipient: Boolean(destination.recipient),
    }, "Incoming call push skipped");
    res.status(202).json(SendIncomingCallResponse.parse({ callId, delivered: false }));
    return;
  }
  if (destination.recipient.id === userId) {
    res.status(404).json({ error: "Call recipient not found" });
    return;
  }
  if (!destination.pushToken) {
    // Push is only a delivery optimization. The internal_calls row and
    // Supabase Realtime are the authoritative call transport for foreground
    // web/native clients, so a missing token must not fail the call.
    req.log.warn({ reason: "missing_recipient_push_token" }, "Incoming call push skipped");
    res.status(202).json(SendIncomingCallResponse.parse({ callId, delivered: false }));
    return;
  }
  const destinationToken = decodePushTokenBundle(destination.pushToken.token);
  if (!destinationToken) {
    req.log.warn({ reason: "invalid_recipient_push_token_bundle" }, "Incoming call push skipped");
    res.status(202).json(SendIncomingCallResponse.parse({ callId, delivered: false }));
    return;
  }

  const callerName = [destination.caller.firstName, destination.caller.lastName]
    .filter(Boolean)
    .join(" ") || "مستخدم";
  let deliveredVia: "apns_voip" | "expo" = "expo";
  try {
    const tokenBundle = destinationToken;
    const callUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(callId)
      ? callId
      : crypto.randomUUID();
    const callPayload = {
        aps: { "content-available": 1 as const },
        type: "incoming_call",
        callId,
        callUuid,
        uuid: callUuid,
        handle: userId,
        callerId: userId,
        callerName,
        callerRole: callerRole(destination.caller.role),
        roomId: parsed.data.roomId,
      } as const;
    if (destination.pushToken.platform === "ios" && tokenBundle.apnsVoipToken && tokenBundle.apnsVoipEnvironment) {
      try {
        await sendApnsVoipPush(tokenBundle.apnsVoipToken, tokenBundle.apnsVoipEnvironment, callPayload);
        deliveredVia = "apns_voip";
      } catch (error) {
        req.log.warn({ errorName: error instanceof Error ? error.name : "unknown" }, "APNs VoIP push failed; falling back to Expo");
        await sendExpoPushMessage({ to: tokenBundle.expoToken, data: callPayload, priority: "high", ttl: 60, _contentAvailable: true });
      }
    } else {
      await sendExpoPushMessage({
        to: tokenBundle.expoToken,
        ...(destination.pushToken.platform === "android" ? {} : { title: "مكالمة واردة", body: `${callerName} يتصل بك الآن` }),
        data: callPayload,
        ...(destination.pushToken.platform === "android" ? {} : { categoryId: INCOMING_CALL_CATEGORY, channelId: INCOMING_CALL_CHANNEL, sound: "incoming_call.wav" }),
        priority: "high",
        ttl: 60,
        _contentAvailable: destination.pushToken.platform === "ios",
      });
    }
  } catch (error) {
    req.log.error({
      reason: "push_provider_rejected",
      errorName: error instanceof Error ? error.name : "unknown",
      providerCode: error instanceof ExpoPushError ? error.providerCode ?? null : null,
    }, "Incoming call push failed");
    res.status(202).json(SendIncomingCallResponse.parse({ callId, delivered: false }));
    return;
  }

  req.log.info({ delivered: true, deliveredVia }, "Incoming call push accepted by provider");
  res.status(202).json(SendIncomingCallResponse.parse({ callId, delivered: true }));
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

  const destination = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
    const [pushToken] = await tx.select({
      token: pushTokensTable.token,
      platform: pushTokensTable.platform,
    }).from(pushTokensTable).where(eq(pushTokensTable.userId, parsed.data.recipientId));
    return pushToken;
  });

  if (!destination) {
    res.status(202).json(SendCallEndedResponse.parse({ callId: params.data.callId, delivered: false }));
    return;
  }
  const destinationToken = decodePushTokenBundle(destination.token);
  if (!destinationToken) {
    res.status(202).json(SendCallEndedResponse.parse({ callId: params.data.callId, delivered: false }));
    return;
  }

  let deliveredVia: "apns_voip" | "expo" = "expo";
  try {
    if (
      destination.platform === "ios"
      && destinationToken.apnsVoipToken
      && destinationToken.apnsVoipEnvironment
    ) {
      try {
        await sendApnsVoipPush(destinationToken.apnsVoipToken, destinationToken.apnsVoipEnvironment, {
          aps: { "content-available": 1 },
          type: "call_ended",
          callId: params.data.callId,
          uuid: params.data.callId,
        });
        deliveredVia = "apns_voip";
      } catch (error) {
        req.log.warn({ errorName: error instanceof Error ? error.name : "unknown" }, "APNs VoIP end push failed; falling back to Expo");
        await sendExpoPushMessage({
          to: destinationToken.expoToken,
          data: {
            type: "call_ended",
            callId: params.data.callId,
          },
          priority: "high",
          ttl: 30,
          _contentAvailable: true,
        });
      }
    } else {
      await sendExpoPushMessage({
        to: destinationToken.expoToken,
        data: {
          type: "call_ended",
          callId: params.data.callId,
        },
        priority: "high",
        ttl: 30,
        _contentAvailable: true,
      });
    }
  } catch (error) {
    req.log.error({ errorName: error instanceof Error ? error.name : "unknown" }, "Call ended push failed");
    res.status(202).json(SendCallEndedResponse.parse({ callId: params.data.callId, delivered: false }));
    return;
  }

  req.log.info({ delivered: true, deliveredVia }, "Call ended push accepted by provider");
  res.status(202).json(SendCallEndedResponse.parse({ callId: params.data.callId, delivered: true }));
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

  const destination = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
    const [pushToken] = await tx.select({
      token: pushTokensTable.token,
    }).from(pushTokensTable).where(eq(pushTokensTable.userId, parsed.data.recipientId));
    return pushToken;
  });

  if (!destination) {
    res.status(202).json(SendCallAcceptedResponse.parse({ callId: params.data.callId, delivered: false }));
    return;
  }
  const destinationToken = decodePushTokenBundle(destination.token);
  if (!destinationToken) {
    res.status(202).json(SendCallAcceptedResponse.parse({ callId: params.data.callId, delivered: false }));
    return;
  }

  try {
    await sendExpoPushMessage({
      to: destinationToken.expoToken,
      data: {
        type: "call_accepted",
        callId: params.data.callId,
      },
      priority: "high",
      ttl: 30,
      _contentAvailable: true,
    });
  } catch (error) {
    req.log.error({ errorName: error instanceof Error ? error.name : "unknown" }, "Call accepted push failed");
    res.status(202).json(SendCallAcceptedResponse.parse({ callId: params.data.callId, delivered: false }));
    return;
  }

  res.status(202).json(SendCallAcceptedResponse.parse({ callId: params.data.callId, delivered: true }));
});

export default router;