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
  transportProvider: "agora" | "unknown" | null;
  remoteUid: string | number | null;
  // True once a timer-sync from the teacher arrived through the realtime channel.
  // That message proves the teacher is in the session even when Agora has not reported a
  // remote user yet (a web teacher with the mic never opened is not reported by Agora).
  teacherSyncSeen?: boolean;
}): boolean {
  // Our own transport must be up (connecting covers a brief reconnect).
  if (input.connectionState !== "connected" && input.connectionState !== "connecting") return false;
  if (input.transportProvider !== "agora") return false;
  return input.remoteUid !== null || input.teacherSyncSeen === true;
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
