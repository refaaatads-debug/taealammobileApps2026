export type DeliveryMode = "online" | "in_person";

export function normalizeDeliveryMode(value: unknown): DeliveryMode | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[-\s]/gu, "_");
  if (normalized === "in_person" || normalized === "inperson" || normalized === "حضوري") {
    return "in_person";
  }
  if (normalized === "online" || normalized === "اونلاين" || normalized === "أونلاين") {
    return "online";
  }
  return undefined;
}

export function resolveSessionDeliveryMode(
  apiMode: unknown,
  bookingMode: unknown,
): DeliveryMode | undefined {
  return normalizeDeliveryMode(bookingMode) ?? normalizeDeliveryMode(apiMode);
}
