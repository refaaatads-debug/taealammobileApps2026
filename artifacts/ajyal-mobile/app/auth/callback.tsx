import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import * as Linking from "expo-linking";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackScreen() {
  const colors = useColors();
  const { user, isLoading, isAuthenticated, isPasswordRecovery, beginPasswordRecovery, completePendingRole } = useAuth();
  const [roleError, setRoleError] = React.useState<string | null>(null);
  const [roleReady, setRoleReady] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const handleCallbackUrl = async (url: string | null) => {
      if (!url || !supabase) return;
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
        const session = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (session.error && active) setRoleError(session.error.message);
        return;
      }
      const code = query.get("code");
      if (code) {
        const exchange = await supabase.auth.exchangeCodeForSession(code);
        if (exchange.error && active) setRoleError(exchange.error.message);
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
          <Pressable onPress={retryPendingRole} style={[styles.retry, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>إعادة المحاولة</Text>
          </Pressable>
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