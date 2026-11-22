import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Header, Screen } from "@/components/AjyalUI";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";

export default function DeleteAccountScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { t } = useAppPreferences();
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"loading" | "idle" | "sending" | "pending" | "error">("loading");

  useEffect(() => {
    if (!user?.id) { setState("idle"); return; }
    supabase.from("account_deletion_requests").select("id").eq("user_id", user.id).eq("status", "pending").limit(1)
      .then(({ data }) => setState(data && data.length ? "pending" : "idle"), () => setState("idle"));
  }, [user?.id]);

  const send = async () => {
    if (!user?.id) return;
    setState("sending");
    const { error } = await supabase.from("account_deletion_requests").insert({ user_id: user.id, email: user.email ?? null, reason: reason.trim() || null });
    setState(error ? "error" : "pending");
  };

  const confirm = () =>
    Alert.alert(
      t("حذف الحساب", "Delete account"),
      t("سيتم إرسال طلب لمراجعته من الإدارة. الحذف نهائي ويشمل الدقائق المتبقية في باقتك.", "A request will be sent for admin review. Deletion is permanent and includes your remaining plan minutes."),
      [{ text: t("إلغاء", "Cancel"), style: "cancel" }, { text: t("إرسال الطلب", "Send request"), style: "destructive", onPress: () => void send() }],
    );

  const body = [
    t("تراجع الإدارة طلبك وتؤكد الحذف، وقد نتواصل معك للتحقق من هويتك.", "Admins review your request and confirm the deletion. We may contact you to verify your identity."),
    t("نزيل بياناتك الشخصية: الاسم والبريد والهاتف والرسائل والملفات المرفوعة.", "We remove your personal data: name, email, phone, messages and uploaded files."),
    t("قد نحتفظ لفترة محدودة بسجلات الحجوزات والمدفوعات بالقدر الذي يفرضه النظام.", "We may keep booking and payment records for a limited time where the law requires it."),
    t("تسجيلات الجلسات تُحذف تلقائيًا بعد 7 أيام.", "Session recordings are deleted automatically after 7 days."),
    t("يمكنك أيضًا الطلب من ajyalalmaerifa.com/delete-account", "You can also request it at ajyalalmaerifa.com/delete-account"),
  ];

  return (
    <Screen>
      <Header onBack={() => router.back()} eyebrow={t("بياناتك بيدك", "Your data")} title={t("حذف الحساب", "Delete account")} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {body.map((line) => (
          <Text key={line} style={[styles.line, { color: colors.mutedForeground }]}>{"\u2022 "}{line}</Text>
        ))}
      </View>
      {state === "loading" ? <ActivityIndicator color={colors.primary} /> : state === "pending" ? (
        <Text style={[styles.done, { color: colors.foreground }]}>{t("طلب الحذف قيد المراجعة.", "Your deletion request is under review.")}</Text>
      ) : (
        <View style={styles.form}>
          <TextInput value={reason} onChangeText={setReason} maxLength={500} multiline placeholder={t("سبب الحذف (اختياري)", "Reason (optional)")} placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} />
          {state === "error" ? <Text style={{ color: "#dc2626", textAlign: "center" }}>{t("تعذر إرسال الطلب، حاول مرة أخرى.", "Could not send the request, try again.")}</Text> : null}
          <Pressable disabled={state === "sending"} onPress={confirm} style={[styles.btn, { backgroundColor: "#dc2626", opacity: state === "sending" ? 0.6 : 1 }]}>
            <Text style={styles.btnText}>{t("إرسال طلب حذف حسابي", "Request account deletion")}</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  line: { fontSize: 14, lineHeight: 22 },
  form: { gap: 12, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 80, textAlignVertical: "top" },
  btn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  done: { marginTop: 16, textAlign: "center", fontWeight: "700" },
});
