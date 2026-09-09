import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const REMEMBERED_LOGIN_KEY = "ajyal.remembered-login.v1";

export async function clearRememberedLogin(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      await AsyncStorage.removeItem(REMEMBERED_LOGIN_KEY);
    } else {
      await SecureStore.deleteItemAsync(REMEMBERED_LOGIN_KEY);
    }
  } catch {
    // A storage cleanup failure must not block the login screen.
  }
}