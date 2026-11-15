import type { SessionLifecycleSnapshot } from './sessionLifecycle';

export type SessionEndBroadcast = {
  by: string;
  elapsed: number;
};

export function createSessionEndBroadcast(
  userId: string | null | undefined,
  elapsed: number,
): SessionEndBroadcast | null {
  if (!userId || !Number.isFinite(elapsed) || elapsed < 0) return null;
  return { by: userId, elapsed: Math.floor(elapsed) };
}

export function isSessionEndBroadcastFromPeer(
  payload: unknown,
  currentUserId: string | null | undefined,
  peerUserId: string | null | undefined,
): payload is SessionEndBroadcast {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const message = payload as Record<string, unknown>;
  return Boolean(
    currentUserId
    && peerUserId
    && currentUserId !== peerUserId
    && message.by === peerUserId
    && typeof message.elapsed === 'number'
    && Number.isFinite(message.elapsed)
    && message.elapsed >= 0,
  );
}

type WaitForSessionEndOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export async function waitForSessionEndConfirmation(
  readLifecycle: () => Promise<SessionLifecycleSnapshot | null>,
  isEnded: (snapshot: SessionLifecycleSnapshot) => boolean,
  {
    timeoutMs = 15_000,
    pollIntervalMs = 500,
    now = Date.now,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  }: WaitForSessionEndOptions = {},
): Promise<SessionLifecycleSnapshot | null> {
  const deadline = now() + Math.max(0, timeoutMs);
  while (now() <= deadline) {
    let snapshot: SessionLifecycleSnapshot | null = null;
    try {
      snapshot = await readLifecycle();
    } catch {
      // Keep checking the authoritative platform state until the deadline.
    }
    if (isEnded(snapshot ?? {})) return snapshot;

    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(Math.max(1, pollIntervalMs), remaining));
  }
  return null;
}
