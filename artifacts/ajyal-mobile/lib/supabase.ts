import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { isProfileUiTestMode } from "./profileTestPolicy";
import { createChunkedSecureStorage } from "./chunkedSecureStorage";

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://ajyalalmaerifa.com";
export const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const profileUiTestMode = isProfileUiTestMode(
  __DEV__,
  Platform.OS,
  process.env.EXPO_PUBLIC_PROFILE_TEST_MODE,
);

const nativeSecureStorage = createChunkedSecureStorage(SecureStore);
const secureStorage = Platform.OS === "web"
  ? AsyncStorage
  : nativeSecureStorage;

export const supabase = !profileUiTestMode && supabasePublishableKey
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