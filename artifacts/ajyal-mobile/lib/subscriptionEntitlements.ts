export type SubscriptionRow = Record<string, unknown>;

function stringValue(row: SubscriptionRow, ...keys: string[]): string | null {
  for (const key of keys) {
    if (typeof row[key] === "string" && row[key]) return row[key] as string;
    if (typeof row[key] === "number" && Number.isFinite(row[key])) return String(row[key]);
  }
  return null;
}

function numberValue(row: SubscriptionRow, ...keys: string[]): number | null {
  for (const key of keys) {
    if (typeof row[key] === "number" && Number.isFinite(row[key])) return row[key] as number;
  }
  return null;
}

function booleanValue(row: SubscriptionRow, ...keys: string[]): boolean | null {
  for (const key of keys) {
    if (typeof row[key] === "boolean") return row[key] as boolean;
  }
  return null;
}

function mentionsAiTutor(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase();
  return normalized.includes("مدرس ذكي")
    || normalized.includes("مساعد التعلم")
    || normalized.includes("ai tutor")
    || normalized.includes("ai_tutor")
    || normalized.includes("ai-tutor");
}

export function hasAiTutorFeature(plan: SubscriptionRow): boolean {
  const declaredEntitlement = booleanValue(plan, "has_ai_tutor");
  // The database capability flag is authoritative. Do not let a stale
  // translated feature label override an explicit false value.
  if (declaredEntitlement !== null) return declaredEntitlement;

  const rawFeatures = plan.features;
  if (Array.isArray(rawFeatures)) {
    return rawFeatures.some((feature) => typeof feature === "string" && mentionsAiTutor(feature));
  }
  if (rawFeatures && typeof rawFeatures === "object") {
    return Object.entries(rawFeatures as Record<string, unknown>)
      .some(([feature, enabled]) => Boolean(enabled) && mentionsAiTutor(feature));
  }
  return typeof rawFeatures === "string" && mentionsAiTutor(rawFeatures);
}

export function isSubscriptionActive(subscription: SubscriptionRow, nowMs = Date.now()): boolean {
  if (booleanValue(subscription, "is_active") !== true) return false;
  if ((numberValue(subscription, "remaining_minutes", "remainingMinutes") ?? 0) <= 0) return false;

  const endsAt = stringValue(subscription, "ends_at", "endsAt");
  if (!endsAt) return true;
  const endsAtMs = new Date(endsAt).getTime();
  return Number.isFinite(endsAtMs) && endsAtMs > nowMs;
}

export function hasAiTutorEntitlement(subscriptions: SubscriptionRow[], plans: SubscriptionRow[], nowMs = Date.now()): boolean {
  const plansById = new Map(
    plans
      .map((plan) => [stringValue(plan, "id"), plan] as const)
      .filter((entry): entry is readonly [string, SubscriptionRow] => Boolean(entry[0])),
  );

  return subscriptions.some((subscription) => {
    if (!isSubscriptionActive(subscription, nowMs)) return false;
    const planId = stringValue(subscription, "plan_id", "planId");
    const plan = planId ? plansById.get(planId) : undefined;
    return Boolean(plan && hasAiTutorFeature(plan));
  });
}