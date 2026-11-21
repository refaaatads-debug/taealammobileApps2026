import type { Notification as ApiNotification } from "@workspace/api-client-react";
import type { Role, UserProfile } from "@/constants/localData";

type Row = Record<string, unknown>;
type SupabaseError = { message?: string; code?: string } | null;
type SupabaseResult = { data: unknown; error: SupabaseError };

export interface AjyalSupabaseQuery extends PromiseLike<SupabaseResult> {
  select(columns?: string): AjyalSupabaseQuery;
  eq(column: string, value: unknown): AjyalSupabaseQuery;
  in(column: string, values: unknown[]): AjyalSupabaseQuery;
  or(filters: string): AjyalSupabaseQuery;
  order(column: string, options?: { ascending?: boolean }): AjyalSupabaseQuery;
  limit(count: number): AjyalSupabaseQuery;
  maybeSingle(): PromiseLike<SupabaseResult>;
  update(values: Row): AjyalSupabaseQuery;
  insert(values: Row | Row[]): AjyalSupabaseQuery;
}

export interface AjyalSupabaseClient {
  from(table: string): AjyalSupabaseQuery;
  rpc(name: string, args?: Row): PromiseLike<SupabaseResult>;
}

const platformRoles = new Set<Role>(["admin", "teacher", "parent", "student"]);
const roleOrder: Role[] = ["admin", "teacher", "parent", "student"];
const roleLabels: Record<Role, string> = {
  admin: "مدير",
  teacher: "معلم",
  parent: "ولي أمر",
  student: "طالب",
};

const stageAliases: Record<string, string> = {
  "رياض الاطفال": "رياض الأطفال",
  "رياض الأطفال": "رياض الأطفال",
  روضة: "رياض الأطفال",
  الروضة: "رياض الأطفال",
  kindergarten: "رياض الأطفال",
  kg: "رياض الأطفال",
  ابتدائي: "الابتدائية",
  الابتدائي: "الابتدائية",
  الابتدائية: "الابتدائية",
  الابتدائيه: "الابتدائية",
  elementary: "الابتدائية",
  primary: "الابتدائية",
  "primary school": "الابتدائية",
  متوسط: "المتوسطة",
  المتوسط: "المتوسطة",
  المتوسطة: "المتوسطة",
  المتوسطه: "المتوسطة",
  middle: "المتوسطة",
  "middle school": "المتوسطة",
  ثانوي: "الثانوية",
  الثانوي: "الثانوية",
  الثانوية: "الثانوية",
  الثانويه: "الثانوية",
  secondary: "الثانوية",
  "high school": "الثانوية",
  قدرات: "قدرات",
  qudurat: "قدرات",
  تحصيلي: "تحصيلي",
  tahseeli: "تحصيلي",
};

export const ajyalNotificationsQueryKey = (userId: string) =>
  ["ajyal", "notifications", userId] as const;

