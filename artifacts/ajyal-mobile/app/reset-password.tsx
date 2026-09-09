import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";
import { Header, Icon, Screen } from "@/components/AjyalUI";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordScreen() {
  const colors = useColors();
  const { isAuthenticated, isLoading, isPasswordRecovery, completePasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && !isAuthenticated) return <Redirect href="/" />;
  if (!isLoading && !isPasswordRecovery) return <Redirect href="/" />;

  const submit = async () => {
    if (!supabase || submitting) return;
    if (password.length < 8) {
      Alert.alert("كلمة المرور قصيرة", "استخدم 8 أحرف أو أكثر.");
      return;
    }
    if (password !== confirmation) {
      Alert.alert("كلمتا المرور غير متطابقتين", "أعد كتابة كلمة المرور نفسها.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await supabase.auth.updateUser({ password });
      if (result.error) throw result.error;
      completePasswordRecovery();
      Alert.alert("تم تحديث كلمة المرور", "يمكنك الآن استخدام كلمة المرور الجديدة.", [
        { text: "متابعة", onPress: () => router.replace("/") },
      ]);
    } catch (error) {
      Alert.alert("تعذر تحديث كلمة المرور", error instanceof Error ? error.message : "تحقق من الاتصال وحاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <Header title="تحديث كلمة المرور" eyebrow="أمان حسابك" onBack={() => router.replace("/")} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: colors.tealSoft }]}>
          <Icon name="lock" size={25} color={colors.teal} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>أنشئ كلمة مرور جديدة</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          اختر كلمة مرور جديدة لحماية حسابك، ثم تابع إلى مساحتك التعليمية.
        </Text>
        <TextInput
          testID="reset-password-input"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="كلمة المرور الجديدة"
          placeholderTextColor={colors.mutedForeground}
          textAlign="right"
          style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
        />
        <TextInput
          testID="reset-password-confirmation"
          value={confirmation}
          onChangeText={setConfirmation}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="تأكيد كلمة المرور"
          placeholderTextColor={colors.mutedForeground}
          textAlign="right"
          style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
        />
        <Pressable
          testID="save-reset-password"
          disabled={submitting}
          onPress={() => void submit()}
          style={[styles.button, { backgroundColor: submitting ? colors.muted : colors.primary }]}
        >
          {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>حفظ كلمة المرور</Text>}
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
  input: { minHeight: 49, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 12, fontFamily: "Inter_400Regular", writingDirection: "rtl", marginTop: 12 },
  button: { minHeight: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 14 },
  buttonText: { fontSize: 12, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
});