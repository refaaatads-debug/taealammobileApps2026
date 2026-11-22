import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

/**
 * Lightweight self-hosted error reporting. Errors go to our own database
 * (public.log_client_error), so there is no third-party account or key.
 * Never throws, never blocks the UI, and is rate limited on the device.
 */
const MAX_PER_SESSION = 25;
const DEDUPE_MS = 60_000;
let sent = 0;
const recent = new Map<string, number>();
let installed = false;

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack };
  if (typeof error === 'string') return { message: error };
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

export function reportError(error: unknown, context?: Record<string, unknown>, kind = 'js'): void {
  try {
    if (!supabase || sent >= MAX_PER_SESSION) return;
    const { message, stack } = describe(error);
    const key = `${kind}:${message}`.slice(0, 200);
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUPE_MS) return;
    recent.set(key, now);
    sent += 1;
    void Promise.resolve(
      supabase.rpc('log_client_error', {
        p_kind: kind,
        p_message: message,
        p_stack: stack ?? null,
        p_app_version: Constants.expoConfig?.version ?? null,
        p_platform: Platform.OS,
        p_os_version: String(Platform.Version ?? ''),
        p_context: context ?? null,
      }),
    ).catch(() => undefined);
  } catch {
    // reporting must never break the app
  }
}

/** Catches uncaught JS errors (fatal and non fatal). Call once at startup. */
export function installGlobalErrorReporting(): void {
  if (installed) return;
  installed = true;
  const errorUtils = (globalThis as any).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;
  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    reportError(error, { isFatal: Boolean(isFatal) }, isFatal ? 'fatal' : 'js');
    previous?.(error, isFatal);
  });
}
