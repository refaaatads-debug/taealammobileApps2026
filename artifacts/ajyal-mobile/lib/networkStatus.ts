import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { supabaseUrl } from '@/lib/supabase';

/**
 * Connectivity detection without a native module: a tiny reachability probe
 * against our own server. Runs only while the app is in the foreground.
 * It also tells React Query when we are offline so it stops hammering and
 * refetches as soon as we are back.
 */
type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();
let online = true;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let failures = 0;

function setOnline(value: boolean) {
  if (value === online) return;
  online = value;
  onlineManager.setOnline(value);
  listeners.forEach((l) => l(value));
}

async function probe(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    await fetch(`${supabaseUrl}/auth/v1/health?_=${Date.now()}`, { method: 'GET', signal: controller.signal });
    return true; // any HTTP answer means the network works
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function schedule(delay: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    if (AppState.currentState !== 'active') return schedule(30_000);
    const ok = await probe();
    failures = ok ? 0 : failures + 1;
    // two failed probes in a row before declaring offline (avoids flicker)
    if (ok) setOnline(true);
    else if (failures >= 2) setOnline(false);
    schedule(ok ? 30_000 : 5_000);
  }, delay);
}

export function startNetworkMonitor(): void {
  if (started || Platform.OS === 'web') return;
  started = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') schedule(500);
  });
  schedule(3_000);
}

/** Call when a request fails with a network error to re-check sooner. */
export function noteNetworkFailure(): void {
  if (started) schedule(300);
}

export function useIsOnline(): boolean {
  const [value, setValue] = useState(online);
  useEffect(() => {
    listeners.add(setValue);
    setValue(online);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
