const STAGE_ALIASES: Record<string, string> = {
  "رياض الاطفال": "رياض الأطفال",
  "رياض الأطفال": "رياض الأطفال",
  "روضة": "رياض الأطفال",
  "الروضة": "رياض الأطفال",
  "kindergarten": "رياض الأطفال",
  "kg": "رياض الأطفال",
  "ابتدائي": "الابتدائية",
  "الابتدائي": "الابتدائية",
  "الابتدائية": "الابتدائية",
  "الابتدائيه": "الابتدائية",
  "elementary": "الابتدائية",
  "primary": "الابتدائية",
  "primary school": "الابتدائية",
  "متوسط": "المتوسطة",
  "المتوسط": "المتوسطة",
  "المتوسطة": "المتوسطة",
  "المتوسطه": "المتوسطة",
  "middle school": "المتوسطة",
  "middle": "المتوسطة",
  "ثانوي": "الثانوية",
  "الثانوي": "الثانوية",
  "الثانوية": "الثانوية",
  "الثانويه": "الثانوية",
  "secondary": "الثانوية",
  "high school": "الثانوية",
  "قدرات": "قدرات",
  "qudurat": "قدرات",
  "تحصيلي": "تحصيلي",
  "tahseeli": "تحصيلي",
};

function remoteStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(remoteStringArray);
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];

  for (const candidate of [trimmed, trimmed.replace(/'/g, '"')]) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return remoteStringArray(parsed);
    } catch {
      // Continue with PostgreSQL-array parsing below.
    }
  }

  return trimmed
    .replace(/^\s*(?:\{|\[)|(?:\}|\])\s*$/g, "")
    .split(/[,\u060c;|]/)
    .map((item) => item.trim().replace(/^['"]|['"]$/g, "").trim())
    .filter(Boolean);
}

export function normalizeStage(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0640\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ar");
  const directAlias = STAGE_ALIASES[normalized];
  if (directAlias) return directAlias;
  if (/(رياض|روض|kindergarten|\bkg\b)/i.test(normalized) && /(طف|kindergarten|\bkg\b)/i.test(normalized)) {
    return "رياض الأطفال";
  }
  if (/(ابتدائ|elementary|primary)/i.test(normalized)) return "الابتدائية";
  if (/(متوسط|middle|prep)/i.test(normalized)) return "المتوسطة";
  if (/(ثانوي|secondary|high school)/i.test(normalized)) return "الثانوية";
  if (/(قدرات|qudurat)/i.test(normalized)) return "قدرات";
  if (/(تحصيل|tahseeli)/i.test(normalized)) return "تحصيلي";
  return normalized;
}

export function normalizeStageList(value: unknown): string[] {
  return [...new Set(remoteStringArray(value).map(normalizeStage).filter(Boolean))];
}