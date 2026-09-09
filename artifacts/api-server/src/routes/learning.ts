import {
  CancelSessionParams,
  CancelSessionBody,
  CancelSessionResponse,
  CompleteAssignmentParams,
  CompleteAssignmentResponse,
  CreateBookingRequestBody,
  CreateBookingRequestResponse,
  CreateBookingRequestGroupBody,
  CreateBookingRequestGroupResponse,
  CancelBookingRequestParams,
  CancelBookingRequestResponse,
  DecideBookingRequestBody,
  DecideBookingRequestParams,
  DecideBookingRequestResponse,
  ListMyAssignmentsResponse,
  ListBookingRequestsQueryParams,
  ListBookingRequestsResponse,
  ListMyNotificationsResponse,
  ListMySessionsQueryParams,
  ListMySessionsResponse,
  GetTeacherDashboardResponse,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";
import crypto from "node:crypto";
import { db, assignmentsTable, bookingsTable, notificationsTable, usersTable } from "@workspace/db";
import { and, asc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { getSupabaseProfile, hasSupabaseRole, readBearerToken, supabaseRpc, supabaseTable } from "../lib/supabaseAuth";
import { normalizeStage, normalizeStageList } from "../lib/teachingStages";
import { sendUserPushNotification } from "../lib/userPush";

const router: IRouter = Router();

type Tone = "teal" | "gold" | "navy";
type SessionView = "upcoming" | "past";

function requireUser(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id;
}

function userName(user: { firstName: string | null; lastName: string | null } | undefined): string {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "مستخدم";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "long" }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("ar-SA", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDuration(minutes: number): string {
  return `${minutes} دقيقة`;
}

async function mapSessions(rows: typeof bookingsTable.$inferSelect[], userId: string, tx: Pick<typeof db, "select">): Promise<ReturnType<typeof ListMySessionsResponse.parse>> {
  const participantIds = [...new Set(rows.map((row) => row.studentId === userId ? row.teacherId : row.studentId))];
  const participants = participantIds.length
    ? await tx.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName }).from(usersTable).where(inArray(usersTable.id, participantIds))
    : [];
  const users = new Map(participants.map((participant) => [participant.id, participant]));
  return ListMySessionsResponse.parse(rows.map((row) => {
    const isExpired = row.startsAt.getTime() <= Date.now() && ["pending", "confirmed"].includes(row.status);
    return {
      id: row.id,
      title: row.title,
      subject: row.subject,
      person: row.studentId === userId ? `أ. ${userName(users.get(row.teacherId))}` : `مع ${userName(users.get(row.studentId))}`,
      date: formatDate(row.startsAt),
      time: formatTime(row.startsAt),
      scheduledAt: row.startsAt.toISOString(),
      duration: formatDuration(row.durationMinutes),
      tone: (["teal", "gold", "navy"].includes(row.tone) ? row.tone : "teal") as Tone,
      status: row.status === "cancelled" ? "cancelled" : row.status === "completed" ? "done" : isExpired ? "expired" : "upcoming",
    };
  }));
}

function formatDue(date: Date): string {
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `انتهى منذ ${Math.abs(days)} يوم`;
  if (days === 0) return "يستحق اليوم";
  if (days === 1) return "متبقي يوم";
  if (days <= 7) return `متبقي ${days} أيام`;
  return formatDate(date);
}

function notificationTime(date: Date): string {
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 60) return `منذ ${minutes || 1} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return formatDate(date);
}

type RemoteRow = Record<string, unknown>;

function dashboardErrorMetadata(error: unknown): Record<string, unknown> {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = error instanceof Error ? error.message : "";
  const statusMatch = message.match(/\((\d{3})\)/);
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    status: typeof record.status === "number" || typeof record.status === "string"
      ? record.status
      : typeof record.statusCode === "number" || typeof record.statusCode === "string"
        ? record.statusCode
        : statusMatch ? Number(statusMatch[1]) : undefined,
    errorCode: typeof record.code === "string" ? record.code : undefined,
  };
}

async function dashboardOperation<T>(
  req: Request,
  operation: string,
  callback: () => Promise<T>,
): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    req.log.error({ operation, ...dashboardErrorMetadata(error) }, "Student dashboard upstream failed");
    throw error;
  }
}

function remoteNestedRow(row: RemoteRow, key: string): RemoteRow | undefined {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as RemoteRow : undefined;
}

function remoteString(row: RemoteRow, ...keys: string[]): string | null {
  for (const key of keys) {
    if (typeof row[key] === "string" && row[key].trim()) return row[key].trim();
  }
  return null;
}

function remoteNumber(row: RemoteRow, ...keys: string[]): number | null {
  for (const key of keys) {
    if (typeof row[key] === "number" && Number.isFinite(row[key])) return row[key] as number;
  }
  return null;
}

function remoteDate(row: RemoteRow, ...keys: string[]): Date {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" || value instanceof Date) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return new Date();
}

function remotePersonName(row: RemoteRow | undefined): string {
  const fullName = row ? remoteString(row, "full_name", "display_name", "name") : null;
  if (fullName) return fullName;
  return [row && remoteString(row, "first_name"), row && remoteString(row, "last_name")]
    .filter(Boolean)
    .join(" ") || remoteString(row ?? {}, "email") || "مستخدم";
}

async function remoteProfiles(accessToken: string, ids: string[]): Promise<Map<string, RemoteRow>> {
  if (!ids.length) return new Map();
  const rows = await supabaseTable<RemoteRow>(accessToken, "profiles", {
    user_id: `in.(${ids.join(",")})`,
    select: "*",
  });
  return new Map(rows.map((row) => [String(row.user_id), row]));
}

function requestMatchesBooking(request: RemoteRow, booking: RemoteRow) {
  const requestTeacherId = remoteString(request, "accepted_by", "acceptedBy");
  const bookingTeacherId = remoteString(booking, "teacher_id", "teacherId");
  const requestSubjectId = remoteString(request, "subject_id", "subjectId");
  const bookingSubjectId = remoteString(booking, "subject_id", "subjectId");
  const requestDuration = remoteNumber(request, "duration_minutes", "durationMinutes") ?? 0;
  const bookingDuration = remoteNumber(booking, "duration_minutes", "durationMinutes") ?? 0;
  return remoteString(request, "status") === "accepted"
    && Boolean(requestTeacherId)
    && requestTeacherId === bookingTeacherId
    && requestSubjectId === bookingSubjectId
    && remoteDate(request, "scheduled_at", "scheduledAt").getTime() === remoteDate(booking, "scheduled_at", "scheduledAt").getTime()
    && requestDuration === bookingDuration;
}

function reservedMinutesForBooking(bookings: RemoteRow[], requests: RemoteRow[]) {
  const matchedBookingIndexes = new Set<number>();
  let unmatchedRequestMinutes = 0;
  for (const request of requests) {
    const bookingIndex = bookings.findIndex((booking, index) => !matchedBookingIndexes.has(index) && requestMatchesBooking(request, booking));
    if (bookingIndex >= 0) {
      matchedBookingIndexes.add(bookingIndex);
    } else {
      unmatchedRequestMinutes += remoteNumber(request, "duration_minutes", "durationMinutes") ?? 0;
    }
  }
  return bookings.reduce((sum, booking) => sum + (remoteNumber(booking, "duration_minutes", "durationMinutes") ?? 0), 0)
    + unmatchedRequestMinutes;
}

function bookingTimesOverlap(
  leftStartsAt: Date,
  leftDurationMinutes: number,
  rightStartsAt: Date,
  rightDurationMinutes: number,
) {
  const leftStart = leftStartsAt.getTime();
  const rightStart = rightStartsAt.getTime();
  const leftEnd = leftStart + leftDurationMinutes * 60_000;
  const rightEnd = rightStart + rightDurationMinutes * 60_000;
  return leftStart < rightEnd && rightStart < leftEnd;
}

function hasBookingTimeConflict(
  rows: RemoteRow[],
  startsAt: Date,
  durationMinutes: number,
) {
  return rows.some((row) => bookingTimesOverlap(
    startsAt,
    durationMinutes,
    remoteDate(row, "scheduled_at", "scheduledAt"),
    remoteNumber(row, "duration_minutes", "durationMinutes") ?? 0,
  ));
}

function hasInternalSlotConflict(slots: Array<{ startsAt: Date; durationMinutes: number }>) {
  return slots.some((slot, index) => slots.some((other, otherIndex) => (
    index !== otherIndex
      && bookingTimesOverlap(slot.startsAt, slot.durationMinutes, other.startsAt, other.durationMinutes)
  )));
}

async function getBookingSubscription(
  accessToken: string,
  userId: string,
  requestedMinutes: number,
  excludedGroupId?: string,
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const [subscriptions, bookings, requests] = await Promise.all([
    supabaseTable<RemoteRow>(accessToken, "user_subscriptions", {
      user_id: `eq.${userId}`,
      is_active: "eq.true",
      remaining_minutes: "gt.0",
      or: `(ends_at.is.null,ends_at.gte.${nowIso})`,
      select: "*",
      order: "ends_at.asc",
    }),
    supabaseTable<RemoteRow>(accessToken, "bookings", {
      student_id: `eq.${userId}`,
      status: "in.(pending,confirmed)",
      scheduled_at: `gte.${nowIso}`,
      select: "teacher_id,subject_id,scheduled_at,duration_minutes,status",
    }),
    supabaseTable<RemoteRow>(accessToken, "booking_requests", {
      student_id: `eq.${userId}`,
      status: "in.(open,accepted)",
      scheduled_at: `gte.${nowIso}`,
      or: `(expires_at.is.null,expires_at.gte.${nowIso})`,
      select: "accepted_by,subject_id,scheduled_at,duration_minutes,status,group_id",
    }),
  ]);
  const reservedRequests = excludedGroupId
    ? requests.filter((request) => remoteString(request, "group_id", "groupId") !== excludedGroupId)
    : requests;
  const reservedMinutes = reservedMinutesForBooking(bookings, reservedRequests);
  const remainingMinutes = subscriptions.reduce(
    (sum, row) => sum + (remoteNumber(row, "remaining_minutes") ?? 0),
    0,
  );
  if (remainingMinutes - reservedMinutes < requestedMinutes) {
    return {
      allowed: false as const,
      remainingMinutes: Math.max(0, remainingMinutes - reservedMinutes),
    };
  }
  const subscription = subscriptions[0];
  return subscription
    ? {
        allowed: true as const,
        subscriptionId: String(subscription.id),
        remainingMinutes: Math.max(0, remainingMinutes - reservedMinutes),
      }
    : { allowed: false as const, remainingMinutes: 0 };
}

function mapRemoteSession(row: RemoteRow, userId: string, people: Map<string, RemoteRow>, lifecycle: RemoteRow | null = null) {
  const studentId = remoteString(row, "student_id", "studentId") ?? "";
  const teacherId = remoteString(row, "teacher_id", "teacherId") ?? "";
  const startsAt = remoteDate(row, "scheduled_at", "starts_at", "start_time", "date");
  const durationMinutes = remoteNumber(row, "duration_minutes", "duration") ?? 60;
  const rawStatus = remoteString(row, "status") ?? "confirmed";
  const bookingSessionStatus = remoteString(row, "session_status", "sessionStatus");
  const sessionStartedAt = remoteString(lifecycle ?? {}, "started_at", "startedAt");
  const sessionEndedAt = remoteString(lifecycle ?? {}, "ended_at", "endedAt");
  const sessionStatus = sessionStartedAt && !sessionEndedAt
    ? "in_progress"
    : sessionEndedAt
      ? "completed"
      : bookingSessionStatus === "waiting_acceptance"
        ? "waiting_acceptance"
        : ["cancelled", "rejected", "expired", "completed"].includes(bookingSessionStatus ?? "")
          ? bookingSessionStatus
          : "not_started";
  const isExpired = startsAt.getTime() <= Date.now()
    && ["pending", "confirmed"].includes(rawStatus)
    && sessionStatus !== "in_progress"
    && sessionStatus !== "waiting_acceptance";
  return {
    id: String(row.id),
    title: remoteString(row, "notes", "title", "topic") ?? "جلسة تعليمية",
    subject: remoteString(remoteNestedRow(row, "subjects") ?? {}, "name") ?? "جلسة تعليمية",
    person: studentId === userId ? `أ. ${remotePersonName(people.get(teacherId))}` : `مع ${remotePersonName(people.get(studentId))}`,
    date: formatDate(startsAt),
    time: formatTime(startsAt),
    scheduledAt: startsAt.toISOString(),
    duration: formatDuration(durationMinutes),
    tone: (["teal", "gold", "navy"].includes(remoteString(row, "tone") ?? "")
      ? remoteString(row, "tone")
      : "teal") as Tone,
    status: rawStatus === "cancelled"
      ? "cancelled"
      : rawStatus === "completed" || sessionStatus === "completed"
        ? "done"
        : isExpired
          ? "expired"
          : "upcoming",
    sessionStatus: sessionStatus && ["not_started", "waiting_acceptance", "in_progress", "completed", "cancelled", "rejected", "expired"].includes(sessionStatus)
      ? sessionStatus as "not_started" | "waiting_acceptance" | "in_progress" | "completed" | "cancelled" | "rejected" | "expired"
      : null,
  };
}

function mapRemoteBookingRequest(row: RemoteRow, studentName: string | null) {
  const rawStatus = remoteString(row, "status") ?? "open";
  const expiresAt = remoteDate(row, "expires_at", "expiresAt");
  const status = rawStatus === "open" && expiresAt.getTime() <= Date.now() ? "expired" : rawStatus;
  return {
    id: String(row.id),
    studentId: remoteString(row, "student_id", "studentId") ?? "",
    studentName,
    teacherId: remoteString(row, "accepted_by", "acceptedBy"),
    subject: remoteString(remoteNestedRow(row, "subjects") ?? {}, "name") ?? remoteString(row, "subject") ?? "جلسة تعليمية",
    scheduledAt: remoteDate(row, "scheduled_at", "scheduledAt"),
    durationMinutes: remoteNumber(row, "duration_minutes", "durationMinutes") ?? 60,
    price: remoteNumber(row, "price"),
    status: (["open", "accepted", "rejected", "cancelled", "expired"].includes(status) ? status : "open") as "open" | "accepted" | "rejected" | "cancelled" | "expired",
    acceptedBy: remoteString(row, "accepted_by", "acceptedBy"),
    expiresAt,
    groupId: remoteString(row, "group_id", "groupId"),
  };
}

async function hasActiveTeacherSession(accessToken: string, teacherId: string): Promise<boolean> {
  const since = new Date(Date.now() - 4 * 60 * 60_000).toISOString();
  const rows = await supabaseTable<RemoteRow>(accessToken, "bookings", {
    teacher_id: `eq.${teacherId}`,
    session_status: "eq.in_progress",
    scheduled_at: `gte.${since}`,
    select: "id",
    limit: "1",
  });
  return rows.length > 0;
}

async function hasTeacherBookingConflict(
  accessToken: string,
  teacherId: string,
  start: number,
  end: number,
): Promise<boolean> {
  const rows = await supabaseTable<RemoteRow>(accessToken, "bookings", {
    teacher_id: `eq.${teacherId}`,
    status: "in.(pending,confirmed)",
    // PostgREST's `and` keeps both bounds on the same column.
    and: `(scheduled_at.gte.${new Date(start - 24 * 60 * 60_000).toISOString()},scheduled_at.lte.${new Date(end + 24 * 60 * 60_000).toISOString()})`,
    select: "scheduled_at,duration_minutes",
  });
  return rows.some((booking) => {
    const bookingStart = remoteDate(booking, "scheduled_at", "scheduledAt").getTime();
    const bookingEnd = bookingStart + (remoteNumber(booking, "duration_minutes", "durationMinutes") ?? 45) * 60_000;
    return start < bookingEnd && end > bookingStart;
  });
}

async function filterRequestsForTeacher(
  accessToken: string,
  teacherId: string,
  requests: RemoteRow[],
): Promise<RemoteRow[]> {
  if (!requests.length) return [];
  const profiles = await supabaseTable<RemoteRow>(accessToken, "public_teacher_profiles", {
    user_id: `eq.${teacherId}`,
    is_approved: "eq.true",
    select: "id,teaching_stages",
    limit: "1",
  });
  const profile = profiles[0];
  if (!profile?.id) return [];
  const teacherSubjects = await supabaseTable<RemoteRow>(accessToken, "teacher_subjects", {
    teacher_id: `eq.${String(profile.id)}`,
    select: "subject_id",
  });
  const subjectIds = new Set(
    teacherSubjects
      .map((row) => remoteString(row, "subject_id", "subjectId"))
      .filter((id): id is string => Boolean(id)),
  );
  const stages = normalizeStageList(profile.teaching_stages);
  return requests.filter((request) => {
    const subjectId = remoteString(request, "subject_id", "subjectId");
    const requestedStage = normalizeStage(remoteString(request, "teaching_stage", "teachingStage"));
    if (!subjectId || !subjectIds.has(subjectId)) return false;
    return !requestedStage || stages.length === 0 || stages.includes(requestedStage);
  });
}

async function listRemoteBookingRequests(accessToken: string, userId: string, view: "incoming" | "mine") {
  if (view === "incoming" && !(await hasSupabaseRole(accessToken, userId, "teacher"))) {
    throw Object.assign(new Error("Only teachers can list incoming booking requests"), { statusCode: 403 });
  }
  if (view === "mine" && !(await hasSupabaseRole(accessToken, userId, "student"))) {
    throw Object.assign(new Error("Only students can list their booking requests"), { statusCode: 403 });
  }
  const query: Record<string, string> = {
    status: view === "incoming" ? "in.(open,accepted)" : "not.is.null",
    select: "*,subjects(id,name)",
    order: "scheduled_at.asc",
    limit: "100",
  };
  if (view === "incoming") {
    const nowIso = new Date().toISOString();
    // Supabase RLS is the authoritative teacher-visibility rule. Keep the
    // endpoint fast and do not apply a second subject/stage filter that can
    // hide a valid request when legacy stage formats differ.
    query.and = `(or(accepted_by.eq.${userId},accepted_by.is.null),or(expires_at.is.null,expires_at.gte.${nowIso}),scheduled_at.gte.${nowIso})`;
  } else {
    query.student_id = `eq.${userId}`;
  }
  const loadedRows = await supabaseTable<RemoteRow>(accessToken, "booking_requests", query);
  const rows = loadedRows;
  const studentIds = [...new Set(rows.map((row) => remoteString(row, "student_id", "studentId")).filter((id): id is string => Boolean(id)))];
  const people = await remoteProfiles(accessToken, studentIds);
  return rows.map((row) => mapRemoteBookingRequest(row, remotePersonName(people.get(remoteString(row, "student_id", "studentId") ?? "")) || null));
}

router.get("/booking-requests", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(403).json({ error: "Booking requests require a Supabase session" });
    return;
  }
  const parsed = ListBookingRequestsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const data = await listRemoteBookingRequests(supabaseToken, userId, parsed.data.view);
    res.json(ListBookingRequestsResponse.parse(data));
  } catch (error) {
    const statusCode = error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 502;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : "Unable to load booking requests" });
  }
});

router.patch("/booking-requests/:id/cancel", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const params = CancelBookingRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid booking request id" });
    return;
  }
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken || !(await hasSupabaseRole(supabaseToken, userId, "student"))) {
    res.status(403).json({ error: "Only students can cancel booking requests" });
    return;
  }
  const current = await supabaseTable<RemoteRow>(supabaseToken, "booking_requests", {
    id: `eq.${params.data.id}`,
    student_id: `eq.${userId}`,
    status: "eq.open",
    or: `(expires_at.is.null,expires_at.gte.${new Date().toISOString()})`,
    select: "*,subjects(name)",
    limit: "1",
  });
  if (!current[0]) {
    res.status(404).json({ error: "طلب الحجز غير موجود أو تمت معالجته بالفعل." });
    return;
  }
  const groupId = remoteString(current[0], "group_id", "groupId");
  const query: Record<string, string> = {
    student_id: `eq.${userId}`,
    status: "eq.open",
    or: `(expires_at.is.null,expires_at.gte.${new Date().toISOString()})`,
  };
  if (groupId) query.group_id = `eq.${groupId}`;
  else query.id = `eq.${params.data.id}`;
  const updated = await supabaseTable<RemoteRow>(supabaseToken, "booking_requests", query, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (!updated.length) {
    res.status(409).json({ error: "تعذر إلغاء طلب الحجز. ربما تمت معالجته من قبل." });
    return;
  }
  const refreshed = await supabaseTable<RemoteRow>(supabaseToken, "booking_requests", {
    id: `eq.${params.data.id}`,
    student_id: `eq.${userId}`,
    select: "*,subjects(name)",
    limit: "1",
  });
  const data = refreshed[0] ?? { ...current[0], status: "cancelled" };
  res.json(CancelBookingRequestResponse.parse(mapRemoteBookingRequest(data, null)));
});

router.delete("/booking-requests/:id", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const params = CancelBookingRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid booking request id" });
    return;
  }
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(403).json({ error: "Booking request deletion requires a Supabase session" });
    return;
  }

  const current = await supabaseTable<RemoteRow>(supabaseToken, "booking_requests", {
    id: `eq.${params.data.id}`,
    select: "id,student_id,accepted_by,status,group_id,expires_at",
    limit: "1",
  });
  const request = current[0];
  if (!request) {
    res.status(404).json({ error: "طلب الحجز غير موجود." });
    return;
  }

  const rawStatus = remoteString(request, "status") ?? "open";
  const expiryValue = request.expires_at ?? request.expiresAt;
  const expiresAt = typeof expiryValue === "string" ? new Date(expiryValue) : null;
  const status = rawStatus === "open" && expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now() ? "expired" : rawStatus;
  if (status === "open") {
    res.status(409).json({ error: "لا يمكن حذف طلب الحجز قبل معالجته." });
    return;
  }

  const [isStudent, isTeacher] = await Promise.all([
    hasSupabaseRole(supabaseToken, userId, "student"),
    hasSupabaseRole(supabaseToken, userId, "teacher"),
  ]);
  const ownsAsStudent = isStudent && remoteString(request, "student_id", "studentId") === userId;
  const ownsAsTeacher = isTeacher
    && status === "accepted"
    && remoteString(request, "accepted_by", "acceptedBy") === userId;
  if (!ownsAsStudent && !ownsAsTeacher) {
    res.status(403).json({ error: "لا تملك صلاحية حذف طلب الحجز هذا." });
    return;
  }

  const nowIso = new Date().toISOString();
  // Keep the PostgREST delete predicate aligned with the row's actual state.
  // A compound OR here can return an empty representation under RLS for an
  // expired open row, which makes a valid delete look like a 404 to the app.
  const query: Record<string, string> = ownsAsTeacher
    ? { status: "eq.accepted" }
    : rawStatus === "open"
      ? { status: "eq.open", expires_at: `lt.${nowIso}` }
      : { status: "not.eq.open" };
  if (ownsAsStudent) query.student_id = `eq.${userId}`;
  if (ownsAsTeacher) query.accepted_by = `eq.${userId}`;
  const groupId = remoteString(request, "group_id", "groupId");
  if (groupId) query.group_id = `eq.${groupId}`;
  else query.id = `eq.${params.data.id}`;

  const deleted = await supabaseTable<RemoteRow>(supabaseToken, "booking_requests", query, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });

  // PostgREST can return an empty representation both when no row matched and
  // when the delete succeeded with a response body suppressed by the proxy.
  // Re-read the same ownership scope so a successful delete is not reported
  // as a 404, while an RLS-blocked delete remains an explicit conflict.
  const remainingQuery: Record<string, string> = {
    select: "id",
    limit: "1",
  };
  if (ownsAsStudent) remainingQuery.student_id = `eq.${userId}`;
  if (ownsAsTeacher) remainingQuery.accepted_by = `eq.${userId}`;
  if (groupId) remainingQuery.group_id = `eq.${groupId}`;
  else remainingQuery.id = `eq.${params.data.id}`;
  const remaining = await supabaseTable<RemoteRow>(supabaseToken, "booking_requests", remainingQuery);
  if (remaining.length > 0) {
    req.log.warn(
      {
        operation: "delete_booking_request",
        status,
        ownsAsStudent,
        ownsAsTeacher,
        grouped: Boolean(groupId),
      },
      "Booking request delete was not applied by Supabase",
    );
    res.status(409).json({ error: "لم تسمح المنصة بحذف طلب الحجز. تحقق من صلاحيات الحذف ثم حاول مرة أخرى." });
    return;
  }
  res.status(204).send();
});

router.post("/booking-requests", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const parsed = CreateBookingRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(403).json({ error: "Booking requests require a Supabase session" });
    return;
  }
  if (!(await hasSupabaseRole(supabaseToken, userId, "student"))) {
    res.status(403).json({ error: "Only students can create booking requests" });
    return;
  }
  const profile = await getSupabaseProfile(supabaseToken, userId);
  if (!profile || !remoteString(profile, "full_name", "display_name") || !remoteString(profile, "phone") || !remoteString(profile, "teaching_stage")) {
    res.status(400).json({ error: "أكمل بيانات الملف الشخصي قبل إنشاء طلب الحجز." });
    return;
  }
  const input = parsed.data;
  const teachingStage = normalizeStage(input.teachingStage ?? remoteString(profile, "teaching_stage"));
  if (!Number.isInteger(input.durationMinutes)) {
    res.status(400).json({ error: "يجب أن تكون مدة الجلسة بعدد دقائق صحيح." });
    return;
  }
  if (input.startsAt.getTime() <= Date.now()) {
    res.status(400).json({ error: "اختر موعداً مستقبلياً. لا يمكن إنشاء طلب حجز في وقت مضى." });
    return;
  }
  const allowance = await getBookingSubscription(supabaseToken, userId, input.durationMinutes);
  if (!allowance.allowed) {
    res.status(403).json({
      error: allowance.remainingMinutes > 0
        ? `لا يمكن حجز الجلسة. رصيدك المتاح ${allowance.remainingMinutes} دقيقة فقط.`
        : "لا يوجد اشتراك فعال أو جلسات متبقية لهذا الحساب.",
    });
    return;
  }
  const subjectLookup = await supabaseTable<RemoteRow>(supabaseToken, "subjects", {
    select: "id,name",
    name: `eq.${input.subject}`,
    limit: "1",
  });
  if (!subjectLookup[0]) {
    res.status(400).json({ error: "المادة المختارة غير موجودة في المنصة. اختر مادة من قائمة المعلم ثم حاول مرة أخرى." });
    return;
  }
  const subjectId = String(subjectLookup[0].id);
  const selectedTeacherId = input.teacherId?.trim() || null;
  let notificationTeacherIds: string[] = [];
  if (selectedTeacherId) {
    const teacherProfiles = await supabaseTable<RemoteRow>(supabaseToken, "public_teacher_profiles", {
      user_id: `eq.${selectedTeacherId}`,
      is_approved: "eq.true",
        select: "id,user_id,teaching_stages",
      limit: "1",
    });
    const teacherProfile = teacherProfiles[0];
    if (!teacherProfile?.id) {
      res.status(400).json({ error: "المعلم المختار غير متاح حالياً لاستقبال الحجوزات." });
      return;
    }
    const teacherSubjects = await supabaseTable<RemoteRow>(supabaseToken, "teacher_subjects", {
      teacher_id: `eq.${String(teacherProfile.id)}`,
      subject_id: `eq.${subjectId}`,
      select: "teacher_id",
      limit: "1",
    });
    if (!teacherSubjects[0]) {
      res.status(400).json({ error: "المادة المختارة غير مرتبطة بهذا المعلم. اختر مادة من المواد الظاهرة في بطاقة المعلم." });
      return;
    }
    const teacherStages = normalizeStageList(teacherProfile.teaching_stages);
    if (teachingStage && !teacherStages.includes(teachingStage)) {
      res.status(400).json({ error: "المعلم المختار لا يدرّس المرحلة الدراسية المحددة." });
      return;
    }
    notificationTeacherIds = [selectedTeacherId];
  } else {
    const eligibleTeacherRows = await supabaseTable<RemoteRow>(supabaseToken, "teacher_subjects", {
      subject_id: `eq.${subjectId}`,
      select: "teacher_profiles!inner(user_id,is_approved,teaching_stages)",
    });
    notificationTeacherIds = [...new Set(eligibleTeacherRows.flatMap((row) => {
      const teacherProfile = remoteNestedRow(row, "teacher_profiles");
      const teacherStages = normalizeStageList(teacherProfile?.teaching_stages);
      return teacherProfile?.is_approved === true
        && (!teachingStage || teacherStages.includes(teachingStage))
        && typeof teacherProfile.user_id === "string"
        ? [teacherProfile.user_id]
        : [];
    }))];
  }
  const scheduledAt = input.startsAt.toISOString();
  const activeRequests = await supabaseTable<RemoteRow>(supabaseToken, "booking_requests", {
    student_id: `eq.${userId}`,
    status: "in.(open,accepted)",
    or: `(expires_at.is.null,expires_at.gte.${new Date().toISOString()})`,
    scheduled_at: `gte.${new Date().toISOString()}`,
    select: "scheduled_at,duration_minutes",
  });
  if (hasBookingTimeConflict(activeRequests, input.startsAt, input.durationMinutes)) {
    res.status(409).json({ error: "لديك طلب حجز أو حصة أخرى تتداخل مع هذا الموعد." });
    return;
  }
  const activeBookings = await supabaseTable<RemoteRow>(supabaseToken, "bookings", {
    student_id: `eq.${userId}`,
    status: "in.(pending,confirmed)",
    scheduled_at: `gte.${new Date().toISOString()}`,
    select: "scheduled_at,duration_minutes",
  });
  if (hasBookingTimeConflict(activeBookings, input.startsAt, input.durationMinutes)) {
    res.status(409).json({ error: "لديك حصة أخرى تتداخل مع هذا الموعد." });
    return;
  }
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const created = await supabaseTable<RemoteRow>(supabaseToken, "booking_requests", {}, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      student_id: userId,
      subject_id: subjectId,
      teaching_stage: teachingStage || null,
      scheduled_at: scheduledAt,
      duration_minutes: input.durationMinutes,
      status: "open",
      accepted_by: null,
      expires_at: expiresAt,
      group_id: crypto.randomUUID(),
    }),
  });
  if (!created[0]) {
    res.status(502).json({ error: "Booking request was not returned by the platform" });
    return;
  }
  try {
    const notificationTitle = "طلب حجز جلسة جديد";
    const notificationBody = `يرغب طالب في حجز جلسة ${remoteString(profile, "full_name", "display_name") ?? ""} لمادة ${input.subject}.`;
    if (notificationTeacherIds.length) {
      await supabaseTable<RemoteRow>(supabaseToken, "notifications", {}, {
        method: "POST",
        body: JSON.stringify(notificationTeacherIds.map((teacherId) => ({
          user_id: teacherId,
          title: notificationTitle,
          body: notificationBody,
          type: "booking_request",
        }))),
      });
      await Promise.all(notificationTeacherIds.map((teacherId) => sendUserPushNotification(teacherId, {
        title: notificationTitle,
        body: notificationBody,
        data: { type: "booking_request", route: "/bookings" },
      })));
    }
  } catch {
    // A notification failure must not undo an already-created booking request.
  }
  const data = mapRemoteBookingRequest(created[0], remoteString(profile, "full_name", "display_name"));
  res.status(201).json(CreateBookingRequestResponse.parse(data));
});

router.post("/booking-requests/group", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const parsed = CreateBookingRequestGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(403).json({ error: "Booking requests require a Supabase session" });
    return;
  }
  if (!(await hasSupabaseRole(supabaseToken, userId, "student"))) {
    res.status(403).json({ error: "Only students can create booking requests" });
    return;
  }
  const profile = await getSupabaseProfile(supabaseToken, userId);
  if (!profile || !remoteString(profile, "full_name", "display_name") || !remoteString(profile, "phone") || !remoteString(profile, "teaching_stage")) {
    res.status(400).json({ error: "أكمل بيانات الملف الشخصي قبل إنشاء طلب الحجز." });
    return;
  }
  const input = parsed.data;
  const teachingStage = normalizeStage(input.teachingStage ?? remoteString(profile, "teaching_stage"));
  const totalDurationMinutes = input.slots.reduce((sum, slot) => sum + slot.durationMinutes, 0);
  if (input.slots.some((slot) => !Number.isInteger(slot.durationMinutes))) {
    res.status(400).json({ error: "يجب أن تكون مدة كل حصة بعدد دقائق صحيح." });
    return;
  }
  if (input.slots.some((slot) => slot.startsAt.getTime() <= Date.now())) {
    res.status(400).json({ error: "اختر مواعيد مستقبلية فقط. لا يمكن إنشاء طلب حجز في وقت مضى." });
    return;
  }
  if (hasInternalSlotConflict(input.slots)) {
    res.status(400).json({ error: "لا يمكن اختيار مواعيد متداخلة داخل نفس المجموعة." });
    return;
  }
  const allowance = await getBookingSubscription(supabaseToken, userId, totalDurationMinutes);
  if (!allowance.allowed) {
    res.status(403).json({
      error: allowance.remainingMinutes > 0
        ? `لا يمكن حجز المجموعة. رصيدك المتاح ${allowance.remainingMinutes} دقيقة فقط.`
        : "لا يوجد اشتراك فعال أو جلسات متبقية لهذا الحساب.",
    });
    return;
  }
  const subjectLookup = await supabaseTable<RemoteRow>(supabaseToken, "subjects", {
    select: "id,name",
    name: `eq.${input.subject}`,
    limit: "1",
  });
  if (!subjectLookup[0]) {
    res.status(400).json({ error: "المادة المختارة غير موجودة في المنصة. اختر مادة من قائمة المعلم ثم حاول مرة أخرى." });
    return;
  }
  const subjectId = String(subjectLookup[0].id);
  const selectedTeacherId = input.teacherId?.trim() || null;
  let notificationTeacherIds: string[] = [];
  if (selectedTeacherId) {
    const teacherProfiles = await supabaseTable<RemoteRow>(supabaseToken, "public_teacher_profiles", {
      user_id: `eq.${selectedTeacherId}`,
      is_approved: "eq.true",
        select: "id,user_id,teaching_stages",
      limit: "1",
    });
    const teacherProfile = teacherProfiles[0];
    if (!teacherProfile?.id) {
      res.status(400).json({ error: "المعلم المختار غير متاح حالياً لاستقبال الحجوزات." });
      return;
    }
    const teacherSubjects = await supabaseTable<RemoteRow>(supabaseToken, "teacher_subjects", {
      teacher_id: `eq.${String(teacherProfile.id)}`,
      subject_id: `eq.${subjectId}`,
      select: "teacher_id",
      limit: "1",
    });
    if (!teacherSubjects[0]) {
      res.status(400).json({ error: "المادة المختارة غير مرتبطة بهذا المعلم. اختر مادة من المواد الظاهرة في بطاقة المعلم." });
      return;
    }
    const teacherStages = normalizeStageList(teacherProfile.teaching_stages);
    if (teachingStage && !teacherStages.includes(teachingStage)) {
      res.status(400).json({ error: "المعلم المختار لا يدرّس المرحلة الدراسية المحددة." });
      return;
    }
    notificationTeacherIds = [selectedTeacherId];
  } else {
    const eligibleTeacherRows = await supabaseTable<RemoteRow>(supabaseToken, "teacher_subjects", {
      subject_id: `eq.${subjectId}`,
      select: "teacher_profiles!inner(user_id,is_approved,teaching_stages)",
    });
    notificationTeacherIds = [...new Set(eligibleTeacherRows.flatMap((row) => {
      const teacherProfile = remoteNestedRow(row, "teacher_profiles");
      const teacherStages = normalizeStageList(teacherProfile?.teaching_stages);
      return teacherProfile?.is_approved === true
        && (!teachingStage || teacherStages.includes(teachingStage))
        && typeof teacherProfile.user_id === "string"
        ? [teacherProfile.user_id]
        : [];
    }))];
  }
  const [activeRequests, activeBookings] = await Promise.all([
    supabaseTable<RemoteRow>(supabaseToken, "booking_requests", {
      student_id: `eq.${userId}`,
      status: "in.(open,accepted)",
      or: `(expires_at.is.null,expires_at.gte.${new Date().toISOString()})`,
      scheduled_at: `gte.${new Date().toISOString()}`,
      select: "scheduled_at,duration_minutes",
    }),
    supabaseTable<RemoteRow>(supabaseToken, "bookings", {
      student_id: `eq.${userId}`,
      status: "in.(pending,confirmed)",
      scheduled_at: `gte.${new Date().toISOString()}`,
      select: "scheduled_at,duration_minutes",
    }),
  ]);
  for (const slot of input.slots) {
    if (hasBookingTimeConflict(activeRequests, slot.startsAt, slot.durationMinutes)) {
      res.status(409).json({ error: "لديك طلب حجز آخر يتداخل مع أحد مواعيد المجموعة." });
      return;
    }
    if (hasBookingTimeConflict(activeBookings, slot.startsAt, slot.durationMinutes)) {
      res.status(409).json({ error: "لديك حصة أخرى تتداخل مع أحد مواعيد المجموعة." });
      return;
    }
  }
  const groupId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const created = await supabaseTable<RemoteRow>(supabaseToken, "booking_requests", {}, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(input.slots.map((slot) => ({
      student_id: userId,
      subject_id: subjectId,
       teaching_stage: teachingStage || null,
      scheduled_at: slot.startsAt.toISOString(),
      duration_minutes: slot.durationMinutes,
      status: "open",
      accepted_by: null,
      expires_at: expiresAt,
      group_id: groupId,
    }))),
  });
  if (created.length !== input.slots.length) {
    res.status(502).json({ error: "لم تُرجع المنصة جميع صفوف مجموعة الحجز بعد الإنشاء." });
    return;
  }
  try {
    const notificationTitle = `طلب حجز ${input.slots.length} حصص`;
    const slotsText = input.slots.map((slot) => `${formatDate(slot.startsAt)} ${formatTime(slot.startsAt)}`).join(" • ");
    const notificationBody = `يرغب طالب في حجز ${input.slots.length} حصص لمادة ${input.subject}: ${slotsText}.`;
    if (notificationTeacherIds.length) {
      await supabaseTable<RemoteRow>(supabaseToken, "notifications", {}, {
        method: "POST",
        body: JSON.stringify(notificationTeacherIds.map((teacherId) => ({
          user_id: teacherId,
          title: notificationTitle,
          body: notificationBody,
          type: "booking_request",
        }))),
      });
      await Promise.all(notificationTeacherIds.map((teacherId) => sendUserPushNotification(teacherId, {
        title: notificationTitle,
        body: notificationBody,
        data: { type: "booking_request", route: "/bookings" },
      })));
    }
  } catch {
    // A notification failure must not undo an already-created booking group.
  }
  const data = created.map((row) => mapRemoteBookingRequest(row, remoteString(profile, "full_name", "display_name")));
  res.status(201).json(CreateBookingRequestGroupResponse.parse(data));
});

router.patch("/booking-requests/:id/decision", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const params = DecideBookingRequestParams.safeParse(req.params);
  const parsed = DecideBookingRequestBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid booking request decision" });
    return;
  }
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken || !(await hasSupabaseRole(supabaseToken, userId, "teacher"))) {
    res.status(403).json({ error: "Only teachers can decide booking requests" });
    return;
  }
  const current = await supabaseTable<RemoteRow>(supabaseToken, "booking_requests", {
    id: `eq.${params.data.id}`,
    status: "eq.open",
    or: `(accepted_by.eq.${userId},accepted_by.is.null)`,
    // The singular acceptance path reuses this row to create the booking.
    // Include the subject id, not only its display name, or the insert can
    // leave the request accepted without a corresponding booking.
    select: "*,subjects(id,name)",
    limit: "1",
  });
  if (!current[0]) {
    res.status(404).json({ error: "Booking request not found or already decided" });
    return;
  }
  const request = current[0];
  const requestGroupId = remoteString(request, "group_id", "groupId");
  if (parsed.data.groupId && parsed.data.groupId !== requestGroupId) {
    res.status(400).json({ error: "Booking request group does not match the decision" });
    return;
  }
  const groupId = parsed.data.groupId ?? requestGroupId;
  const groupRows = groupId
    ? await supabaseTable<RemoteRow>(supabaseToken, "booking_requests", {
        group_id: `eq.${groupId}`,
        status: "eq.open",
        or: `(accepted_by.eq.${userId},accepted_by.is.null)`,
        select: "*,subjects(id,name)",
        order: "scheduled_at.asc",
      })
    : [];
  const decisionRequests = groupRows.length ? groupRows : [request];
  const earliestExpiresAt = decisionRequests.reduce(
    (earliest, item) => Math.min(earliest, remoteDate(item, "expires_at", "expiresAt").getTime()),
    Number.POSITIVE_INFINITY,
  );
  if (earliestExpiresAt <= Date.now()) {
    res.status(400).json({ error: "انتهت صلاحية طلب الحجز." });
    return;
  }
  const studentId = remoteString(request, "student_id", "studentId") ?? "";
  if (!studentId) {
    res.status(400).json({ error: "Booking request has no student" });
    return;
  }
  if (parsed.data.status === "accepted") {
    if (await hasActiveTeacherSession(supabaseToken, userId)) {
      res.status(409).json({ error: "أنت حالياً في جلسة نشطة. انتهِ منها قبل قبول طلبات جديدة." });
      return;
    }
    for (const item of decisionRequests) {
      const start = remoteDate(item, "scheduled_at", "scheduledAt").getTime();
      const end = start + (remoteNumber(item, "duration_minutes", "durationMinutes") ?? 60) * 60_000;
      if (await hasTeacherBookingConflict(supabaseToken, userId, start, end)) {
        res.status(409).json({ error: "لديك جلسة أخرى متعارضة مع هذا الموعد." });
        return;
      }
    }

    const groupDurationMinutes = decisionRequests.reduce(
      (sum, item) => sum + (remoteNumber(item, "duration_minutes", "durationMinutes") ?? 0),
      0,
    );
    const allowance = await getBookingSubscription(
      supabaseToken,
      studentId,
      groupDurationMinutes,
      groupId ?? undefined,
    );
    if (!allowance.allowed) {
      res.status(409).json({
        error: allowance.remainingMinutes > 0
          ? `لا يمكن قبول الطلب. رصيد الطالب المتاح ${allowance.remainingMinutes} دقيقة فقط.`
          : "لا يوجد رصيد اشتراك كافٍ لقبول طلب الحجز.",
      });
      return;
    }

    let acceptedRequests: RemoteRow[] = [];
    if (groupId) {
      const accepted = await supabaseRpc<unknown>(supabaseToken, "accept_booking_group", {
        _group_id: groupId,
        _teacher_id: userId,
      });
      if (Array.isArray(accepted)) {
        acceptedRequests = accepted.filter((item): item is RemoteRow => Boolean(item) && typeof item === "object");
      }
      const acceptedRows = await supabaseTable<RemoteRow>(supabaseToken, "booking_requests", {
        group_id: `eq.${groupId}`,
        status: "eq.accepted",
        accepted_by: `eq.${userId}`,
        select: "*,subjects(id,name)",
        order: "scheduled_at.asc",
      });
      if (acceptedRows.length) acceptedRequests = acceptedRows;
    } else {
      const accepted = await supabaseRpc<unknown>(supabaseToken, "accept_booking_request", {
        _request_id: params.data.id,
        _teacher_id: userId,
      });
      if (accepted === null || accepted === false || (Array.isArray(accepted) && accepted.length === 0)) {
        res.status(409).json({ error: "تم قبول هذا الطلب من معلم آخر بالفعل." });
        return;
      }
      acceptedRequests = [request];
    }
    if (!acceptedRequests.length) {
      res.status(409).json({ error: "تم قبول هذا الطلب من معلم آخر بالفعل." });
      return;
    }

    const subscriptionId = allowance.subscriptionId ?? null;
    const existingBookings = await supabaseTable<RemoteRow>(supabaseToken, "bookings", {
      student_id: `eq.${studentId}`,
      teacher_id: `eq.${userId}`,
      status: "in.(pending,confirmed)",
      select: "id,subject_id,scheduled_at,duration_minutes,subscription_id",
    });
    const bookingMatchesRequest = (booking: RemoteRow, item: RemoteRow) =>
      remoteString(booking, "subject_id", "subjectId") ===
        (remoteString(remoteNestedRow(item, "subjects") ?? {}, "id") ?? remoteString(item, "subject_id", "subjectId"))
      && remoteDate(booking, "scheduled_at", "scheduledAt").getTime() === remoteDate(item, "scheduled_at", "scheduledAt").getTime()
      && remoteNumber(booking, "duration_minutes", "durationMinutes") === remoteNumber(item, "duration_minutes", "durationMinutes");
    const alreadyCreated = acceptedRequests.filter((item) => existingBookings.some((booking) => bookingMatchesRequest(booking, item)));
    const missingRequests = acceptedRequests.filter((item) => !alreadyCreated.includes(item));
    const createdBookings = missingRequests.length
      ? await supabaseTable<RemoteRow>(supabaseToken, "bookings", {}, {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(missingRequests.map((item) => ({
            student_id: remoteString(item, "student_id", "studentId") ?? studentId,
            teacher_id: userId,
            subject_id: remoteString(remoteNestedRow(item, "subjects") ?? {}, "id") ?? remoteString(item, "subject_id", "subjectId"),
            scheduled_at: remoteDate(item, "scheduled_at", "scheduledAt").toISOString(),
            duration_minutes: remoteNumber(item, "duration_minutes", "durationMinutes") ?? 60,
            status: "confirmed",
            // Match the platform booking metadata. Minutes are still deducted only
            // by the original session-completion trigger, never during acceptance.
            used_subscription: Boolean(subscriptionId),
            subscription_id: subscriptionId,
          }))),
        })
      : [];
    const bookings = [...alreadyCreated, ...createdBookings];
    if (bookings.length !== acceptedRequests.length) {
      res.status(502).json({ error: "لم تُنشأ كل الجلسات بعد قبول الطلب. أعد المحاولة أو راجع الدعم." });
      return;
    }
    const teacherProfile = await getSupabaseProfile(supabaseToken, userId);
    const teacherName = remoteString(teacherProfile ?? {}, "full_name", "display_name") ?? "معلمك";
    const subjectName = remoteString(remoteNestedRow(request, "subjects") ?? {}, "name") ?? "المادة";
    const count = bookings.length;
    try {
      await supabaseTable<RemoteRow>(supabaseToken, "notifications", {}, {
        method: "POST",
        body: JSON.stringify({
          user_id: studentId,
          title: count > 1 ? `✅ تم تأكيد ${count} حصص` : "✅ تم تأكيد الحجز",
          body: count > 1
            ? `أكّد المعلم ${teacherName} جميع حصصك في ${subjectName}. راجع جدولك للاطلاع على المواعيد.`
            : `أكّد المعلم ${teacherName} حجز حصة ${subjectName}. جهّز نفسك للحصة في موعدها.`,
          type: "booking_confirmed",
        }),
      });
      void sendUserPushNotification(studentId, {
        title: count > 1 ? `✅ تم تأكيد ${count} حصص` : "✅ تم تأكيد الحجز",
        body: count > 1
          ? `أكّد المعلم ${teacherName} جميع حصصك في ${subjectName}.`
          : `أكّد المعلم ${teacherName} حجز حصة ${subjectName}.`,
        data: { type: "booking_confirmed", route: "/bookings" },
      });
    } catch {
      // Notification delivery is best effort after the booking is confirmed.
    }
    try {
      await supabaseTable<RemoteRow>(supabaseToken, "chat_messages", {}, {
        method: "POST",
        body: JSON.stringify({
          booking_id: String(bookings[0].id),
          sender_id: userId,
          content: `مرحباً! أنا ${teacherName} وقبلت ${count > 1 ? `${count} حصص` : "طلب حصتك"} 🎉`,
        }),
      });
    } catch {
      // Chat bootstrap is best effort and must not change booking state.
    }
  } else {
    const rejected = await supabaseRpc<unknown>(supabaseToken, "reject_booking_request", {
      _request_ids: decisionRequests.map((item) => String(item.id)),
      _teacher_id: userId,
    });
    if (rejected === null || rejected === false || (Array.isArray(rejected) && rejected.length === 0)) {
      res.status(409).json({ error: "تمت معالجة هذا الطلب من قبل." });
      return;
    }
    const teacherProfile = await getSupabaseProfile(supabaseToken, userId);
    const teacherName = remoteString(teacherProfile ?? {}, "full_name", "display_name") ?? "المعلم";
    const subjectName = remoteString(remoteNestedRow(request, "subjects") ?? {}, "name") ?? "المادة";
    const rejectedCount = decisionRequests.length;
    try {
      await supabaseTable<RemoteRow>(supabaseToken, "notifications", {}, {
        method: "POST",
        body: JSON.stringify({
          user_id: studentId,
          title: rejectedCount > 1 ? `تم رفض ${rejectedCount} طلبات حجز` : "تم رفض طلب الحجز",
          body: rejectedCount > 1
            ? `رفض المعلم ${teacherName} طلباتك في ${subjectName}. يمكنك اختيار موعد أو معلم آخر.`
            : `رفض المعلم ${teacherName} طلب حصة ${subjectName}. يمكنك اختيار موعد أو معلم آخر.`,
          type: "booking_rejected",
        }),
      });
      void sendUserPushNotification(studentId, {
        title: rejectedCount > 1 ? `تم رفض ${rejectedCount} طلبات حجز` : "تم رفض طلب الحجز",
        body: rejectedCount > 1
          ? `رفض المعلم ${teacherName} طلباتك في ${subjectName}.`
          : `رفض المعلم ${teacherName} طلب حصة ${subjectName}.`,
        data: { type: "booking_rejected", route: "/bookings" },
      });
    } catch {
      // Rejection is authoritative even if notification delivery fails.
    }
  }
  const updated = await supabaseTable<RemoteRow>(supabaseToken, "booking_requests", {
    id: `eq.${params.data.id}`,
    select: "*,subjects(name)",
    limit: "1",
  });
  if (!updated[0]) {
    res.status(404).json({ error: "Booking request was not updated" });
    return;
  }
  const people = await remoteProfiles(supabaseToken, [studentId]);
  const data = mapRemoteBookingRequest(updated[0], remotePersonName(people.get(studentId)) || null);
  res.json(DecideBookingRequestResponse.parse(data));
});

async function listRemoteSessions(accessToken: string, userId: string, view: SessionView) {
  const now = new Date();
  const nowIso = now.toISOString();
  const query: Record<string, string> = {
    select: "*,subjects(name)",
    or: `(student_id.eq.${userId},teacher_id.eq.${userId})`,
    order: "scheduled_at.asc",
  };
  if (view === "upcoming") {
    const upperBound = new Date(now.getTime() + 90 * 24 * 60 * 60_000).toISOString();
    query.status = "in.(confirmed,pending)";
    // Keep immediate-session bookings visible after their scheduled_at is set
    // to "now". They must remain in the bookings list while waiting for the
    // other participant and while the live session is active.
    query.or = `(and(scheduled_at.gt.${nowIso},scheduled_at.lte.${upperBound}),session_status.eq.waiting_acceptance,session_status.eq.in_progress)`;
  } else {
    // Match the platform schedule: history includes completed and cancelled
    // bookings, not only records that are still confirmed.
    query.status = "in.(confirmed,pending,completed,cancelled)";
    query.and = `(scheduled_at.lt.${nowIso})`;
  }
  const rows = await supabaseTable<RemoteRow>(accessToken, "bookings", query);
  const ids = [...new Set(rows.flatMap((row) => [
    remoteString(row, "student_id", "studentId"),
    remoteString(row, "teacher_id", "teacherId"),
  ]).filter((id): id is string => Boolean(id)))];
  const people = await remoteProfiles(accessToken, ids);
  const bookingIds = rows.map((row) => String(row.id)).filter(Boolean);
  const lifecycleRows: RemoteRow[] = [];
  // Keep the PostgREST URL bounded when a teacher has a large history. A
  // single `in.(...)` filter can otherwise exceed the proxy URI limit and
  // make the entire sessions list fail with 414.
  for (let index = 0; index < bookingIds.length; index += 40) {
    const bookingBatch = bookingIds.slice(index, index + 40);
    const batchRows = await supabaseTable<RemoteRow>(accessToken, "sessions", {
      booking_id: `in.(${bookingBatch.join(",")})`,
      select: "booking_id,started_at,ended_at",
    });
    lifecycleRows.push(...batchRows);
  }
  const lifecycleByBookingId = new Map(
    lifecycleRows
      .map((row) => {
        const bookingId = remoteString(row, "booking_id", "bookingId");
        return bookingId ? [bookingId, row] as const : null;
      })
      .filter((entry): entry is readonly [string, RemoteRow] => Boolean(entry)),
  );
  return rows
    .map((row) => mapRemoteSession(row, userId, people, lifecycleByBookingId.get(String(row.id)) ?? null))
    // A stale bookings.session_status must not keep an ended session in the
    // live/upcoming list. sessions.ended_at is the authoritative end signal.
    .filter((session) => view !== "upcoming" || session.sessionStatus !== "completed")
    .sort((left, right) => {
      const leftLive = left.sessionStatus === "in_progress" ? 0 : 1;
      const rightLive = right.sessionStatus === "in_progress" ? 0 : 1;
      return leftLive - rightLive || new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime();
    });
}

function mapRemoteAssignment(row: RemoteRow) {
  const dueAt = remoteDate(row, "due_at", "due_date", "deadline");
  const rawStatus = (remoteString(row, "status") ?? "").trim().toLowerCase();
  const status = ["completed", "reviewed", "done", "finished", "مكتمل"].includes(rawStatus)
    ? "مكتمل"
    : ["active", "in_progress", "started", "قيد التقدم"].includes(rawStatus)
      ? "قيد التقدم"
      : "لم يبدأ";
  const rawKind = (remoteString(row, "content_type", "kind", "type") ?? "").trim().toLowerCase();
  const kind = ["quiz", "test", "exam", "assessment", "اختبار"].includes(rawKind)
    ? "اختبار"
    : "واجب";
  return {
    id: String(row.id),
    title: remoteString(row, "title", "name") ?? "مهمة تعليمية",
    subject: remoteString(remoteNestedRow(row, "subjects") ?? {}, "name") ?? "عام",
    due: formatDue(dueAt),
    progress: status === "مكتمل" ? 100 : Math.max(0, Math.min(100, remoteNumber(row, "progress") ?? 0)),
    kind,
    status,
  };
}

function mapRemoteNotification(row: RemoteRow) {
  const createdAt = remoteDate(row, "created_at", "createdAt");
  return {
    id: String(row.id),
    title: remoteString(row, "title") ?? "إشعار",
    body: remoteString(row, "body", "message") ?? "",
    time: notificationTime(createdAt),
    icon: remoteString(row, "icon") ?? "bell",
    unread: row.is_read !== true,
  };
}

router.get("/sessions", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const parsedQuery = ListMySessionsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const view: SessionView = parsedQuery.data.view;
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(401).json({ error: "Supabase Bearer token required for platform sessions" });
    return;
  }
  res.json(ListMySessionsResponse.parse(await listRemoteSessions(supabaseToken, userId, view)));
  return;
});

router.get("/student/dashboard", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(401).json({ error: "Supabase Bearer token required for student dashboard" });
    return;
  }
  if (!(await hasSupabaseRole(supabaseToken, userId, "student"))) {
    res.status(403).json({ error: "Only students can view the student dashboard" });
    return;
  }

  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const [profile, upcomingSessions, bookings, subscriptions, openRequests, unreadNotifications, pointsRows] = await Promise.all([
    dashboardOperation(req, "profile", () => getSupabaseProfile(supabaseToken, userId)),
    dashboardOperation(req, "upcoming_sessions", () => listRemoteSessions(supabaseToken, userId, "upcoming")),
    dashboardOperation(req, "booking_history", () => supabaseTable<RemoteRow>(supabaseToken, "bookings", {
      student_id: `eq.${userId}`,
      status: "in.(completed,cancelled)",
      select: "status",
    })),
    dashboardOperation(req, "subscriptions", () => supabaseTable<RemoteRow>(supabaseToken, "user_subscriptions", {
      user_id: `eq.${userId}`,
      is_active: "eq.true",
      remaining_minutes: "gt.0",
      or: `(ends_at.is.null,ends_at.gte.${nowIso})`,
      select: "plan_id,remaining_minutes,sessions_remaining,ends_at",
      order: "ends_at.asc",
    })),
    dashboardOperation(req, "open_booking_requests", () => supabaseTable<RemoteRow>(supabaseToken, "booking_requests", {
      student_id: `eq.${userId}`,
      status: "eq.open",
      or: `(expires_at.is.null,expires_at.gte.${nowIso})`,
      select: "id",
    })),
    dashboardOperation(req, "unread_notifications", () => supabaseTable<RemoteRow>(supabaseToken, "notifications", {
      user_id: `eq.${userId}`,
      is_read: "eq.false",
      select: "id",
    })),
    dashboardOperation(req, "student_points", () => supabaseTable<RemoteRow>(supabaseToken, "student_points", {
      user_id: `eq.${userId}`,
      select: "total_points",
      limit: "1",
    })),
    ]);
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    const planIds = [...new Set(subscriptions
    .map((row) => remoteString(row, "plan_id", "planId"))
    .filter((id): id is string => Boolean(id)))];
    const plans = planIds.length
    ? await dashboardOperation(req, "subscription_plans", () => supabaseTable<RemoteRow>(supabaseToken, "subscription_plans", {
        id: `in.(${planIds.join(",")})`,
        select: "id,name_ar,tier,session_duration_minutes",
      }))
    : [];
    const planById = new Map(plans.map((plan) => [String(plan.id), plan]));
    const subscription = subscriptions[0];
    const plan = subscription ? planById.get(remoteString(subscription, "plan_id", "planId") ?? "") : undefined;
    const fullName = typeof profile.full_name === "string" ? profile.full_name.trim() : "";
    const phone = typeof profile.phone === "string" ? profile.phone.trim() : "";
    const teachingStage = typeof profile.teaching_stage === "string" ? profile.teaching_stage.trim() : "";
    const missingProfileFields = [
      !fullName ? "fullName" : null,
      !phone ? "phone" : null,
      !teachingStage ? "teachingStage" : null,
    ].filter((field): field is "fullName" | "phone" | "teachingStage" => Boolean(field));
    const completedSessions = bookings.filter((row) => remoteString(row, "status") === "completed").length;
    const cancelledSessions = bookings.filter((row) => remoteString(row, "status") === "cancelled").length;
    const remainingMinutes = subscriptions.reduce((sum, row) => sum + (remoteNumber(row, "remaining_minutes", "remainingMinutes") ?? 0), 0);
    const sessionsRemaining = subscriptions.reduce((sum, row) => sum + (remoteNumber(row, "sessions_remaining", "sessionsRemaining") ?? 0), 0);

    res.json({
    profileComplete: missingProfileFields.length === 0,
    missingProfileFields,
    stats: {
      completedSessions,
      cancelledSessions,
      progress: Math.min(100, Math.round((completedSessions / 20) * 100)),
      points: remoteNumber(pointsRows[0], "total_points") ?? 0,
    },
    balance: subscription ? {
      remainingMinutes,
      sessionsRemaining,
      endsAt: remoteString(subscription, "ends_at", "endsAt")
        ? remoteDate(subscription, "ends_at", "endsAt").toISOString()
        : null,
      planName: remoteString(plan ?? {}, "name_ar", "name"),
      planTier: remoteString(plan ?? {}, "tier"),
      sessionDurationMinutes: remoteNumber(plan ?? {}, "session_duration_minutes", "sessionDurationMinutes"),
    } : null,
    openBookingRequests: openRequests.length,
    unreadNotifications: unreadNotifications.length,
    upcomingSessions,
    });
  } catch (error) {
    res.status(502).json({ error: "Unable to load student dashboard" });
  }
});

router.get("/teacher/dashboard", async (req, res): Promise<void> => {
  const teacherId = requireUser(req, res);
  if (!teacherId) return;
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(403).json({ error: "Teacher dashboard requires a Supabase session" });
    return;
  }
  if (!(await hasSupabaseRole(supabaseToken, teacherId, "teacher"))) {
    res.status(403).json({ error: "Only teachers can view the teacher dashboard" });
    return;
  }

  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const [teacherProfiles, openRequests, scheduledBookings, liveBookings, waitingBookings, earnings, bookingStudents, unreadNotifications, warnings] = await Promise.all([
    supabaseTable<RemoteRow>(supabaseToken, "teacher_profiles", {
      user_id: `eq.${teacherId}`,
      select: "is_approved,total_sessions,avg_rating",
      limit: "1",
    }),
    supabaseTable<RemoteRow>(supabaseToken, "booking_requests", {
      status: "eq.open",
      expires_at: `gte.${now.toISOString()}`,
      select: "id,subject_id,teaching_stage",
    }),
    supabaseTable<RemoteRow>(supabaseToken, "bookings", {
      teacher_id: `eq.${teacherId}`,
      status: "eq.confirmed",
      scheduled_at: `gt.${now.toISOString()}`,
      select: "*,subjects(name)",
      order: "scheduled_at.asc",
      limit: "10",
    }),
    supabaseTable<RemoteRow>(supabaseToken, "bookings", {
      teacher_id: `eq.${teacherId}`,
      status: "eq.confirmed",
      session_status: "eq.in_progress",
      select: "*,subjects(name)",
      order: "scheduled_at.desc",
      limit: "5",
    }),
    supabaseTable<RemoteRow>(supabaseToken, "bookings", {
      teacher_id: `eq.${teacherId}`,
      status: "eq.confirmed",
      session_status: "eq.waiting_acceptance",
      select: "*,subjects(name)",
      order: "scheduled_at.desc",
      limit: "10",
    }),
    supabaseTable<RemoteRow>(supabaseToken, "teacher_earnings", {
      teacher_id: `eq.${teacherId}`,
      month: `eq.${month}`,
      select: "amount",
    }),
    supabaseTable<RemoteRow>(supabaseToken, "bookings", {
      teacher_id: `eq.${teacherId}`,
      select: "student_id",
    }),
    supabaseTable<RemoteRow>(supabaseToken, "notifications", {
      user_id: `eq.${teacherId}`,
      is_read: "eq.false",
      select: "id",
    }),
    supabaseTable<RemoteRow>(supabaseToken, "user_warnings", {
      user_id: `eq.${teacherId}`,
      select: "id",
    }),
  ]);

  const profile = teacherProfiles[0] ?? {};
  const eligibleOpenRequests = await filterRequestsForTeacher(supabaseToken, teacherId, openRequests);
  const bookingRows = [...liveBookings, ...waitingBookings, ...scheduledBookings];
  const uniqueBookings = [...new Map(bookingRows.map((row) => [String(row.id), row])).values()];
  const studentIds = [...new Set(bookingStudents
    .map((row) => remoteString(row, "student_id", "studentId"))
    .filter((id): id is string => Boolean(id)))];
  const people = await remoteProfiles(supabaseToken, [teacherId, ...studentIds]);
  const dashboard = {
    teacherApproved: profile.is_approved === true,
    stats: {
      earnings: earnings.reduce((sum, row) => sum + (remoteNumber(row, "amount") ?? 0), 0),
      students: studentIds.length,
      sessions: Math.max(0, Math.trunc(remoteNumber(profile, "total_sessions") ?? 0)),
      rating: Math.max(0, remoteNumber(profile, "avg_rating") ?? 0),
    },
    openRequests: eligibleOpenRequests.length,
    unreadNotifications: unreadNotifications.length,
    warningCount: warnings.length,
    upcomingSessions: uniqueBookings.slice(0, 10).map((row) => mapRemoteSession(row, teacherId, people)),
  };
  res.json(GetTeacherDashboardResponse.parse(dashboard));
});

router.post("/sessions", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.status(409).json({
    error: "استخدم مسار طلب الحجز ثم قبول المعلم. لا يمكن إنشاء حجز مؤكد مباشرة.",
  });
});

router.patch("/sessions/:id/cancel", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const params = CancelSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsedBody = CancelSessionBody.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    res.status(400).json({ error: "Invalid cancellation reason" });
    return;
  }
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(401).json({ error: "Supabase Bearer token required for platform cancellations" });
    return;
  }
  if (supabaseToken) {
    const current = await supabaseTable<RemoteRow>(supabaseToken, "bookings", {
      id: `eq.${params.data.id}`,
      or: `(student_id.eq.${userId},teacher_id.eq.${userId})`,
      select: "*",
      limit: "1",
    });
    if (!current[0]) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const currentStatus = remoteString(current[0], "status") ?? "";
    if (currentStatus === "cancelled") {
      res.status(409).json({ error: "Session is already cancelled" });
      return;
    }
    if (currentStatus === "completed") {
      res.status(409).json({ error: "Completed sessions cannot be cancelled" });
      return;
    }
    const isTeacher = await hasSupabaseRole(supabaseToken, userId, "teacher");
    if (isTeacher && !parsedBody.data.reason) {
      res.status(400).json({ error: "اكتب سبب الإلغاء قبل تأكيد إلغاء جلسة المعلم." });
      return;
    }
    const cancellation = isTeacher
      ? {
          status: "cancelled",
          session_status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: userId,
          cancellation_reason: parsedBody.data.reason,
        }
      : {
          status: "cancelled",
          session_status: "cancelled",
        };
    const updated = await supabaseTable<RemoteRow>(supabaseToken, "bookings", {
      id: `eq.${params.data.id}`,
      or: `(student_id.eq.${userId},teacher_id.eq.${userId})`,
    }, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(cancellation),
    });
    if (!updated[0]) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const studentId = remoteString(updated[0], "student_id", "studentId") ?? "";
    const teacherId = remoteString(updated[0], "teacher_id", "teacherId") ?? "";
    const subjectName = remoteString(remoteNestedRow(updated[0], "subjects") ?? {}, "name") ?? "المادة";
    const scheduledAt = remoteDate(updated[0], "scheduled_at", "scheduledAt");
    const people = await remoteProfiles(supabaseToken, [studentId, teacherId].filter(Boolean));
    const teacherName = remotePersonName(people.get(teacherId));
    const recipientId = isTeacher ? studentId : teacherId;
    try {
      await supabaseTable<RemoteRow>(supabaseToken, "notifications", {}, {
        method: "POST",
        body: JSON.stringify({
          user_id: recipientId,
          title: isTeacher ? "🗑️ تم إلغاء حصتك" : "🗑️ ألغى الطالب الحصة",
          body: isTeacher
            ? `قام المعلم ${teacherName} بإلغاء حصة ${subjectName}. السبب: ${parsedBody.data.reason ?? ""}`
            : `قام الطالب بإلغاء حصة ${subjectName} المقررة في ${scheduledAt.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}.`,
          type: "booking_cancelled",
        }),
      });
      void sendUserPushNotification(recipientId, {
        title: isTeacher ? "🗑️ تم إلغاء حصتك" : "🗑️ ألغى الطالب الحصة",
        body: isTeacher
          ? `قام المعلم ${teacherName} بإلغاء حصة ${subjectName}.`
          : `قام الطالب بإلغاء حصة ${subjectName}.`,
        data: { type: "booking_cancelled", bookingId: params.data.id, route: "/bookings" },
      });
    } catch {
      // Cancellation state is authoritative even if notification delivery fails.
    }
    if (isTeacher) {
      try {
        const monthlyCount = await supabaseRpc<number>(supabaseToken, "teacher_monthly_cancellations", {
          _teacher_id: userId,
        });
        if (monthlyCount > 3) {
          const admins = await supabaseTable<RemoteRow>(supabaseToken, "user_roles", {
            role: "eq.admin",
            select: "user_id",
          });
          await Promise.all(admins.map((admin) => {
            const adminId = remoteString(admin, "user_id");
            return adminId
              ? supabaseTable<RemoteRow>(supabaseToken, "notifications", {}, {
                  method: "POST",
                  body: JSON.stringify({
                    user_id: adminId,
                    title: "تنبيه إلغاءات معلم",
                    body: `تجاوز المعلم ${teacherName} حد الإلغاءات الشهري (${monthlyCount}/3).`,
                    type: "teacher_cancellation_warning",
                  }),
                })
              : Promise.resolve([]);
          }));
        }
      } catch {
        // Warning delivery must not turn a completed cancellation into an error.
      }
    }
    res.json(CancelSessionResponse.parse(mapRemoteSession(updated[0], userId, people)));
    return;
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    const [updated] = await tx.update(bookingsTable).set({ status: "cancelled" })
      .where(and(eq(bookingsTable.id, params.data.id), or(eq(bookingsTable.studentId, userId), eq(bookingsTable.teacherId, userId)))).returning();
    if (!updated) return null;
    const recipientId = updated.studentId === userId ? updated.teacherId : updated.studentId;
    await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
    await tx.insert(notificationsTable).values({
      id: crypto.randomUUID(),
      userId: recipientId,
      title: "تم تحديث حالة الجلسة",
      body: `تم إلغاء جلسة ${updated.subject}`,
      icon: "calendar",
    });
    return { updated, session: (await mapSessions([updated], userId, tx))[0] };
  });
  if (!result) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(CancelSessionResponse.parse(result.session));
});

router.get("/assignments", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(401).json({ error: "Supabase Bearer token required for platform assignments" });
    return;
  }
  if (supabaseToken) {
    const isTeacher = await hasSupabaseRole(supabaseToken, userId, "teacher");
    const rows = await supabaseTable<RemoteRow>(supabaseToken, "assignments", {
      select: "*",
      ...(isTeacher
        ? { teacher_id: `eq.${userId}` }
        : { or: `(student_id.eq.${userId},student_id.is.null)`, status: "eq.active" }),
      order: "due_date.asc",
    });
    const assignmentIds = rows
      .map((row) => String(row.id))
      .filter(Boolean);
    const completedAssignmentIds = new Set<string>();
    if (!isTeacher && assignmentIds.length) {
      const submissions = await supabaseTable<RemoteRow>(supabaseToken, "assignment_submissions", {
        assignment_id: `in.(${assignmentIds.join(",")})`,
        student_id: `eq.${userId}`,
        select: "assignment_id",
      });
      for (const submission of submissions) {
        const assignmentId = remoteString(submission, "assignment_id", "assignmentId");
        if (assignmentId) completedAssignmentIds.add(assignmentId);
      }
    }
    const subjectIds = [...new Set(rows
      .map((row) => remoteString(row, "subject_id", "subjectId"))
      .filter((id): id is string => Boolean(id)))];
    const subjects = subjectIds.length
      ? await supabaseTable<RemoteRow>(supabaseToken, "subjects", { id: `in.(${subjectIds.join(",")})`, select: "id,name" })
      : [];
    const subjectLookup = new Map(subjects.map((subject) => [String(subject.id), subject]));
    res.json(ListMyAssignmentsResponse.parse(rows.map((row) => mapRemoteAssignment({
      ...row,
      ...(completedAssignmentIds.has(String(row.id)) ? { progress: 100, status: "completed" } : {}),
      subjects: subjectLookup.get(remoteString(row, "subject_id", "subjectId") ?? ""),
    }))));
    return;
  }
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return tx.select().from(assignmentsTable)
      .where(or(eq(assignmentsTable.studentId, userId), eq(assignmentsTable.teacherId, userId)))
      .orderBy(asc(assignmentsTable.dueAt));
  });
  res.json(ListMyAssignmentsResponse.parse(rows.map((row) => ({
    id: row.id,
    title: row.title,
    subject: row.subject,
    due: formatDue(row.dueAt),
    progress: row.progress,
    kind: row.kind,
    status: row.status,
  }))));
});

router.patch("/assignments/:id/complete", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const params = CompleteAssignmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(401).json({ error: "Supabase Bearer token required for platform assignments" });
    return;
  }
  if (supabaseToken) {
    const submissions = await supabaseTable<RemoteRow>(supabaseToken, "assignment_submissions", {
      assignment_id: `eq.${params.data.id}`,
      student_id: `eq.${userId}`,
      select: "status",
      limit: "1",
    });
    if (!submissions[0]) {
      res.status(409).json({ error: "Submit assignment answers before marking it complete" });
      return;
    }
    const assignments = await supabaseTable<RemoteRow>(supabaseToken, "assignments", {
      id: `eq.${params.data.id}`,
      student_id: `eq.${userId}`,
      select: "*",
      limit: "1",
    });
    if (!assignments[0]) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    const subjectId = remoteString(assignments[0], "subject_id", "subjectId");
    const subjects = subjectId
      ? await supabaseTable<RemoteRow>(supabaseToken, "subjects", { id: `eq.${subjectId}`, select: "id,name", limit: "1" })
      : [];
    res.json(CompleteAssignmentResponse.parse({
      ...mapRemoteAssignment({ ...assignments[0], subjects: subjects[0] }),
      progress: 100,
      status: "مكتمل",
    }));
    return;
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    const [updated] = await tx.update(assignmentsTable).set({ progress: 100, status: "مكتمل" })
      .where(and(eq(assignmentsTable.id, params.data.id), eq(assignmentsTable.studentId, userId))).returning();
    if (!updated) return null;
    await tx.execute(sql`select set_config('app.server_write', 'true', true)`);
    await tx.insert(notificationsTable).values({
      id: crypto.randomUUID(),
      userId: updated.teacherId,
      title: "تم إنجاز المهمة",
      body: `أكمل الطالب مهمة ${updated.title}`,
      icon: "check-circle",
    });
    return {
      id: updated.id,
      title: updated.title,
      subject: updated.subject,
      due: formatDue(updated.dueAt),
      progress: updated.progress,
      kind: updated.kind,
      status: updated.status,
    };
  });
  if (!result) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }
  res.json(CompleteAssignmentResponse.parse(result));
});

router.get("/notifications", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(401).json({ error: "Supabase Bearer token required for platform notifications" });
    return;
  }
  if (supabaseToken) {
    const rows = await supabaseTable<RemoteRow>(supabaseToken, "notifications", {
      select: "*",
      user_id: `eq.${userId}`,
      order: "created_at.desc",
    });
    res.json(ListMyNotificationsResponse.parse(rows.map(mapRemoteNotification)));
    return;
  }
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return tx.select().from(notificationsTable).where(eq(notificationsTable.userId, userId)).orderBy(asc(notificationsTable.createdAt));
  });
  res.json(ListMyNotificationsResponse.parse(rows.reverse().map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    time: notificationTime(row.createdAt),
    icon: row.icon,
    unread: row.readAt === null,
  }))));
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(401).json({ error: "Supabase Bearer token required for platform notifications" });
    return;
  }
  if (supabaseToken) {
    const updated = await supabaseTable<RemoteRow>(supabaseToken, "notifications", { id: `eq.${params.data.id}`, user_id: `eq.${userId}` }, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ is_read: true }),
    });
    if (!updated[0]) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json(MarkNotificationReadResponse.parse(mapRemoteNotification(updated[0])));
    return;
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    const [updated] = await tx.update(notificationsTable).set({ readAt: new Date() })
      .where(and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.userId, userId))).returning();
    return updated;
  });
  if (!result) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json(MarkNotificationReadResponse.parse({
    id: result.id,
    title: result.title,
    body: result.body,
    time: notificationTime(result.createdAt),
    icon: result.icon,
    unread: false,
  }));
});

router.patch("/notifications/read-all", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(401).json({ error: "Supabase Bearer token required for platform notifications" });
    return;
  }
  if (supabaseToken) {
    const updated = await supabaseTable<RemoteRow>(supabaseToken, "notifications", { user_id: `eq.${userId}`, is_read: "eq.false" }, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ is_read: true }),
    });
    res.json(MarkAllNotificationsReadResponse.parse({ updated: updated.length }));
    return;
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return tx.update(notificationsTable).set({ readAt: new Date() })
      .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt))).returning({ id: notificationsTable.id });
  });
  res.json(MarkAllNotificationsReadResponse.parse({ updated: result.length }));
});

export default router;