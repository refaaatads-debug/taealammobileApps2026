export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function normalizeDays(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => typeof item === "string" || typeof item === "number" ? splitDays(String(item)) : []);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeDays(parsed);
    } catch {
      try {
        const parsed = JSON.parse(value.replace(/'/g, '"'));
        if (Array.isArray(parsed)) return normalizeDays(parsed);
      } catch {
        // Some PostgREST views expose a postgres array as a comma-separated string.
      }
    }
    return splitDays(value);
  }
  return [];
}

function splitDays(value: string): string[] {
  return value
    .replace(/^\s*(?:\{|\[)|(?:\}|\])\s*$/g, "")
    .split(/[,\u060c;|]/)
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function dayAliases(date: Date): string[] {
  const englishLong = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const englishShort = date.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
  const arabicLong = date.toLocaleDateString("ar-SA", { weekday: "long" });
  const arabicShort = date.toLocaleDateString("ar-SA", { weekday: "short" });
  return [englishLong, englishShort, arabicLong, arabicShort, String(date.getDay())];
}

export function dayIsAvailable(days: string[], date: Date): boolean {
  const aliases = dayAliases(date).map(normalizeDayToken);
  return normalizeDays(days).some((item) => {
    const normalized = normalizeDayToken(item);
    return aliases.some((alias) => normalized === alias || normalized === alias.slice(0, 3));
  });
}

function normalizeDayToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ar")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/[\s_-]/g, "");
}

export function timeIsAvailable(
  value: string | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  const minutes = parseClock(value);
  const start = parseClock(from);
  const end = parseClock(to);
  return minutes !== null && start !== null && end !== null && end > start && minutes >= start && minutes < end;
}