function valueString(row: Row | null | undefined, ...keys: string[]): string | null {
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function resultData<T>(result: SupabaseResult, message: string): T | null {
  if (result.error) {
    throw new Error(result.error.message?.trim() || message);
  }
  return result.data as T | null;
}

async function resultRows(query: AjyalSupabaseQuery, message: string): Promise<Row[]> {
  const data = resultData<unknown[]>(await query, message);
  return Array.isArray(data) ? data as Row[] : [];
}

async function resultRow(query: PromiseLike<SupabaseResult>, message: string): Promise<Row | null> {
  const data = resultData<unknown>(await query, message);
  return data && typeof data === "object" && !Array.isArray(data) ? data as Row : null;
}

function normalizeTeachingStage(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0640\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ar");
  const alias = stageAliases[normalized];
  if (alias) return alias;
  if (/(رياض|روض|kindergarten|\bkg\b)/i.test(normalized) && /(طف|kindergarten|\bkg\b)/i.test(normalized)) return "رياض الأطفال";
  if (/(ابتدائ|elementary|primary)/i.test(normalized)) return "الابتدائية";
  if (/(متوسط|middle|prep)/i.test(normalized)) return "المتوسطة";
  if (/(ثانوي|secondary|high school)/i.test(normalized)) return "الثانوية";
  if (/(قدرات|qudurat)/i.test(normalized)) return "قدرات";
  if (/(تحصيل|tahseeli)/i.test(normalized)) return "تحصيلي";
  return normalized;
}

export async function loadAjyalProfile(
  client: AjyalSupabaseClient,
  authUser: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    roleHint?: string | null;
  },
): Promise<UserProfile | null> {
  const [profileResult, rolesResult] = await Promise.all([
    resultRow(
      client.from("profiles")
        .select("user_id,full_name,avatar_url,teaching_stage")
        .eq("user_id", authUser.id)
        .maybeSingle(),
      "تعذر تحميل ملف الحساب من المنصة.",
    ),
    resultRows(
      client.from("user_roles")
        .select("role")
        .eq("user_id", authUser.id),
      "تعذر التحقق من صلاحيات الحساب.",
    ),
  ]);
  if (!profileResult) return null;

  const roles = rolesResult
    .map((row) => row.role)
    .filter((role): role is Role => typeof role === "string" && platformRoles.has(role as Role));
  let teacherProfile: Row | null = null;
  if (!roles.includes("teacher") && !roles.includes("admin")) {
    teacherProfile = await resultRow(
      client.from("teacher_profiles")
        .select("user_id,is_approved")
        .eq("user_id", authUser.id)
        .maybeSingle(),
      "تعذر التحقق من ملف المعلم.",
    );
    // The Auth metadata is only a guard against opening the student area when
    // a teacher role handoff is incomplete. Teacher approval remains required.
    if (teacherProfile || authUser.roleHint === "teacher") roles.push("teacher");
  }

  const role = roleOrder.find((candidate) => roles.includes(candidate));
  if (!role) return null;

  if (role === "teacher" && !teacherProfile) {
    teacherProfile = await resultRow(
      client.from("teacher_profiles")
        .select("user_id,is_approved")
        .eq("user_id", authUser.id)
        .maybeSingle(),
      "تعذر التحقق من اعتماد المعلم.",
    );
  }
  let isBanned = false;
  if (role !== "admin") {
    const warnings = await resultRows(
      client.from("user_warnings")
        .select("user_id")
        .eq("user_id", authUser.id)
        .eq("is_banned", true)
        .limit(1),
      "تعذر التحقق من حالة الحساب.",
    );
    isBanned = warnings.length > 0;
  }

  const fullName = valueString(profileResult, "full_name") ?? "";
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || authUser.firstName;
  const lastName = nameParts.slice(1).join(" ") || authUser.lastName;
  const teachingStage = valueString(profileResult, "teaching_stage");

  return {
    id: authUser.id,
    email: authUser.email,
    firstName,
    lastName,
    profileImageUrl: valueString(profileResult, "avatar_url") ?? authUser.profileImageUrl,
    role,
    roles,
    displayName: fullName || authUser.email || "مستخدم",
    roleLabel: roleLabels[role],
    teachingStage: teachingStage ? normalizeTeachingStage(teachingStage) : null,
    teacherApproved: role === "teacher" && typeof teacherProfile?.is_approved === "boolean"
      ? teacherProfile.is_approved
      : null,
    isBanned,
  };
}

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4_096) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname && !url.username && !url.password
      ? value.trim()
      : null;
  } catch {
    return null;
  }
}

