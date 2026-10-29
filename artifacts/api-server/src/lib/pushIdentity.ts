import type { PlatformRole } from "./supabaseAuth";

export function hasPushEligibleRole(roles: readonly PlatformRole[]): boolean {
  return roles.includes("student") || roles.includes("teacher");
}

export function canUseLegacyNotificationFallback(
  userId: string,
  recipientId: string,
  type: string,
  matchingNotificationId: string | null,
): boolean {
  const authenticatedUserId = userId.trim();
  if (type === "withdrawal") {
    return Boolean(authenticatedUserId && recipientId.trim() === authenticatedUserId);
  }
  return Boolean(matchingNotificationId?.trim());
}

const CALLER_ID_FIELDS = ["caller_id", "from_user_id"] as const;
const RECIPIENT_ID_FIELDS = ["callee_id", "receiver_id", "to_user_id", "student_id"] as const;

function consistentAliasValue(
  row: Record<string, unknown>,
  fields: readonly string[],
): string | null {
  const values: string[] = [];
  for (const field of fields) {
    const raw = row[field];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string" || !raw.trim()) return null;
    values.push(raw.trim());
  }
  return values.length > 0 && values.every((value) => value === values[0])
    ? values[0]
    : null;
}

export function incomingCallRowMatches(
  row: unknown,
  callId: string,
  callerId: string,
  recipientId: string,
): boolean {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const record = row as Record<string, unknown>;
  const storedCallId = typeof record.id === "string" ? record.id.trim() : "";
  return Boolean(
    callId.trim()
    && storedCallId === callId.trim()
    && callerId.trim()
    && recipientId.trim()
    && consistentAliasValue(record, CALLER_ID_FIELDS) === callerId.trim()
    && consistentAliasValue(record, RECIPIENT_ID_FIELDS) === recipientId.trim(),
  );
}