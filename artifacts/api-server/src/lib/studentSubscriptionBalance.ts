/**
 * Keep the dashboard balance eligibility aligned with the mobile plan screen:
 * an active flag and remaining minutes determine usable balance. ends_at is
 * retained for display/history and must not hide a still-active subscription.
 */
export const activeStudentSubscriptionFilters = {
  is_active: "eq.true",
  remaining_minutes: "gt.0",
} as const;
