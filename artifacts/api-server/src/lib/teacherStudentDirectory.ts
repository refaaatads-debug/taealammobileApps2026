type Row = Record<string, unknown>;

export function incomingStudentRequestQuery(teacherId: string, nowIso: string): Record<string, string> {
  return {
    select: "student_id",
    status: "in.(open,accepted)",
    // Match the incoming booking-request endpoint. RLS remains authoritative
    // for subject eligibility; do not include another teacher's acceptance.
    and: `(or(accepted_by.eq.${teacherId},accepted_by.is.null),or(expires_at.is.null,expires_at.gte.${nowIso}),scheduled_at.gte.${nowIso})`,
  };
}

export function linkedStudentIds(...sources: Row[][]): string[] {
  return [...new Set(sources.flatMap((rows) => rows.flatMap((row) => {
    const id = typeof row.student_id === "string" ? row.student_id.trim() : "";
    return id ? [id] : [];
  })))];
}

export function studentDirectoryEntries(studentIds: string[], profiles: Row[]) {
  const byUserId = new Map(profiles.map((profile) => [String(profile.user_id), profile]));
  return studentIds.map((id) => {
    const profile = byUserId.get(id);
    const fullName = typeof profile?.full_name === "string" ? profile.full_name.trim() : "";
    return {
      id,
      displayName: fullName || "طالب",
      // Email is not part of the public profile projection.
      email: null,
      profileImageUrl: typeof profile?.avatar_url === "string" ? profile.avatar_url : null,
      progress: 0,
    };
  });
}