function findNestedImageUrl(value: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  const direct = safeHttpsUrl(value);
  if (direct) return direct;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return findNestedImageUrl(JSON.parse(trimmed), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const nested of value.slice(0, 12)) {
      const found = findNestedImageUrl(nested, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Row;
  const urlKey = /^(url|uri|href|src|signedurl|publicurl|downloadurl)$/i;
  for (const [key, nested] of Object.entries(record)) {
    if (urlKey.test(key.replace(/[^a-z0-9]/gi, ""))) {
      const found = safeHttpsUrl(nested);
      if (found) return found;
    }
  }
  for (const nested of Object.values(record)) {
    const found = findNestedImageUrl(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

function findNotificationImageUrl(row: Row): string | null {
  const imageField = /(image|photo|picture|banner|thumbnail)/i;
  for (const [key, value] of Object.entries(row)) {
    if (imageField.test(key)) {
      const found = findNestedImageUrl(value);
      if (found) return found;
    }
  }
  for (const value of Object.values(row)) {
    const found = findNestedImageUrl(value);
    if (found) return found;
  }
  return null;
}

function notificationTime(value: unknown, now: number): string {
  const date = typeof value === "string" ? new Date(value) : new Date(Number.NaN);
  const createdAt = Number.isNaN(date.getTime()) ? new Date(now) : date;
  const minutes = Math.max(0, Math.floor((now - createdAt.getTime()) / 60_000));
  if (minutes < 60) return `منذ ${minutes || 1} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "long" }).format(createdAt);
}

function routeForNotification(type: string | null, title: string, body: string, icon: string): string | null {
  switch (type) {
    case "booking_request":
    case "booking_confirmed":
    case "booking_accepted":
    case "booking_rejected":
    case "booking_cancelled":
    case "session_reminder":
    case "session_starting":
    case "session_started":
    case "session_join":
    case "session_ended":
    case "instant_session":
    case "first_impression":
    case "expired_no_show":
    case "no_show":
    case "booking_expired":
    case "session_auto_cancelled":
    case "automatic_cancellation":
    case "session_cancelled":
      return "/bookings";
    case "chat_message":
    case "message":
    case "new_message":
      return "/messages";
    case "assignment_submission":
    case "assignment_graded":
      return "/assignments";
    case "support_reply":
    case "support_message":
    case "support_ticket":
    case "support_response":
    case "support_ticket_reply":
    case "ticket_reply":
      return "/support";
    case "payment":
    case "subscription":
    case "subscription_updated":
      return "/subscription";
    case "invoice":
      return "/invoices";
    case "teacher_in_person_approval":
    case "teacher_in_person_availability":
      return "/profile";
    case "teacher_cancellation_warning":
    case "first_impression_review":
    case "admin_announcement":
    case "announcement":
    case "system_notification":
    case "notification":
      return "/notifications";
    default:
      break;
  }
  const searchableText = `${title} ${body}`.toLowerCase();
  if (["خدمة العملاء", "الدعم الفني", "support", "ticket"].some((part) => searchableText.includes(part))) return "/support";
  if (["إلغاء الحصة", "الغاء الحصة", "expired_no_show", "no_show"].some((part) => searchableText.includes(part))) return "/bookings";
  if (icon === "calendar" || icon === "check-circle") return "/bookings";
  if (icon === "message-circle") return "/messages";
  if (icon === "credit-card") return "/subscription";
  return null;
}

export function mapAjyalNotification(row: Row, now = Date.now()): ApiNotification {
  const type = valueString(row, "type", "notification_type");
  const title = valueString(row, "title") ?? "إشعار";
  const body = valueString(row, "body", "message") ?? "";
  const icon = valueString(row, "icon")
    ?? (type === "teacher_in_person_approval" || type === "teacher_in_person_availability" ? "user" : "bell");
  const explicitRoute = valueString(row, "route", "link");
  const route = explicitRoute ?? routeForNotification(type, title, body, icon);
  const bookingId = valueString(row, "booking_id", "bookingId");
  const imageUrl = findNotificationImageUrl(row);
  return {
    id: String(row.id ?? ""),
    title,
    body,
    time: notificationTime(row.created_at ?? row.createdAt, now),
    icon,
    unread: row.is_read !== true,
    ...(type ? { type } : {}),
    ...(route ? { route } : {}),
    ...(bookingId ? { bookingId } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

export async function loadAjyalNotifications(
  client: AjyalSupabaseClient,
  userId: string,
  now = Date.now(),
): Promise<ApiNotification[]> {
  const rows = await resultRows(
    client.from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    "تعذر تحميل الإشعارات.",
  );
  return rows.map((row) => mapAjyalNotification(row, now));
}

export async function markAjyalNotificationRead(
  client: AjyalSupabaseClient,
  userId: string,
  notificationId: string,
): Promise<void> {
  const row = await resultRow(
    client.from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle(),
    "تعذر تحديث الإشعار.",
  );
  if (!row) throw new Error("الإشعار غير موجود أو لا تملك صلاحية تعديله.");
}

export async function markAllAjyalNotificationsRead(
  client: AjyalSupabaseClient,
  userId: string,
): Promise<void> {
  await resultRows(
    client.from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .select("id"),
    "تعذر تحديث الإشعارات.",
  );
}

export async function completeAjyalAssignment(
  client: AjyalSupabaseClient,
  userId: string,
  assignmentId: string,
): Promise<void> {
  const submissions = await resultRows(
    client.from("assignment_submissions")
      .select("id")
      .eq("assignment_id", assignmentId)
      .eq("student_id", userId)
      .limit(1),
    "تعذر التحقق من تسليم الواجب.",
  );
  if (!submissions.length) {
    throw new Error("أرسل إجابات الواجب أولًا قبل تسجيله كمكتمل.");
  }

  const assignment = await resultRow(
    client.from("assignments")
      .select("id")
      .eq("id", assignmentId)
      .eq("status", "active")
      .or(`student_id.eq.${userId},student_id.is.null`)
      .maybeSingle(),
    "تعذر التحقق من الواجب.",
  );
  if (!assignment) throw new Error("الواجب غير موجود أو لم يعد متاحًا.");
  // The platform derives completion from the student's submitted work; it
  // does not grant students direct UPDATE access to assignments.
}

function validSupabaseUserId(userId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);
}

function remotePersonName(row: Row | undefined): string {
  return valueString(row, "full_name", "display_name", "name")
    ?? ([valueString(row, "first_name"), valueString(row, "last_name")].filter(Boolean).join(" ") || "مستخدم");
}

async function bestEffortInsertNotification(
  client: AjyalSupabaseClient,
  notification: Row,
  operation: string,
): Promise<void> {
  try {
    const result = await client.from("notifications").insert(notification);
    if (result.error) console.warn(`[ajyal] ${operation} notification was not saved.`);
  } catch {
    console.warn(`[ajyal] ${operation} notification was not saved.`);
  }
}

export async function cancelAjyalSession(
  client: AjyalSupabaseClient,
  userId: string,
  sessionId: string,
  reason?: string,
  now = new Date(),
): Promise<void> {
  if (!validSupabaseUserId(userId)) throw new Error("تعذر التحقق من الحساب. سجّل الدخول ثم حاول مرة أخرى.");
  const current = await resultRow(
    client.from("bookings")
      .select("id,student_id,teacher_id,status,scheduled_at,subject_id")
      .eq("id", sessionId)
      .or(`student_id.eq.${userId},teacher_id.eq.${userId}`)
      .limit(1)
      .maybeSingle(),
    "تعذر التحقق من الحصة.",
  );
  if (!current) throw new Error("الحصة غير موجودة أو لا تملك صلاحية إلغائها.");

  const currentStatus = valueString(current, "status") ?? "";
  if (currentStatus === "cancelled") throw new Error("تم إلغاء الحصة بالفعل.");
  if (currentStatus === "completed") throw new Error("لا يمكن إلغاء حصة مكتملة.");

  const teacherRole = await resultRows(
    client.from("user_roles")
      .select("user_id")
      .eq("user_id", userId)
      .eq("role", "teacher")
      .limit(1),
    "تعذر التحقق من صلاحية المعلم.",
  );
  const isTeacher = teacherRole.length > 0;
  const trimmedReason = reason?.trim() ?? "";
  if (isTeacher && !trimmedReason) {
    throw new Error("اكتب سبب الإلغاء قبل تأكيد إلغاء جلسة المعلم.");
  }

  const cancellation = isTeacher
    ? {
        status: "cancelled",
        session_status: "cancelled",
        cancelled_at: now.toISOString(),
        cancelled_by: userId,
        cancellation_reason: trimmedReason,
      }
    : { status: "cancelled", session_status: "cancelled" };
  const updated = await resultRow(
    client.from("bookings")
      .update(cancellation)
      .eq("id", sessionId)
      .eq("status", currentStatus)
      .or(`student_id.eq.${userId},teacher_id.eq.${userId}`)
      .select("id,student_id,teacher_id,status,scheduled_at,subject_id")
      .maybeSingle(),
    "تعذر إلغاء الحصة. تحقق من اتصالك وحاول مرة أخرى.",
  );
  if (!updated) throw new Error("تغيرت حالة الحصة بالفعل. حدّث القائمة ثم حاول مرة أخرى.");

  const studentId = valueString(updated, "student_id", "studentId") ?? "";
  const teacherId = valueString(updated, "teacher_id", "teacherId") ?? "";
  const recipientId = isTeacher ? studentId : teacherId;
  const subjectName = valueString(updated, "subject") ?? "المادة";
  const scheduledAt = valueString(updated, "scheduled_at", "scheduledAt");
  let teacherName = "المعلم";
  try {
    const profiles = await resultRows(
      client.from("profiles")
        .select("user_id,full_name,display_name,first_name,last_name")
        .in("user_id", [studentId, teacherId].filter(Boolean)),
      "تعذر تحميل أسماء المشاركين.",
    );
    teacherName = remotePersonName(profiles.find((profile) => profile.user_id === teacherId));
  } catch {
    // The booking update is authoritative; notification copy is best-effort.
  }

  const cancellationBody = isTeacher
    ? `قام المعلم ${teacherName} بإلغاء حصة ${subjectName}. السبب: ${trimmedReason}`
    : `قام الطالب بإلغاء حصة ${subjectName} المقررة في ${scheduledAt
      ? new Date(scheduledAt).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })
      : ""}.`;
  if (recipientId) {
    await bestEffortInsertNotification(client, {
      user_id: recipientId,
      title: isTeacher ? "🗑️ تم إلغاء حصتك" : "🗑️ ألغى الطالب الحصة",
      body: cancellationBody,
      type: "booking_cancelled",
    }, "Cancellation");
  }

  if (isTeacher) {
    try {
      const monthlyResult = await client.rpc("teacher_monthly_cancellations", { _teacher_id: userId });
      const monthlyCount = resultData<unknown>(monthlyResult, "تعذر حساب إلغاءات المعلم.");
      if (Number(monthlyCount) > 3) {
        const admins = await resultRows(
          client.from("user_roles").select("user_id").eq("role", "admin"),
          "تعذر تحميل حسابات الإدارة.",
        );
        await Promise.all(admins.flatMap((admin) => {
          const adminId = valueString(admin, "user_id");
          return adminId ? [bestEffortInsertNotification(client, {
            user_id: adminId,
            title: "تنبيه إلغاءات معلم",
            body: `تجاوز المعلم ${teacherName} حد الإلغاءات الشهري (${monthlyCount}/3).`,
            type: "teacher_cancellation_warning",
          }, "Teacher cancellation warning")] : [];
        }));
      }
    } catch {
      // As on the platform API, a warning failure must not undo a cancellation.
    }
  }
}
