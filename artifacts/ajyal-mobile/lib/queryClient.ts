import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { focusManager, QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient.
 * - Data is considered fresh for 30s, then refetched when a screen mounts,
 *   when the app returns to the foreground, or when the network reconnects.
 * - Lists that must never look stale (bookings, requests, sessions) set
 *   refetchOnMount: "always" on their own queries.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

let focusWired = false;
/** React Native has no window focus: tell React Query when the app is foregrounded. */
export function wireFocusManager(): void {
  if (focusWired || Platform.OS === "web") return;
  focusWired = true;
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener("change", (state) => {
      handleFocus(state === "active");
    });
    return () => sub.remove();
  });
}

// ---- Persisted query cache (fast startup) --------------------------------
// Only the user's own lists are kept, scoped to one user id, and wiped on logout.
const CACHE_KEY = "ajyal.queryCache.v1";
const PERSIST_PREFIXES = [
  "/api/me",
  "/api/sessions",
  "/api/booking-requests",
  "/api/student/dashboard",
  "/api/assignments",
  "/api/notifications",
];
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type PersistedEntry = { key: unknown[]; data: unknown; at: number };
type PersistedCache = { userId: string; entries: PersistedEntry[] };

function shouldPersist(key: readonly unknown[]): boolean {
  const first = key[0];
  return typeof first === "string" && PERSIST_PREFIXES.some((p) => first === p || first.startsWith(`${p}/`));
}

export async function hydrateQueryCache(userId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PersistedCache;
    if (parsed.userId !== userId) {
      await AsyncStorage.removeItem(CACHE_KEY);
      return;
    }
    const now = Date.now();
    for (const entry of parsed.entries ?? []) {
      if (!Array.isArray(entry.key) || now - entry.at > MAX_AGE_MS) continue;
      if (queryClient.getQueryData(entry.key) !== undefined) continue;
      // updatedAt in the past keeps the data "stale", so a refetch still runs.
      queryClient.setQueryData(entry.key, entry.data, { updatedAt: entry.at });
    }
  } catch (error) {
    console.warn("[cache] Could not restore saved data:", error instanceof Error ? error.message : error);
  }
}

export async function clearPersistedQueryCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistUserId: string | null = null;

export function setPersistUser(userId: string | null): void {
  persistUserId = userId;
}

/** Save the whitelisted queries shortly after they change. */
export function startQueryPersistence(): () => void {
  const flush = () => {
    persistTimer = null;
    const userId = persistUserId;
    if (!userId) return;
    const entries: PersistedEntry[] = [];
    for (const query of queryClient.getQueryCache().getAll()) {
      if (query.state.status !== "success" || query.state.data === undefined) continue;
      if (!shouldPersist(query.queryKey)) continue;
      entries.push({ key: [...query.queryKey], data: query.state.data, at: query.state.dataUpdatedAt });
    }
    const payload: PersistedCache = { userId, entries };
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload)).catch(() => undefined);
  };
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    if (persistTimer) return;
    persistTimer = setTimeout(flush, 2_000);
  });
  return () => {
    unsubscribe();
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
  };
}
