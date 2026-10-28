import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { useColors } from "@/hooks/useColors";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import { Icon } from "@/components/AjyalUI";

type Props = { visible: boolean; studentId: string; studentName: string; bookingId?: string | null; onClose: () => void };
const ended = ["completed", "failed", "canceled"];
export function MaskedPhoneCallModal({ visible, studentId, studentName, bookingId, onClose }: Props) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const [balance, setBalance] = useState(0);
  const [price, setPrice] = useState(0.3);
  const [minutes, setMinutes] = useState(5);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [status, setStatus] = useState("idle");
  const [cost, setCost] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  useEffect(() => {
    if (!visible || !supabase) return;
    const client = supabase;
    let current = true;
    setLoading(true); setBusy(false); setMinutes(5); setCallId(null); setStatus("idle");
    setCost(0); setDuration(0); setOwnerId(null); setBalance(0);
    void client.auth.getUser().then(async ({ data, error }) => {
      if (error || !data.user) throw new Error("Authentication required");
      const id = data.user.id;
      const [wallet, settings] = await Promise.all([
        client.from("wallets").select("balance").eq("user_id", id).maybeSingle(),
        client.from("site_settings").select("value").eq("key", "call_price_per_minute").maybeSingle(),
      ]);
      if (!current) return;
      if (wallet.error) throw wallet.error;
      setOwnerId(id); setBalance(Number(wallet.data?.balance || 0));
      const configured = Number.parseFloat(String(settings.data?.value ?? ""));
      setPrice(Number.isFinite(configured) && configured >= 0 ? configured : 0.3);
    }).catch(() => {
      if (current) Alert.alert(t("تعذر تحميل المحفظة", "Could not load wallet"));
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [visible, studentId, bookingId]);
  useEffect(() => {
    if (!visible || !callId || !supabase || ended.includes(status)) return;
    const client = supabase;
    let current = true;
    const refresh = async () => {
      const { data, error } = await client.from("teacher_call_history")
        .select("status,cost,duration_minutes").eq("id", callId).maybeSingle();
      if (!current || error || !data) return;
      setStatus(String(data.status)); setCost(Number(data.cost || 0)); setDuration(Number(data.duration_minutes || 0));
      if (ended.includes(String(data.status)) && ownerId) {
        const wallet = await client.from("wallets").select("balance").eq("user_id", ownerId).maybeSingle();
        if (current && !wallet.error) setBalance(Number(wallet.data?.balance || 0));
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 3000);
    return () => { current = false; clearInterval(timer); };
  }, [visible, callId, status, ownerId]);
  const required = Math.round(minutes * price * 100) / 100;
  const start = async () => {
    if (!supabase || !ownerId || busy || callId || balance < required) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("make-phone-call", {
        body: { studentId, bookingId: bookingId || undefined, estimatedMinutes: minutes },
      });
      if (error || !data?.success || !data.callLogId) throw new Error("Call failed");
      setCallId(String(data.callLogId)); setStatus("initiated");
      setCost(Number(data.cost)); setBalance(Number(data.newBalance));
    } catch {
      Alert.alert(t("تعذر بدء الاتصال", "Could not start call"),
        t("تحقق من الحجز ورصيد المحفظة ثم حاول مجدداً.", "Check your booking and wallet balance, then retry."));
    } finally { setBusy(false); }
  };
  const copyStyle = { color: colors.foreground, writingDirection: direction, textAlign: direction === "rtl" ? "right" as const : "left" as const };
  const statusText = status === "in_progress" ? t("المكالمة جارية", "Call connected")
    : status === "completed" ? t("انتهت المكالمة", "Call completed")
      : status === "failed" || status === "canceled" ? t("تعذر الاتصال أو أُلغي", "Call failed or canceled")
        : t("جارٍ الاتصال بالطرفين", "Calling both participants");
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.header}><Icon name="shield" size={24} color={colors.teal} />
        <Text style={[styles.title, copyStyle]}>{t("اتصال هاتفي برقم مخفي", "Masked phone call")}</Text>
        <Pressable onPress={onClose} disabled={busy}><Icon name="x" size={22} color={colors.foreground} /></Pressable></View>
      <Text style={copyStyle}>{studentName}</Text>
      <Text style={[styles.body, copyStyle]}>{t("تتصل المنصة بالطرفين دون كشف رقم الطالب أو المعلم.", "The platform calls both participants without revealing either number.")}</Text>
      {loading ? <ActivityIndicator color={colors.teal} /> : <>
        <Text style={copyStyle}>{t("رصيد المحفظة", "Wallet balance")}: {balance.toFixed(2)} · {t("سعر الدقيقة", "Price per minute")}: {price.toFixed(2)} {t("ريال", "SAR")}</Text>
        {callId ? <View style={styles.details}><Text style={[styles.title, copyStyle]}>{statusText}</Text>
          <Text style={copyStyle}>{ended.includes(status) ? t("التكلفة المسجلة", "Recorded cost") : t("المبلغ المحجوز", "Reserved amount")}: {cost.toFixed(2)} {t("ريال", "SAR")}</Text>
          {ended.includes(status) && <Text style={copyStyle}>{t("المدة بالدقائق", "Duration in minutes")}: {duration.toFixed(1)}</Text>}
        </View> : <>
          <Text style={copyStyle}>{t("المدة المقدرة بالدقائق", "Estimated minutes")}</Text>
          <TextInput accessibilityLabel={t("المدة المقدرة بالدقائق", "Estimated minutes")} keyboardType="number-pad" value={String(minutes)}
            onChangeText={(value) => setMinutes(Math.min(60, Math.max(1, Number(value.replace(/\D/g, "")) || 1)))}
            style={[styles.input, copyStyle, { borderColor: colors.border }]} />
          <Text style={[styles.body, copyStyle]}>{t("المبلغ المحجوز", "Reserved amount")}: {required.toFixed(2)} {t("ريال، وتُسوّى التكلفة حسب المدة الفعلية.", "SAR. The final cost follows the actual duration.")}</Text>
          {balance < required && <Text style={{ color: colors.destructive }}>{t("الرصيد غير كافٍ. اشحن محفظة المكالمات أولاً.", "Insufficient balance. Top up your call wallet first.")}</Text>}
          <Pressable testID="confirm-masked-phone-call" disabled={busy || !ownerId || balance < required} onPress={() => void start()}
            style={[styles.button, { backgroundColor: busy || !ownerId || balance < required ? colors.muted : colors.primary }]}>
            {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground }}>{t("تأكيد الاتصال المخفي", "Confirm masked call")}</Text>}
          </Pressable>
        </>}
      </>}
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#0008", justifyContent: "flex-end", padding: 18 },
  card: { borderRadius: 24, padding: 20, gap: 14 }, header: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 17, fontWeight: "700", flexShrink: 1 }, body: { fontSize: 13, lineHeight: 22 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12 }, details: { gap: 10, paddingVertical: 14 },
  button: { padding: 15, borderRadius: 13, alignItems: "center" },
});
