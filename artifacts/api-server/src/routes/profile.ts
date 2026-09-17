import { GetMyProfileResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import {
  getSupabaseProfile,
  getSupabaseRoles,
  hasSupabaseTeacherProfile,
  hasSupabaseTeacherSignupHint,
  getSupabaseTeacherApproval,
  isSupabaseUserBanned,
  readBearerToken,
  type PlatformRole,
} from "../lib/supabaseAuth";
import { normalizeStage } from "../lib/teachingStages";

const router: IRouter = Router();
const PROFILE_CACHE_TTL_MS = 30_000;
const PROFILE_SELECT = "user_id,full_name,avatar_url,teaching_stage";
const profileCache = new Map<string, { expiresAt: number; value: unknown }>();
const profileRequests = new Map<string, Promise<unknown>>();

function profileCacheKey(userId: string): string {
  return userId;
}

async function loadProfileResponse(
  userId: string,
  email: string | null,
  firstName: string | null,
  lastName: string | null,
  profileImageUrl: string | null,
  accessToken: string,
): Promise<unknown> {
  const [profile, roles] = await Promise.all([
    getSupabaseProfile(accessToken, userId, PROFILE_SELECT),
    getSupabaseRoles(accessToken, userId),
  ]);
  if (!profile) return null;

  // A teacher profile is the authoritative account surface for teacher
  // onboarding. The Auth metadata hint only prevents a failed role handoff
  // from silently opening a student session; approval is still required.
  let effectiveRoles = roles;
  if (!roles.includes("teacher") && !roles.includes("admin")) {
    const [hasTeacherProfile, hasTeacherSignupHint] = await Promise.all([
      hasSupabaseTeacherProfile(accessToken, userId),
      hasSupabaseTeacherSignupHint(accessToken),
    ]);
    if (hasTeacherProfile || hasTeacherSignupHint) {
      effectiveRoles = [...roles, "teacher"];
    }
  }
  const roleOrder: PlatformRole[] = ["admin", "teacher", "parent", "student"];
  const role = roleOrder.find((candidate) => effectiveRoles.includes(candidate));
  if (!role) return null;

  const [teacherApproved, isBanned] = await Promise.all([
    role === "teacher" ? getSupabaseTeacherApproval(accessToken, userId) : Promise.resolve(null),
    role === "admin" ? Promise.resolve(false) : isSupabaseUserBanned(accessToken, userId),
  ]);
  const fullName = typeof profile.full_name === "string" ? profile.full_name.trim() : "";
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const resolvedFirstName = nameParts[0] || firstName;
  const resolvedLastName = nameParts.slice(1).join(" ") || lastName;
  const displayName = fullName || email || "مستخدم";
  const roleLabels: Record<PlatformRole, string> = {
    admin: "مدير",
    teacher: "معلم",
    parent: "ولي أمر",
    student: "طالب",
  };
  const rawTeachingStage = typeof profile.teaching_stage === "string" ? profile.teaching_stage.trim() : "";
  return GetMyProfileResponse.parse({
    id: userId,
    email,
    firstName: resolvedFirstName,
    lastName: resolvedLastName,
    profileImageUrl: typeof profile.avatar_url === "string" ? profile.avatar_url : profileImageUrl,
    role,
    roles: effectiveRoles,
    displayName,
    roleLabel: roleLabels[role],
    teachingStage: rawTeachingStage ? normalizeStage(rawTeachingStage) : null,
    teacherApproved,
    isBanned,
  });
}

router.get("/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const accessToken = readBearerToken(req.get("authorization"));
  if (!accessToken) {
    res.status(401).json({ error: "Supabase Bearer token required" });
    return;
  }

  const cacheKey = profileCacheKey(req.user.id);
  const cached = profileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.value);
    return;
  }
  if (cached) profileCache.delete(cacheKey);

  const existingRequest = profileRequests.get(cacheKey);
  if (existingRequest) {
    const value = await existingRequest;
    if (value === null) {
      res.status(404).json({ error: "Profile not found" });
    } else {
      res.json(value);
    }
    return;
  }

  const profileRequest = loadProfileResponse(
    req.user.id,
    req.user.email,
    req.user.firstName,
    req.user.lastName,
    req.user.profileImageUrl,
    accessToken,
  );
  profileRequests.set(cacheKey, profileRequest);
  try {
    const value = await profileRequest;
    if (value === null) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    profileCache.set(cacheKey, { expiresAt: Date.now() + PROFILE_CACHE_TTL_MS, value });
    res.json(value);
  } finally {
    profileRequests.delete(cacheKey);
  }
});

export default router;