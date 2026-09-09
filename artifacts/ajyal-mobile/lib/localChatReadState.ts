import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "ajyal:chat-read:";
const MAX_STORED_MESSAGE_IDS = 5000;
const listeners = new Set<(userId: string) => void>();

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export async function getReadChatMessageIds(userId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export async function markChatMessagesRead(userId: string, messageIds: string[]) {
  const ids = [...new Set(messageIds.filter(Boolean))];
  if (!ids.length) return;
  const readIds = await getReadChatMessageIds(userId);
  const previousSize = readIds.size;
  ids.forEach((id) => readIds.add(id));
  if (readIds.size === previousSize) return;

  const storedIds = [...readIds].slice(-MAX_STORED_MESSAGE_IDS);
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(storedIds));
  } catch {
    return;
  }
  listeners.forEach((listener) => listener(userId));
}

export function subscribeToChatReadState(listener: (userId: string) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}