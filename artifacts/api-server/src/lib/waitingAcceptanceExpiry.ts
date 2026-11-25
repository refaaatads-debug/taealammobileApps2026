// PRODUCT DECISION PENDING: how long an instant-session invitation may stay in
// `waiting_acceptance` before it expires. No default is chosen; expiry is
// disabled until WAITING_ACCEPTANCE_EXPIRY_MINUTES is a positive integer.
export function readWaitingAcceptanceExpiryMinutes(raw: string | undefined = process.env.WAITING_ACCEPTANCE_EXPIRY_MINUTES): number | null {
  if (!raw) return null;
  const minutes = Number(raw);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 7 * 24 * 60 ? minutes : null;
}
