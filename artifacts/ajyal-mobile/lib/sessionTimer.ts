export type SessionTimerSync = {
  elapsed: number;
  paused: boolean;
};

export function parseSessionTimerSync(message: unknown): SessionTimerSync | null {
  if (!message || typeof message !== "object") return null;
  const value = message as { type?: unknown; elapsed?: unknown; paused?: unknown };
  if (value.type !== "timer-sync" || typeof value.elapsed !== "number" || !Number.isFinite(value.elapsed)) {
    return null;
  }
  return {
    elapsed: Math.max(0, Math.floor(value.elapsed)),
    paused: value.paused === true,
  };
}

export function isSessionTimerPeerReady(input: {
  connectionState: string;
  transportProvider: string | null;
  remoteUid: string | number | null;
}): boolean {
  if (input.connectionState !== "connected") return false;
  return input.transportProvider !== "agora" || input.remoteUid !== null;
}

export function getFinalSessionElapsed(snapshot: {
  endedAt?: string | null;
  durationSeconds?: number | null;
}): number | null {
  if (!snapshot.endedAt || typeof snapshot.durationSeconds !== "number" || !Number.isFinite(snapshot.durationSeconds)) {
    return null;
  }
  return Math.max(0, Math.floor(snapshot.durationSeconds));
}
