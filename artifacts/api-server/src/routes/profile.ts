import { GetMyProfileResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import {
  getSupabaseProfile,
  getSupabaseRoles,
  getSupabaseTeacherApproval,
  isSupabaseUserBanned,
  readBearerToken,
  type PlatformRole,
} from "../lib/supabaseAuth";
import { normalizeStage } from "../lib/teachingStages";

const router: IRouter = Router();

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

  const profile = await getSupabaseProfile(accessToken, req.user.id);
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const roles = await getSupabaseRoles(accessToken, req.user.id);
  const roleOrder: PlatformRole[] = ["admin", "teacher", "parent", "student"];
  const role = roleOrder.find((candidate) => roles.includes(candidate));
  if (!role) {
    res.status(403).json({ error: "Unable to resolve the authenticated platform role" });
    return;
  }

  const teacherApproved = role === "teacher"
    ? await getSupabaseTeacherApproval(accessToken, req.user.id)
    : null;
  const isBanned = role === "admin" ? false : await isSupabaseUserBanned(accessToken, req.user.id);
  const fullName = typeof profile.full_name === "string" ? profile.full_name.trim() : "";
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || req.user.firstName;
  const lastName = nameParts.slice(1).join(" ") || req.user.lastName;
  const displayName = fullName || req.user.email || "مستخدم";
  const roleLabels: Record<PlatformRole, string> = {
    admin: "مدير",
    teacher: "معلم",
    parent: "ولي أمر",
    student: "طالب",
  };
  const rawTeachingStage = typeof profile.teaching_stage === "string" ? profile.teaching_stage.trim() : "";
  res.json(GetMyProfileResponse.parse({
    id: req.user.id,
    email: req.user.email,
    firstName,
    lastName,
    profileImageUrl: typeof profile.avatar_url === "string" ? profile.avatar_url : req.user.profileImageUrl,
    role,
    roles,
    displayName,
    roleLabel: roleLabels[role],
    teachingStage: rawTeachingStage ? normalizeStage(rawTeachingStage) : null,
    teacherApproved,
    isBanned,
  }));
});

export default router;