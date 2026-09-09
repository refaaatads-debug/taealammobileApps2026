import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Header, Icon, Screen } from "@/components/AjyalUI";
import { useColors } from "@/hooks/useColors";
import { getAuthRedirectUri } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!supabase || submitting) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      Alert.alert("البريد الإلكتروني مطلوب", "أدخل بريد الحساب لاستلام رابط استعادة كلمة المرور.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: getAuthRedirectUri() });
      if (result.error) throw result.error;
      setSent(true);
    } catch (error) {
      Alert.alert("تعذر إرسال الرابط", error instanceof Error ? error.message : "تحقق من الاتصال وحاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <Header title="استعادة كلمة المرور" eyebrow="أمان حسابك" onBack={() => router.back()} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: colors.tealSoft }]}>
          <Icon name="lock" size={25} color={colors.teal} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>هل نسيت كلمة المرور؟</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          أدخل بريدك الإلكتروني وسنرسل لك رابطاً آمناً لاستعادة الدخول إلى حسابك.
        </Text>
        {sent ? (
          <View style={[styles.success, { backgroundColor: colors.tealSoft }]}>
            <Icon name="check-circle" size={20} color={colors.teal} />
            <Text style={[styles.successText, { color: colors.teal }]}>
              تم إرسال الرابط. تحقق من بريدك الإلكتروني واتبع التعليمات.
            </Text>
          </View>
        ) : (
          <>
            <TextInput
              testID="forgot-password-email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="البريد الإلكتروني"
              placeholderTextColor={colors.mutedForeground}
              textAlign="right"
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            />
            <Pressable
              testID="send-reset-link"
              disabled={submitting}
              onPress={() => void submit()}
              style={[styles.button, { backgroundColor: submitting ? colors.muted : colors.primary }]}
            >
              {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : <><Icon name="send" size={16} color={colors.primaryForeground} /><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>إرسال رابط الاستعادة</Text></>}
            </Pressable>
          </>
        )}
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={[styles.backText, { color: colors.teal }]}>العودة إلى تسجيل الدخول</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", paddingHorizontal: 20, paddingBottom: 24 },
  card: { width: "100%", borderWidth: 1, borderRadius: 23, padding: 20, alignItems: "stretch" },
  icon: { width: 58, height: 58, borderRadius: 19, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 15 },
  title: { fontSize: 21, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  body: { fontSize: 12, lineHeight: 20, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 8 },
  input: { minHeight: 49, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 12, fontFamily: "Inter_400Regular", writingDirection: "rtl", marginTop: 20 },
  button: { minHeight: 48, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 12 },
  buttonText: { fontSize: 12, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  success: { borderRadius: 14, padding: 13, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 20 },
  successText: { flex: 1, fontSize: 11, lineHeight: 18, fontFamily: "Inter_600SemiBold", textAlign: "right", writingDirection: "rtl" },
  back: { alignItems: "center", marginTop: 19 },
  backText: { fontSize: 11, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
});