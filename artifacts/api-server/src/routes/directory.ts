import {
  ListMyStudentsResponse,
  ListTeachersResponse,
} from "@workspace/api-zod";
import {
  assignmentsTable,
  bookingsTable,
  db,
  usersTable,
} from "@workspace/db";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { getSupabaseProfile, hasSupabaseRole, readBearerToken, supabaseTable } from "../lib/supabaseAuth";
import { normalizeStageList } from "../lib/teachingStages";

const router: IRouter = Router();

function requireUser(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id;
}

function displayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "مستخدم";
}

function remoteDisplayName(row: Record<string, unknown>): string {
  const fullName = [row.full_name, row.display_name, row.name].find((value): value is string => typeof value === "string" && Boolean(value));
  if (fullName) return fullName;
  return [row.first_name, row.last_name].filter((value): value is string => typeof value === "string" && Boolean(value)).join(" ")
    || (typeof row.email === "string" ? row.email : "مستخدم");
}

function remoteNumber(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function remoteDays(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => typeof item === "string" || typeof item === "number" ? remoteDays(String(item)) : []);
  }
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return remoteDays(parsed);
  } catch {
    try {
      const parsed = JSON.parse(value.replace(/'/g, '"'));
      if (Array.isArray(parsed)) return remoteDays(parsed);
    } catch {
      // PostgREST can expose a postgres text[] value as "{day,day}".
    }
  }
  return value
    .replace(/^\s*(?:\{|\[)|(?:\}|\])\s*$/g, "")
    .split(/[,\u060c;|]/)
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function remoteMatchesSearch(row: Record<string, unknown>, search: string): boolean {
  if (!search) return true;
  const subjects = Array.isArray(row.subjects)
    ? row.subjects.filter((value): value is string => typeof value === "string")
    : [];
  return [row.full_name, row.display_name, row.name, row.first_name, row.last_name, ...subjects]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value.toLocaleLowerCase("ar").includes(search.toLocaleLowerCase("ar")));
}

router.get("/teachers", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 80) : "";
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (!supabaseToken) {
    res.status(401).json({ error: "Supabase Bearer token required" });
    return;
  }
  try {
    if (!(await hasSupabaseRole(supabaseToken, userId, "student"))) {
      res.status(403).json({ error: "Only students can list teachers" });
      return;
    }
    const teacherRows = await supabaseTable<Record<string, unknown>>(supabaseToken, "public_teacher_profiles", {
      is_approved: "eq.true",
      select: "*",
      order: "avg_rating.desc",
    });
    const teacherIds = teacherRows.map((row) => String(row.user_id ?? "")).filter(Boolean);
    const profiles = teacherIds.length
      ? await supabaseTable<Record<string, unknown>>(supabaseToken, "public_profiles", {
        user_id: `in.(${teacherIds.join(",")})`,
        select: "user_id,full_name,avatar_url",
      })
      : [];
    const teacherProfileIds = teacherRows.map((row) => String(row.id ?? "")).filter(Boolean);
    const subjectRows = teacherProfileIds.length
      ? await supabaseTable<Record<string, unknown>>(supabaseToken, "teacher_subjects", {
        teacher_id: `in.(${teacherProfileIds.join(",")})`,
        select: "teacher_id,subjects(name)",
      })
      : [];
    const subjectsByTeacherId = new Map<string, string[]>();
    subjectRows.forEach((row) => {
      const teacherId = String(row.teacher_id ?? "");
      const subject = row.subjects;
      if (!teacherId || !subject || typeof subject !== "object" || Array.isArray(subject)) return;
      const name = (subject as Record<string, unknown>).name;
      if (typeof name !== "string" || !name) return;
      const values = subjectsByTeacherId.get(teacherId) ?? [];
      if (!values.includes(name)) values.push(name);
      subjectsByTeacherId.set(teacherId, values);
    });
    const profileByUserId = new Map(profiles.map((row) => [String(row.user_id), row]));
    const filteredTeachers = teacherRows.filter((row) => {
      const profile = profileByUserId.get(String(row.user_id));
      const subjects = subjectsByTeacherId.get(String(row.id)) ?? [];
      return remoteMatchesSearch({ ...row, ...profile, subjects }, search);
    });
    const mappedTeachers = filteredTeachers.map((row) => {
      const profile = profileByUserId.get(String(row.user_id)) ?? {};
      const subjects = subjectsByTeacherId.get(String(row.id)) ?? [];
      return {
        id: String(row.user_id),
        displayName: remoteDisplayName(profile) || "معلم",
        email: null,
        profileImageUrl: typeof profile.avatar_url === "string" ? profile.avatar_url : null,
        hourlyRate: remoteNumber(row, "hourly_rate"),
        rating: remoteNumber(row, "avg_rating"),
        totalSessions: remoteNumber(row, "total_sessions"),
        teachingStages: normalizeStageList(row.teaching_stages),
        availableDays: remoteDays(row.available_days),
        availableFrom: typeof row.available_from === "string" ? row.available_from : null,
        availableTo: typeof row.available_to === "string" ? row.available_to : null,
        subjects,
      };
    });
    res.json(ListTeachersResponse.parse(mappedTeachers));
  } catch {
    res.status(502).json({ error: "Unable to load teachers from the platform" });
  }
});

