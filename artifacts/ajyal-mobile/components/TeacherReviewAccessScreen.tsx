import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND_ICON, Icon } from "@/components/AjyalUI";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import { useColors } from "@/hooks/useColors";

type Props = {
  status: "pending" | "rejected";
  onRetry: () => void;
  onLogout: () => void;
};

export default function TeacherReviewAccessScreen({ status, onRetry, onLogout }: Props) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const insets = useSafeAreaInsets();
  const rejected = status === "rejected";

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }]}>
      <View style={[styles.brandRow, { flexDirection: direction === "rtl" ? "row" : "row-reverse" }]}>
        <View style={[styles.logoFrame, { backgroundColor: colors.primary }]}>
          <Image source={BRAND_ICON} style={styles.logo} accessibilityLabel={t("شعار أجيال المعرفة", "Ajyal Knowledge logo")} />
        </View>
        <View style={[styles.brandCopy, { alignItems: direction === "rtl" ? "flex-end" : "flex-start" }]}>
          <Text style={[styles.brandName, { color: colors.foreground, writingDirection: direction }]}>{t("أجيال المعرفة", "Ajyal Knowledge")}</Text>
          <Text style={[styles.brandTagline, { color: colors.mutedForeground, writingDirection: direction }]}>{t("نتعلم اليوم، نصنع الغد", "Learn today, shape tomorrow")}</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.iconFrame, { backgroundColor: rejected ? colors.accent : colors.tealSoft }]}>
          <Icon name={rejected ? "alert-triangle" : "shield"} size={28} color={rejected ? colors.accentForeground : colors.teal} />
        </View>
        <Text style={[styles.eyebrow, { color: rejected ? colors.accentForeground : colors.teal, writingDirection: direction }]}>{rejected ? t("يتطلب الحساب إجراءً", "Action required") : t("خطوة قبل بداية التدريس", "One step before teaching")}</Text>
        <Text style={[styles.title, { color: colors.foreground, writingDirection: direction }]}>{rejected ? t("تم رفض اعتماد حساب المعلم", "Teacher account approval was rejected") : t("حساب المعلم قيد المراجعة", "Teacher account under review")}</Text>
        <Text style={[styles.body, { color: colors.mutedForeground, writingDirection: direction }]}>
          {rejected
            ? t("راجعت الإدارة طلبك ولم تعتمد الحساب. راجع بياناتك وتواصل مع الدعم لمعرفة سبب الرفض والخطوات المطلوبة.", "The administration reviewed your request but did not approve the account. Review your details and contact support to learn why and what to do next.")
            : t("يمكنك استكمال ملفك المهني وبياناتك البنكية والتواصل مع الدعم حتى تعتمد الإدارة حسابك.", "You can complete your professional and bank details and contact support while the team reviews your account.")}
        </Text>

        <View style={styles.actions}>
          <Pressable
            testID="teacher-review-profile"
            accessibilityRole="button"
            onPress={() => router.push("/profile")}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
          >
            <Icon name="edit-3" size={17} color={colors.primaryForeground} />
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground, writingDirection: direction }]}>{rejected ? t("مراجعة بيانات المعلم", "Review teacher details") : t("استكمال ملف المعلم", "Complete teacher profile")}</Text>
          </Pressable>
          <Pressable
            testID="teacher-review-support"
            accessibilityRole="button"
            onPress={() => router.push("/support")}
            style={({ pressed }) => [styles.secondaryButton, { backgroundColor: colors.tealSoft, borderColor: colors.teal }, pressed && styles.pressed]}
          >
            <Icon name="message-circle" size={17} color={colors.teal} />
            <Text style={[styles.secondaryButtonText, { color: colors.teal, writingDirection: direction }]}>{t("التواصل مع الدعم", "Contact support")}</Text>
          </Pressable>
          <Pressable
            testID="teacher-review-refresh"
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
          >
            <Icon name="refresh-cw" size={15} color={colors.mutedForeground} />
            <Text style={[styles.refreshText, { color: colors.mutedForeground, writingDirection: direction }]}>{t("تحديث حالة الاعتماد", "Refresh approval status")}</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        testID="teacher-review-logout"
        accessibilityRole="button"
        onPress={onLogout}
        style={({ pressed }) => [styles.logoutButton, { borderColor: colors.border }, pressed && styles.pressed]}
      >
        <Icon name="log-out" size={16} color={colors.mutedForeground} />
        <Text style={[styles.logoutText, { color: colors.mutedForeground, writingDirection: direction }]}>{t("تسجيل الخروج", "Sign out")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22 },
  brandRow: { width: "100%", maxWidth: 390, alignItems: "center", gap: 9 },
  logoFrame: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  logo: { width: 30, height: 30, borderRadius: 9 },
  brandCopy: { flex: 1, gap: 1 },
  brandName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  brandTagline: { fontSize: 9, fontFamily: "Inter_400Regular" },
  card: { width: "100%", maxWidth: 390, borderRadius: 24, borderWidth: 1, paddingHorizontal: 19, paddingVertical: 22, alignItems: "center", shadowColor: "#173E8C", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  iconFrame: { width: 60, height: 60, borderRadius: 21, alignItems: "center", justifyContent: "center", marginBottom: 15 },
  eyebrow: { fontSize: 10, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 7 },
  title: { fontSize: 22, lineHeight: 30, fontFamily: "Inter_700Bold", textAlign: "center" },
  body: { maxWidth: 320, fontSize: 12, lineHeight: 21, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 9 },
  actions: { width: "100%", gap: 9, marginTop: 20 },
  primaryButton: { minHeight: 48, borderRadius: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryButtonText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  secondaryButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryButtonText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  refreshButton: { minHeight: 34, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6 },
  refreshText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  logoutButton: { minHeight: 42, minWidth: 132, borderWidth: 1, borderRadius: 13, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 },
  logoutText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  pressed: { opacity: 0.72 },
});