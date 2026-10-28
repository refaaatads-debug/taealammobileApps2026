export function formatLocalDateTimeInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function getInPersonAppointmentTimes(dateKey: string, nowMs = Date.now()): string[] {
  return Array.from({ length: 16 }, (_, index) => `${String(index + 8).padStart(2, "0")}:00`)
    .filter((time) => new Date(`${dateKey}T${time}`).getTime() >= nowMs + 2 * 60 * 60 * 1000);
}

export function firstAvailableInPersonSchedule(nowMs = Date.now()): string {
  const earliest = nowMs + 2 * 60 * 60 * 1000;
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(nowMs);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + offset);
    for (let hour = 8; hour <= 23; hour += 1) {
      const candidate = new Date(day);
      candidate.setHours(hour, 0, 0, 0);
      if (candidate.getTime() >= earliest) return formatLocalDateTimeInput(candidate);
    }
  }
  return formatLocalDateTimeInput(new Date(earliest));
}

export function canConfirmInPersonAttendance(scheduledAt: string, nowMs = Date.now()): boolean {
  const start = new Date(scheduledAt).getTime();
  return Number.isFinite(start) && nowMs >= start && nowMs < start + 15 * 60 * 1000;
}

export function canRevealInPersonAttendanceCode(scheduledAt: string, nowMs = Date.now()): boolean {
  const start = new Date(scheduledAt).getTime();
  return Number.isFinite(start) && nowMs < start + 15 * 60 * 1000;
}

export function canStudentCancelInPersonRequest(role: string, status: string): boolean {
  return role === "student" && status === "open";
}

export function inPersonAttendanceAction(
  scheduledAt: string,
  sessionStatus: string | null | undefined,
  nowMs = Date.now(),
): 'waiting' | 'enter_code' | 'expired' | 'confirmed' {
  if (sessionStatus === 'in_progress') return 'confirmed';
  const start = new Date(scheduledAt).getTime();
  if (!Number.isFinite(start)) return 'waiting';
  if (nowMs >= start + 15 * 60 * 1000) return 'expired';
  return nowMs >= start ? 'enter_code' : 'waiting';
}

export function getApprovedStageSubjectIds(rows: Array<Record<string, unknown>>, stage: string): Set<string> {
  const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '').trim().replace(/\s+/gu, ' ').toLowerCase();
  const asList = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value !== 'string') return [];
    const text = value.trim();
    if (!text) return [];
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
    return text.replace(/^\{|\}$/gu, '').split(',').map((item) => item.replace(/^['"]|['"]$/gu, '').trim()).filter(Boolean);
  };
  const selectedStage = normalize(stage);
  return new Set(rows.filter((row) => {
    const rawProfile = row.teacher_profiles;
    const profile = Array.isArray(rawProfile) ? rawProfile[0] as Record<string, unknown> | undefined : rawProfile as Record<string, unknown> | null;
    return profile?.is_approved === true && asList(profile.teaching_stages).some((value) => normalize(value) === selectedStage);
  }).map((row) => String(row.subject_id ?? '')).filter(Boolean));
}

export function parseFutureInPersonDateTime(value: string, nowMs = Date.now()): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
  if (
    date.getFullYear() !== Number(year)
    || date.getMonth() !== Number(month) - 1
    || date.getDate() !== Number(day)
    || date.getHours() !== Number(hour)
    || date.getMinutes() !== Number(minute)
    || date.getTime() < nowMs + 2 * 60 * 60 * 1000
  ) return null;
  return date;
}

export function inPersonRequestStatusLabel(status: unknown, locale: "ar" | "en"): string {
  const value = String(status ?? "").trim().toLowerCase();
  const labels: Record<string, [string, string]> = {
    open: ["بانتظار رد المعلمين", "Awaiting teacher responses"],
    accepted: ["تم قبول الطلب", "Accepted"],
    in_progress: ["الجلسة جارية", "In progress"],
    rejected: ["لم يقبل أي معلم الطلب", "Declined"],
    declined: ["تم الرفض", "Declined"],
    cancelled: ["ملغي", "Cancelled"],
    expired: ["انتهت المهلة", "Expired"],
    completed: ["مكتمل", "Completed"],
  };
  const label = labels[value];
  return label ? label[locale === "ar" ? 0 : 1] : locale === "ar" ? "حالة غير معروفة" : "Unknown status";
}
