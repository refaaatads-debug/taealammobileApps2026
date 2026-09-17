import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import * as Linking from "expo-linking";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

const CALLBACK_TIMEOUT_MS = 15_000;
const CALLBACK_REQUEST_TIMEOUT_MS = 12_000;

function withCallbackTimeout<T>(promise: PromiseLike<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), CALLBACK_REQUEST_TIMEOUT_MS)),
  ]);
}

export default function AuthCallbackScreen() {
  const colors = useColors();
  const { user, isLoading, isAuthenticated, isPasswordRecovery, beginPasswordRecovery, completePendingRole, logout } = useAuth();
  const [roleError, setRoleError] = React.useState<string | null>(null);
  const [roleReady, setRoleReady] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const handledUrls = new Set<string>();
    const handleCallbackUrl = async (url: string | null) => {
      if (!url || !supabase || handledUrls.has(url)) return;
      handledUrls.add(url);
      try {
        const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
        const fragment = new URLSearchParams(hash);
        const query = new URL(url).searchParams;
        const type = fragment.get("type") ?? query.get("type");
        if (type === "recovery") beginPasswordRecovery();
        const callbackError = fragment.get("error_description") ?? fragment.get("error") ?? query.get("error_description") ?? query.get("error");
        if (callbackError) {
          if (active) setRoleError(callbackError);
          return;
        }
        const accessToken = fragment.get("access_token");
        const refreshToken = fragment.get("refresh_token");
        if (accessToken && refreshToken) {
          const session = await withCallbackTimeout(
            supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            }),
            "انتهت مهلة تأكيد جلسة المصادقة",
          );
          if (session.error && active) setRoleError(session.error.message);
          return;
        }
        const code = query.get("code");
        if (code) {
          const exchange = await withCallbackTimeout(
            supabase.auth.exchangeCodeForSession(code),
            "انتهت مهلة تأكيد جلسة Google",
          );
          if (exchange.error) {
            // Native Google auth may redeem the PKCE code in the browser
            // session while Expo Router also receives this deep link.
            const current = await withCallbackTimeout(
              supabase.auth.getSession(),
              "انتهت مهلة قراءة جلسة المصادقة",
            );
            if (!current.data.session && active) setRoleError(exchange.error.message);
          }
        }
      } catch (error) {
        if (active) setRoleError(error instanceof Error ? error.message : "تعذر إكمال تسجيل الدخول");
      }
    };
    void Linking.getInitialURL().then(handleCallbackUrl).catch((error) => {
      if (active) setRoleError(error instanceof Error ? error.message : "تعذر قراءة رابط المصادقة");
    });
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleCallbackUrl(url);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [beginPasswordRecovery]);

  React.useEffect(() => {
    if (isAuthenticated || isPasswordRecovery || roleReady || roleError) return;
    const timeout = setTimeout(() => {
      setRoleError("لم تصل استجابة المصادقة من المنصة في الوقت المتوقع.");
    }, CALLBACK_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [isAuthenticated, isPasswordRecovery, roleError, roleReady]);

  React.useEffect(() => {
    if (isLoading || !isAuthenticated || isPasswordRecovery) return;
    void completePendingRole(user?.email)
      .then(() => setRoleReady(true))
      .catch((error) => setRoleError(error instanceof Error ? error.message : "تعذر إكمال إعداد الحساب"));
  }, [completePendingRole, isAuthenticated, isLoading, isPasswordRecovery, user?.email]);
  const retryPendingRole = () => {
    setRoleError(null);
    void completePendingRole(user?.email)
      .then(() => setRoleReady(true))
      .catch((error) => setRoleError(error instanceof Error ? error.message : "تعذر إكمال إعداد الحساب"));
  };

  if (!isLoading && isAuthenticated && isPasswordRecovery) return <Redirect href="/reset-password" />;
  if (!isLoading && isAuthenticated && roleReady) return <Redirect href="/" />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {roleError ? (
        <>
          <Text style={[styles.label, { color: colors.destructive }]}>{roleError}</Text>
          {isAuthenticated ? (
            <Pressable onPress={retryPendingRole} style={[styles.retry, { backgroundColor: colors.primary }]}>
              <Text style={[styles.retryText, { color: colors.primaryForeground }]}>إعادة المحاولة</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                void logout().finally(() => router.replace("/"));
              }}
              style={[styles.retry, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.retryText, { color: colors.primaryForeground }]}>العودة لتسجيل الدخول</Text>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.label, { color: colors.mutedForeground }]}>جارٍ إكمال تسجيل الدخول...</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  label: { fontSize: 14, textAlign: "center", writingDirection: "rtl" },
  retry: { borderRadius: 12, paddingHorizontal: 22, paddingVertical: 11 },
  retryText: { fontSize: 14, fontWeight: "700" },
});