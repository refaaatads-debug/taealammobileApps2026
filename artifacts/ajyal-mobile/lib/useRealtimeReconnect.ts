import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks a realtime channel and asks the owning effect to re-subscribe
 * (by bumping `tick`) with exponential backoff when it errors or times out.
 * `down` is true while the channel is not subscribed, for a visible banner.
 */
export function useRealtimeReconnect() {
  const [tick, setTick] = useState(0);
  const [down, setDown] = useState(false);
  const attempts = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onStatus = useCallback((status: string) => {
    if (status === "SUBSCRIBED") {
      attempts.current = 0;
      setDown(false);
      return;
    }
    if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT" && status !== "CLOSED") return;
    setDown(true);
    if (timer.current) return;
    const delay = Math.min(3_000 * 2 ** attempts.current, 30_000);
    attempts.current += 1;
    timer.current = setTimeout(() => {
      timer.current = null;
      setTick((value) => value + 1);
    }, delay);
  }, []);

  return { tick, down, onStatus };
}
