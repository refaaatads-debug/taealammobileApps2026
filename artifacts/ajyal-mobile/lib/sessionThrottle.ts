export type RateLimitedQueue<T> = {
  enqueue: (value: T) => void;
  clear: () => void;
};

type ScheduleTimer = (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
type CancelTimer = (timer: ReturnType<typeof setTimeout>) => void;

export function createRateLimitedQueue<T>(
  send: (value: T) => void,
  intervalMs = 120,
  now: () => number = Date.now,
  schedule: ScheduleTimer = setTimeout,
  cancel: CancelTimer = clearTimeout,
): RateLimitedQueue<T> {
  const pending: T[] = [];
  let lastSentAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    if (!pending.length) return;

    if (lastSentAt !== null) {
      const remaining = intervalMs - (now() - lastSentAt);
      if (remaining > 0) {
        timer = schedule(flush, remaining);
        return;
      }
    }

    const next = pending.shift();
    if (next === undefined) return;
    try {
      send(next);
    } finally {
      lastSentAt = now();
      if (pending.length) timer = schedule(flush, intervalMs);
    }
  };

  return {
    enqueue(value) {
      pending.push(value);
      if (timer === null) {
        const delay = lastSentAt === null ? 0 : Math.max(0, intervalMs - (now() - lastSentAt));
        timer = schedule(flush, delay);
      }
    },
    clear() {
      pending.length = 0;
      if (timer !== null) cancel(timer);
      timer = null;
    },
  };
}
