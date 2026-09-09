import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { unregisterPushToken } from "@workspace/api-client-react";
import { supabase, supabaseConfigError } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export type AuthUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isPasswordRecovery: boolean;
  beginPasswordRecovery: () => void;
  login: (mode?: 'login' | 'signup', role?: 'student' | 'teacher', credentials?: { email: string; password: string; fullName?: string }) => Promise<void>;
  loginWithGoogle: (role?: 'student' | 'teacher', isSignup?: boolean) => Promise<void>;
  completePendingRole: (authenticatedEmail?: string | null) => Promise<void>;
  completePasswordRecovery: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isPasswordRecovery: false,
  beginPasswordRecovery: () => undefined,
  login: async () => undefined,
  loginWithGoogle: async () => undefined,
  completePendingRole: async () => undefined,
  completePasswordRecovery: () => undefined,
  logout: async () => undefined,
});

export async function getAuthToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("انتهت مهلة الاتصال بالمنصة")), 12_000)),
    ]);
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function mapUser(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): AuthUser {
  const metadata = user.user_metadata ?? {};
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  const [firstName, ...lastNameParts] = fullName.split(/\s+/).filter(Boolean);
  return {
    id: user.id,
    email: user.email ?? null,
    firstName: typeof metadata.first_name === "string" ? metadata.first_name : firstName ?? null,
    lastName: typeof metadata.last_name === "string" ? metadata.last_name : lastNameParts.join(" ") || null,
    profileImageUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
  };
}

const NATIVE_SCHEME = "ajyalalmaerifa";
const PENDING_ROLE_KEY = "pending_role";
const PENDING_ROLE_EMAIL_KEY = "pending_role_email";

export function getAuthRedirectUri(): string {
  return Platform.OS === "web"
    ? AuthSession.makeRedirectUri({ path: "auth/callback" })
    : AuthSession.makeRedirectUri({
        scheme: NATIVE_SCHEME,
        path: "auth/callback",
      });
}

