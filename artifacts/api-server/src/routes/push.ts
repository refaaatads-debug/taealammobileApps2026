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
import { db, pushTokensTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { ExpoPushError, INCOMING_CALL_CATEGORY, INCOMING_CALL_CHANNEL, sendExpoPushMessage } from "../lib/expoPush";
import { sendApnsVoipPush } from "../lib/apnsVoip";
import { decodePushTokenBundle, mergePushTokenBundle } from "../lib/pushTokenBundle";
import { getSupabaseRoles, readBearerToken, supabaseTable } from "../lib/supabaseAuth";
import { sendUserPushNotification } from "../lib/userPush";
import { hasPushEligibleRole, incomingCallRowMatches } from "../lib/pushIdentity";

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

  const callerRolesPromise = getSupabaseRoles(supabaseToken, userId).catch(
    (error): Awaited<ReturnType<typeof getSupabaseRoles>> => {
      req.log.warn({
        reason: "incoming_call_caller_role_lookup_failed",
        errorName: error instanceof Error ? error.name : "unknown",
      }, "Incoming call push will use a generic caller role label");
      return [];
    },
  );
  const [destination, callerRoles] = await Promise.all([
    db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
      const [pushToken] = await tx.select({
        token: pushTokensTable.token,
        platform: pushTokensTable.platform,
      }).from(pushTokensTable).where(eq(pushTokensTable.userId, parsed.data.recipientId));
      return { pushToken };
    }),
    callerRolesPromise,
  ]);

  if (!destination.pushToken) {
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

  const callerName = [req.user?.firstName, req.user?.lastName]
    .filter(Boolean)
    .join(" ") || "مستخدم";
  const callerRoleValue = callerRoles.includes("teacher")
    ? "teacher"
    : callerRoles.includes("student")
      ? "student"
      : null;
  const callerRoleLabel = callerRoleValue ? callerRole(callerRoleValue) : "مستخدم";
  const callerName = [req.user?.firstName, req.user?.lastName]
    .filter(Boolean)
    .join(" ") || "مستخدم";
  const callerRoleValue = callerRoles.includes("teacher")
    ? "teacher"
    : callerRoles.includes("student")
      ? "student"
      : null;
  const callerRoleLabel = callerRoleValue ? callerRole(callerRoleValue) : "مستخدم";
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
        callerRole: callerRoleLabel,
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