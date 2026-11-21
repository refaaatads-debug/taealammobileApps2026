import { AppState } from "react-native";
import { supabase } from "./supabase";

let started = false;

/**
 * Keeps the realtime socket healthy:
 * - re-applies the user's access token to realtime after every token refresh,
 *   so row-level-security events keep flowing;
 * - reconnects the socket when the app returns to the foreground.
 */
export function startRealtimeKeeper(): void {
  const client = supabase;
  if (!client || started) return;
  started = true;
  client.auth.onAuthStateChange((event, session) => {
    if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && session?.access_token) {
      void client.realtime.setAuth(session.access_token);
    }
  });
  AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    try {
      if (!client.realtime.isConnected()) client.realtime.connect();
    } catch (error) {
      console.warn("[realtime] reconnect failed:", error instanceof Error ? error.message : error);
    }
  });
}