router.get("/students", async (req, res): Promise<void> => {
  const teacherId = requireUser(req, res);
  if (!teacherId) return;
  const supabaseToken = readBearerToken(req.get("authorization"));
  if (supabaseToken) {
    const currentProfile = await getSupabaseProfile(supabaseToken, teacherId);
    if (!(await hasSupabaseRole(supabaseToken, teacherId, "teacher"))) {
      res.status(403).json({ error: "Only teachers can list students" });
      return;
    }
    const [bookingRows, assignmentRows] = await Promise.all([
      supabaseTable<Record<string, unknown>>(supabaseToken, "bookings", {
        teacher_id: `eq.${teacherId}`,
        select: "student_id",
      }),
      supabaseTable<Record<string, unknown>>(supabaseToken, "assignments", {
        teacher_id: `eq.${teacherId}`,
        // The production assignments table does not expose a progress column.
        // Student membership can still be derived from the assignment link.
        select: "student_id",
      }),
    ]);
    const studentIds = [...new Set([
      ...bookingRows.map((row) => typeof row.student_id === "string" ? row.student_id : null),
      ...assignmentRows.map((row) => typeof row.student_id === "string" ? row.student_id : null),
    ].filter((id): id is string => Boolean(id)))];
    if (!studentIds.length) {
      res.json(ListMyStudentsResponse.parse([]));
      return;
    }
    const students = await supabaseTable<Record<string, unknown>>(supabaseToken, "profiles", {
      user_id: `in.(${studentIds.join(",")})`,
      select: "*",
    });
    res.json(ListMyStudentsResponse.parse(students.map((student) => {
      return {
        id: String(student.user_id ?? student.id),
        displayName: remoteDisplayName(student),
        email: typeof student.email === "string" ? student.email : null,
        profileImageUrl: typeof student.avatar_url === "string" ? student.avatar_url : null,
        progress: 0,
      };
    })));
    return;
  }
  const [currentUser] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, teacherId));
  if (currentUser?.role !== "teacher") {
    res.status(403).json({ error: "Only teachers can list students" });
    return;
  }

  const [bookingRows, assignmentRows] = await Promise.all([
    db.select({ studentId: bookingsTable.studentId })
      .from(bookingsTable)
      .where(eq(bookingsTable.teacherId, teacherId)),
    db.select({
      studentId: assignmentsTable.studentId,
      progress: assignmentsTable.progress,
    })
      .from(assignmentsTable)
      .where(eq(assignmentsTable.teacherId, teacherId)),
  ]);

  const studentIds = [...new Set([
    ...bookingRows.map((row) => row.studentId),
    ...assignmentRows.map((row) => row.studentId).filter((id): id is string => Boolean(id)),
  ])];
  if (!studentIds.length) {
    res.json(ListMyStudentsResponse.parse([]));
    return;
  }

  const students = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      profileImageUrl: usersTable.profileImageUrl,
    })
    .from(usersTable)
    .where(and(eq(usersTable.role, "student"), inArray(usersTable.id, studentIds)));
  const progressByStudent = new Map<string, number[]>();
  assignmentRows.forEach((row) => {
    if (!row.studentId) return;
    const values = progressByStudent.get(row.studentId) ?? [];
    values.push(row.progress);
    progressByStudent.set(row.studentId, values);
  });

  res.json(ListMyStudentsResponse.parse(students.map((student) => {
    const progress = progressByStudent.get(student.id) ?? [];
    const average = progress.length
      ? Math.round(progress.reduce((sum, value) => sum + value, 0) / progress.length)
      : 0;
    return {
      id: student.id,
      displayName: displayName(student),
      email: student.email,
      profileImageUrl: student.profileImageUrl,
      progress: Math.max(0, Math.min(100, average)),
    };
  })));
});

export default router;