export type InPersonBookingSnapshot = {
  instruction_duration_minutes?: unknown;
  balance_cost_minutes?: unknown;
  in_person_student_value_sar?: unknown;
  in_person_teacher_rate_sar?: unknown;
  in_person_platform_share_sar?: unknown;
  in_person_pricing_source?: unknown;
};

function nonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function getInPersonBookingSnapshot(booking: InPersonBookingSnapshot) {
  return {
    instructionMinutes: nonNegativeNumber(booking.instruction_duration_minutes),
    packageMinutes: nonNegativeNumber(booking.balance_cost_minutes),
    studentValueSar: nonNegativeNumber(booking.in_person_student_value_sar),
    teacherRateSar: nonNegativeNumber(booking.in_person_teacher_rate_sar),
    platformShareSar: nonNegativeNumber(booking.in_person_platform_share_sar),
    pricingSource: typeof booking.in_person_pricing_source === "string" && booking.in_person_pricing_source.trim()
      ? booking.in_person_pricing_source
      : null,
  };
}
