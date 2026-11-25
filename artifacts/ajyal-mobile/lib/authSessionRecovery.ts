import { supabase } from "./supabase";
import { withTimeout } from "./asyncTimeout";

const AUTH_SESSION_REFRESH_TIMEOUT_MS = 8_000;
let refreshPromise: Promise<boolean> | null = null;

export function refreshSupabaseSessionOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.refreshSession(),
          AUTH_SESSION_REFRESH_TIMEOUT_MS,
          "Supabase auth session refresh timed out",
        );
        return !error && !!data.session?.access_token;
      } catch (error) {
        console.warn("[auth] Supabase session refresh failed", error);
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function recoverSupabaseSessionAfter401(): Promise<boolean> {
  if (await refreshSupabaseSessionOnce()) return true;

  // The refresh token is gone or revoked. Clear only this device's local auth
  // state so persisted API caches stop surfacing as stale authenticated data.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    console.warn("[auth] local sign-out after failed refresh failed", error);
  }
  return false;
}