function getGoogleRedirectUri(): string {
  return getAuthRedirectUri();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const authStateVersion = React.useRef(0);
  const deferSignedInUser = React.useRef(false);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    let mounted = true;
    const initialSessionVersion = authStateVersion.current;
    void Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("انتهت مهلة الاتصال بالمنصة")), 12_000)),
    ])
      .then(({ data }) => {
        const stale = authStateVersion.current !== initialSessionVersion;
        if (!mounted || stale) return;
        setUser(data.session?.user ? mapUser(data.session.user) : null);
      })
      .catch((error) => {
        if (!mounted) return;
        console.warn("[auth] Initial session could not be loaded:", error instanceof Error ? error.message : error);
        setUser(null);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      authStateVersion.current += 1;
      if (_event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);
      if (_event === "SIGNED_OUT") setIsPasswordRecovery(false);
      if (_event === "SIGNED_IN" && deferSignedInUser.current) {
        setIsLoading(true);
        return;
      }
      setUser(session?.user ? mapUser(session.user) : null);
      setIsLoading(false);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (
    mode: 'login' | 'signup' = 'login',
    role: 'student' | 'teacher' = 'student',
    credentials?: { email: string; password: string; fullName?: string },
  ) => {
    if (!supabase) throw new Error(supabaseConfigError ?? "Supabase is not configured");
    if (!credentials?.email || !credentials.password) {
      throw new Error("أدخل البريد الإلكتروني وكلمة المرور أولاً");
    }
    const normalizedEmail = credentials.email.trim().toLowerCase();
    authStateVersion.current += 1;
    if (mode === "signup" && role === "teacher") {
      await AsyncStorage.setItem(PENDING_ROLE_KEY, "teacher");
      await AsyncStorage.setItem(PENDING_ROLE_EMAIL_KEY, normalizedEmail);
      deferSignedInUser.current = true;
    } else if (mode === "signup") {
      await AsyncStorage.removeItem(PENDING_ROLE_KEY);
      await AsyncStorage.removeItem(PENDING_ROLE_EMAIL_KEY);
    }
    const result = mode === "signup"
      ? await supabase.auth.signUp({
          email: normalizedEmail,
          password: credentials.password,
          options: {
            data: {
              full_name: credentials.fullName?.trim() || undefined,
              role,
            },
          },
        })
      : await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: credentials.password,
        });
    if (result.error) {
      deferSignedInUser.current = false;
      await AsyncStorage.multiRemove([PENDING_ROLE_KEY, PENDING_ROLE_EMAIL_KEY]);
      throw new Error(result.error.message);
    }
    if (mode === "signup" && !result.data.session) {
      deferSignedInUser.current = false;
      throw new Error("تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتفعيل الدخول.");
    }
    if (result.data.user) {
      try {
        // A teacher signup must finish the deferred role handoff before the
        // profile query is enabled. Otherwise /me can return 403 once and
        // leave the app stuck on the account-verification screen.
        if (mode === "signup" || mode === "login") {
          await completePendingRole(result.data.user.email ?? normalizedEmail);
        }
      } catch (error) {
        setIsLoading(false);
        throw error;
      } finally {
        deferSignedInUser.current = false;
      }
      // Do not wait for the auth event callback to update the navigation tree.
      // Some native Supabase storage adapters deliver that event after the
      // bootstrap query has already started, which leaves the app on its
      // loading screen after a successful password login.
      setUser(mapUser(result.data.user));
      setIsLoading(false);
    }
  }, []);

  const completePendingRole = useCallback(async (authenticatedEmail?: string | null) => {
    if (!supabase) throw new Error(supabaseConfigError ?? "Supabase is not configured");
    const pendingRole = await AsyncStorage.getItem(PENDING_ROLE_KEY);
    if (pendingRole !== "teacher") return;
    const pendingEmail = await AsyncStorage.getItem(PENDING_ROLE_EMAIL_KEY);
    const normalizedAuthenticatedEmail = authenticatedEmail?.trim().toLowerCase() ?? "";
    if (pendingEmail && pendingEmail !== normalizedAuthenticatedEmail) {
      // Never allow a deferred teacher role to follow a different account.
      // Clear the stale handoff so a later login cannot inherit it.
      await AsyncStorage.multiRemove([PENDING_ROLE_KEY, PENDING_ROLE_EMAIL_KEY]);
      return;
    }
    const { error } = await supabase.rpc("set_new_user_role", { _role: "teacher" });
    if (error) throw new Error(`تعذر تثبيت دور المعلم: ${error.message}`);
    await AsyncStorage.removeItem(PENDING_ROLE_KEY);
    await AsyncStorage.removeItem(PENDING_ROLE_EMAIL_KEY);
  }, []);

  const loginWithGoogle = useCallback(async (role?: 'student' | 'teacher', isSignup = false) => {
    if (!supabase) throw new Error(supabaseConfigError ?? "Supabase is not configured");
    if (isSignup && role === "teacher") {
      await AsyncStorage.setItem(PENDING_ROLE_KEY, "teacher");
      deferSignedInUser.current = true;
      await AsyncStorage.removeItem(PENDING_ROLE_EMAIL_KEY);
    } else {
      await AsyncStorage.removeItem(PENDING_ROLE_KEY);
      await AsyncStorage.removeItem(PENDING_ROLE_EMAIL_KEY);
    }
    const redirectTo = getGoogleRedirectUri();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        scopes: "openid email profile",
        skipBrowserRedirect: Platform.OS !== "web",
      },
    });
    if (error) {
      deferSignedInUser.current = false;
      await AsyncStorage.multiRemove([PENDING_ROLE_KEY, PENDING_ROLE_EMAIL_KEY]);
      throw new Error(error.message);
    }
    if (Platform.OS === "web") return;
    try {
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success") throw new Error("تم إلغاء تسجيل الدخول");
      const callbackUrl = new URL(result.url);
      const callbackError = callbackUrl.searchParams.get("error_description") ?? callbackUrl.searchParams.get("error");
      if (callbackError) throw new Error(callbackError);
      const code = callbackUrl.searchParams.get("code");
      if (code) {
        const exchange = await supabase.auth.exchangeCodeForSession(code);
        if (exchange.error) throw new Error(exchange.error.message);
        await completePendingRole(exchange.data.session?.user.email);
        if (exchange.data.session?.user) {
          deferSignedInUser.current = false;
          setUser(mapUser(exchange.data.session.user));
          setIsLoading(false);
        }
        return;
      }
      const accessToken = callbackUrl.hash.match(/(?:^|&)access_token=([^&]+)/)?.[1];
      const refreshToken = callbackUrl.hash.match(/(?:^|&)refresh_token=([^&]+)/)?.[1];
      if (accessToken && refreshToken) {
        const session = await supabase.auth.setSession({
          access_token: decodeURIComponent(accessToken),
          refresh_token: decodeURIComponent(refreshToken),
        });
        if (session.error) throw new Error(session.error.message);
        await completePendingRole(session.data.session?.user.email);
        if (session.data.session?.user) {
          deferSignedInUser.current = false;
          setUser(mapUser(session.data.session.user));
          setIsLoading(false);
        }
        return;
      }
      throw new Error("لم تصل استجابة تسجيل الدخول من المنصة");
    } catch (error) {
      deferSignedInUser.current = false;
      setIsLoading(false);
      await AsyncStorage.multiRemove([PENDING_ROLE_KEY, PENDING_ROLE_EMAIL_KEY]);
      throw error;
    } finally {
      WebBrowser.dismissBrowser();
    }
  }, [completePendingRole]);

  const completePasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);
  const beginPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(true);
  }, []);

  const logout = useCallback(async () => {
    // Update the UI immediately. Local auth cleanup must not hold the user
    // inside the account screen while SecureStore or the network responds.
    authStateVersion.current += 1;
    setUser(null);
    // Push-token cleanup is best-effort and must not block signing out.
    if (supabase) {
      void unregisterPushToken().catch(() => undefined);
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error && error.message !== "Auth session missing!") {
        console.warn("[auth] Local sign-out cleanup failed:", error.message);
      }
    }
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, isPasswordRecovery, beginPasswordRecovery, login, loginWithGoogle, completePendingRole, completePasswordRecovery, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}