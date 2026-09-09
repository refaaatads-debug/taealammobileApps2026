import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Icon, Screen } from "@/components/AjyalUI";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type VerificationSnapshot = {
  activeSubscriptions: number;
  paymentRecords: number;
};

function queryValue(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export default function PaymentSuccessScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ payment?: string | string[]; status?: string | string[] }>();
  const [snapshot, setSnapshot] = useState<VerificationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = queryValue(params.payment) === "cancelled";

  const verifyFromPlatform = useCallback(async () => {
    if (!supabase || !user) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const [subscriptionsResult, paymentsResult] = await Promise.all([
        supabase
          .from("user_subscriptions")
          .select("id,is_active,remaining_minutes,ends_at")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .gt("remaining_minutes", 0)
          .or(`ends_at.is.null,ends_at.gt.${now}`),
        supabase
          .from("payment_records")
          .select("id")
          .eq("user_id", user.id)
          .limit(1),
      ]);
      if (subscriptionsResult.error) throw subscriptionsResult.error;
      if (paymentsResult.error) throw paymentsResult.error;
      setSnapshot({
        activeSubscriptions: subscriptionsResult.data?.length ?? 0,
        paymentRecords: paymentsResult.data?.length ?? 0,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر قراءة حالة الدفع من المنصة.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void verifyFromPlatform();
  }, [verifyFromPlatform]);

  const title = cancelled ? "تم إلغاء عملية الدفع" : "تمت العودة من بوابة الدفع";
  const body = cancelled
    ? "لم نغيّر اشتراكك. يمكنك العودة إلى صفحة الباقات والمحاولة لاحقاً."
    : "العودة من الرابط وحدها لا تثبت نجاح الدفع. نتحقق من حالة حسابك الحالية من منصة أجيال المعرفة.";

  return (
    <Screen contentStyle={styles.content}>
      <View style={[styles.iconWrap, { backgroundColor: cancelled ? colors.goldSoft : colors.tealSoft }]}>
        <Icon name={cancelled ? "x-circle" : "shield"} size={28} color={cancelled ? colors.accentForeground : colors.teal} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>{body}</Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {loading ? (
          <Text style={[styles.cardText, { color: colors.mutedForeground }]}>جارٍ التحقق من المنصة…</Text>
        ) : error ? (
          <>
            <Text style={[styles.cardTitle, { color: colors.destructive }]}>تعذر التحقق الآن</Text>
            <Text style={[styles.cardText, { color: colors.mutedForeground }]}>لم يتم تنفيذ أي تعديل على الاشتراك. أعد المحاولة عندما يتوفر الاتصال.</Text>
            <Pressable onPress={() => void verifyFromPlatform()} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>إعادة التحقق</Text>
            </Pressable>
          </>
        ) : snapshot?.activeSubscriptions ? (
          <>
            <Text style={[styles.cardTitle, { color: colors.teal }]}>يوجد اشتراك نشط مؤكد في حسابك</Text>
            <Text style={[styles.cardText, { color: colors.mutedForeground }]}>
              تم العثور على اشتراك فعال ورصيد موجب في المصدر. هذه القراءة لا تنشئ اشتراكاً جديداً ولا تثبت أن عملية العودة الحالية هي التي أنشأته.
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>لم يظهر اشتراك فعال بعد</Text>
            <Text style={[styles.cardText, { color: colors.mutedForeground }]}>
              لم نجد حالياً اشتراكاً فعالاً برصيد موجب. قد تحتاج المنصة إلى وقت لتأكيد النتيجة، أو قد تكون العملية أُلغيت أو لم تكتمل.
            </Text>
            <Pressable onPress={() => void verifyFromPlatform()} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>إعادة التحقق</Text>
            </Pressable>
          </>
        )}
      </View>

      <Pressable onPress={() => router.replace("/subscriptions")} style={[styles.secondaryButton, { borderColor: colors.border }]}>
        <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>العودة إلى الباقات</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: "stretch", paddingTop: 34 },
  iconWrap: { alignSelf: "center", width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center", writingDirection: "rtl", marginTop: 18 },
  body: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 23, textAlign: "center", writingDirection: "rtl", marginTop: 10 },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, marginTop: 24 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  cardText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 21, textAlign: "right", writingDirection: "rtl", marginTop: 9 },
  primaryButton: { minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 16 },
  primaryButtonText: { fontSize: 12, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 14 },
  secondaryButtonText: { fontSize: 12, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
});