import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "ajyal.push.debug.v1";
const MAX_ENTRIES = 20;

/**
 * Keeps the last few push-registration steps on the device (never the token
 * itself) so a failure that was previously silent can be read back later.
 */
export function recordPushDebug(step: string, detail?: Record<string, unknown>): void {
  const entry = { at: new Date().toISOString(), step, ...(detail ?? {}) };
  console.info("[push-debug]", entry);
  void AsyncStorage.getItem(KEY)
    .then((raw) => {
      let list: unknown[] = [];
      try { list = raw ? JSON.parse(raw) : []; } catch { list = []; }
      const next = [...(Array.isArray(list) ? list : []), entry].slice(-MAX_ENTRIES);
      return AsyncStorage.setItem(KEY, JSON.stringify(next));
    })
    .catch(() => undefined);
}

export async function readPushDebug(): Promise<unknown[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
