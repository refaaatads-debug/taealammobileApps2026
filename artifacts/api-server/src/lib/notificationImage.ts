const IMAGE_FIELD_PATTERN = /(image|photo|picture|banner|thumbnail)/i;
const URL_FIELD_PATTERN = /^(url|uri|href|src|signedurl|publicurl|downloadurl)$/i;
const MAX_NESTING_DEPTH = 5;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function httpsImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 4_096) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return candidate;
  } catch {
    return null;
  }
}

function findUrlInImageValue(value: unknown, depth: number): string | null {
  if (depth > MAX_NESTING_DEPTH) return null;

  const directUrl = httpsImageUrl(value);
  if (directUrl) return directUrl;

  const record = asRecord(value);
  if (record) {
    for (const [key, nestedValue] of Object.entries(record)) {
      if (URL_FIELD_PATTERN.test(key.replace(/[^a-z0-9]/gi, ""))) {
        const url = httpsImageUrl(nestedValue);
        if (url) return url;
      }
    }
    for (const nestedValue of Object.values(record)) {
      const url = findUrlInImageValue(nestedValue, depth + 1);
      if (url) return url;
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const nestedValue of value.slice(0, 12)) {
      const url = findUrlInImageValue(nestedValue, depth + 1);
      if (url) return url;
    }
  }
  return null;
}

/**
 * Notification rows have been created by more than one platform producer.
 * Resolve common image fields and nested metadata without relying on one
 * producer-specific column name.
 */
export function findNotificationImageUrl(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;

  for (const [key, fieldValue] of Object.entries(record)) {
    if (IMAGE_FIELD_PATTERN.test(key)) {
      const url = findUrlInImageValue(fieldValue, 0);
      if (url) return url;
    }
  }

  for (const nestedValue of Object.values(record)) {
    const nestedRecord = asRecord(nestedValue);
    if (nestedRecord) {
      const url = findNotificationImageUrl(nestedRecord);
      if (url) return url;
    } else if (Array.isArray(nestedValue)) {
      for (const item of nestedValue.slice(0, 12)) {
        const url = findNotificationImageUrl(item);
        if (url) return url;
      }
    } else if (typeof nestedValue === "string") {
      const parsed = asRecord(nestedValue);
      if (parsed) {
        const url = findNotificationImageUrl(parsed);
        if (url) return url;
      }
    }
  }
  return null;
}
