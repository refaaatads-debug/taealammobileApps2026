import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://ajyalalmaerifa.com";
export const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const secureStorage = {
  getItem: async (key: string) => {
    if (Platform.OS === "web") return AsyncStorage.getItem(key);

    const stored = await SecureStore.getItemAsync(key);
    if (!stored?.startsWith("ajyal-secure-chunks:v1:")) return stored;

    const count = Number(stored.slice("ajyal-secure-chunks:v1:".length));
    if (!Number.isInteger(count) || count < 1) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${key}.chunk.${index}`)),
    );
    return chunks.every((chunk) => chunk !== null) ? chunks.join("") : null;
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === "web") {
      await AsyncStorage.setItem(key, value);
      return;
    }

    const previous = await SecureStore.getItemAsync(key);
    if (previous?.startsWith("ajyal-secure-chunks:v1:")) {
      const count = Number(previous.slice("ajyal-secure-chunks:v1:".length));
      if (Number.isInteger(count) && count > 0) {
        await Promise.all(
          Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(`${key}.chunk.${index}`)),
        );
      }
    }

    // Android SecureStore commonly limits one value to roughly 2 KB. Supabase
    // sessions can exceed that limit, so split them into individually secure
    // values instead of allowing persistence to fail silently.
    const maxChunkLength = 400;
    if (value.length <= maxChunkLength) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const chunks = Array.from(
      { length: Math.ceil(value.length / maxChunkLength) },
      (_, index) => value.slice(index * maxChunkLength, (index + 1) * maxChunkLength),
    );
    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(`${key}.chunk.${index}`, chunk)),
    );
    await SecureStore.setItemAsync(key, `ajyal-secure-chunks:v1:${chunks.length}`);
  },
  removeItem: async (key: string) => {
    if (Platform.OS === "web") {
      await AsyncStorage.removeItem(key);
      return;
    }

    const stored = await SecureStore.getItemAsync(key);
    await SecureStore.deleteItemAsync(key);
    if (!stored?.startsWith("ajyal-secure-chunks:v1:")) return;

    const count = Number(stored.slice("ajyal-secure-chunks:v1:".length));
    if (Number.isInteger(count) && count > 0) {
      await Promise.all(
        Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(`${key}.chunk.${index}`)),
      );
    }
  },
};

export const supabase = supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === "web",
        flowType: "pkce",
      },
    })
  : null;

export const supabaseConfigError = supabasePublishableKey
  ? null
  : "تعذر إعداد اتصال المنصة. أضف مفتاح Supabase القابل للنشر إلى بيئة التطبيق.";