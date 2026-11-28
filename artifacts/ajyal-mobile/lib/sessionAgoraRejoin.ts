// Backoff policy for rejoining an Agora session after the SDK's own
// reconnection gives up (ConnectionStateFailed) or stays disconnected.
// Kept pure so the policy is unit-testable without the Agora SDK.
export const AGORA_REJOIN_MAX_ATTEMPTS = 6;
export const AGORA_REJOIN_BASE_DELAY_MS = 2_000;
export const AGORA_REJOIN_MAX_DELAY_MS = 15_000;
// How long a hard disconnect may last before the app rejoins with a fresh
// token. The Agora SDK keeps trying on its own during this window.
export const AGORA_DISCONNECTED_WATCHDOG_MS = 20_000;

export function agoraRejoinDelayMs(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  return Math.min(AGORA_REJOIN_BASE_DELAY_MS * 2 ** safeAttempt, AGORA_REJOIN_MAX_DELAY_MS);
}

export function agoraRejoinExhausted(attempts: number): boolean {
  return attempts >= AGORA_REJOIN_MAX_ATTEMPTS;
}
