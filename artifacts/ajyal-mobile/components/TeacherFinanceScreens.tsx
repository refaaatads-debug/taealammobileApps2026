import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { EmptyState, Header, Icon, Screen, SectionHeading } from "@/components/AjyalUI";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { useAjyal } from "@/hooks/useAjyal";
import { supabase } from "@/lib/supabase";
import { customFetch } from "@workspace/api-client-react";
import { getSaudiMonthKey, getTeacherMonthlyEarningsSplit, getTeacherWithdrawalAmountError, groupTeacherEarningsByMonthAndType } from "@/lib/teacherFinance";

type Row = Record<string, unknown>;
type PickedAttachment = { name: string; uri: string; mimeType?: string | null };

function numeric(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return `${value.toFixed(2)} ر.س`;
}

function displayMoney(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
}

function dateTime(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("ar-SA") : "—";
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function earningTypeLabel(type: string): string {
  if (type === "bonus") return "مكافأة إضافية";
  if (type === "deduction") return "خصم";
  return "تحويل من أرباح الشهر";
}

function earningStatusLabel(statuses: Set<string>): string {
  if (statuses.size !== 1) return statuses.size > 1 ? "حالات متعددة" : "—";
  const status = [...statuses][0];
  const labels: Record<string, string> = {
    confirmed: "مسجلة",
    pending: "قيد المراجعة",
    paid: "مدفوعة",
    rejected: "مرفوضة",
  };
  return labels[status] ?? status;
}

function storagePath(value: string): string | null {
  const match = value.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/support-files\/(.+?)(?:\?|$)/);
  if (match) return decodeURIComponent(match[1]);
  return /^https?:\/\//i.test(value) ? null : value;
}

async function openWithdrawalAttachment(value: string, fileName: string) {
  try {
    const path = storagePath(value);
    const signedUrl = path && supabase
      ? (await supabase.storage.from("support-files").createSignedUrl(path, 60 * 60)).data?.signedUrl
      : null;
    await Linking.openURL(signedUrl ?? value);
  } catch (error) {
    Alert.alert("تعذر فتح المرفق", errorMessage(error, `تعذر فتح ${fileName}.`));
  }
}

function WithdrawalStatus({ status }: { status: unknown }) {
  const colors = useColors();
  const value = typeof status === "string" ? status : "pending";
  const map: Record<string, { label: string; color: string; background: string }> = {
    pending: { label: "قيد المراجعة", color: colors.accentForeground, background: colors.goldSoft },
    approved: { label: "تمت الموافقة", color: colors.teal, background: colors.tealSoft },
    processing: { label: "قيد الصرف", color: colors.accentForeground, background: colors.goldSoft },
    paid: { label: "تم الدفع", color: colors.primaryForeground, background: colors.primary },
    rejected: { label: "مرفوض", color: colors.destructive, background: colors.background },
    cancelled: { label: "ملغي", color: colors.mutedForeground, background: colors.muted },
  };
  const item = map[value] ?? map.pending;
  return <Text style={[styles.badge, { color: item.color, backgroundColor: item.background }]}>{item.label}</Text>;
}

export function TeacherWithdrawalsScreen({ title = "سحب الأرباح" }: { title?: string } = {}) {
  const colors = useColors();
  const { user } = useAuth();
  const { profile, role } = useAjyal();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [earningsLoadError, setEarningsLoadError] = useState<string | null>(null);
  const [earningsLoadWarning, setEarningsLoadWarning] = useState<string | null>(null);
  const [paymentsLoadError, setPaymentsLoadError] = useState<string | null>(null);
  const [cancellingWithdrawalId, setCancellingWithdrawalId] = useState<string | null>(null);
  const [available, setAvailable] = useState(0);
  const [paid, setPaid] = useState(0);
  const [monthNet, setMonthNet] = useState(0);
  const [monthOnline, setMonthOnline] = useState(0);
  const [monthInPerson, setMonthInPerson] = useState(0);
  const [monthCompensation, setMonthCompensation] = useState(0);
  const [minimum, setMinimum] = useState(100);
  const [withdrawals, setWithdrawals] = useState<Row[]>([]);
  const [earnings, setEarnings] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [withdrawalSummary, setWithdrawalSummary] = useState({
    pendingTotal: 0,
    reservedTotal: 0,
    adjustmentTotal: 0,
  });
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [attachment, setAttachment] = useState<PickedAttachment | null>(null);

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!supabase || !user || role !== "teacher") return;
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    const month = getSaudiMonthKey();
    const earningsPromise = (async () => {
      const fields = "amount,month,hours,created_at,status,earning_type,rollover_source_month";
      const result = await supabase.from("teacher_earnings" as any).select(fields).eq("teacher_id", user.id).order("created_at", { ascending: false });
      const issue = result.error as { message?: string; code?: string } | null;
      if (!issue || !`${issue.message ?? ""} ${issue.code ?? ""}`.includes("rollover_source_month")) {
        return { ...result, rolloverFieldUnavailable: false };
      }
      const fallback = await supabase.from("teacher_earnings" as any).select("amount,month,hours,created_at,status,earning_type").eq("teacher_id", user.id).order("created_at", { ascending: false });
      return { ...fallback, rolloverFieldUnavailable: !fallback.error };
    })();
    const [breakdown, settings, earningsResult, withdrawalsResult, paymentsResult, monthResult, withdrawalSummaryResult] = await Promise.all([
      supabase.rpc("get_teacher_earnings_breakdown", { _teacher_id: user.id }),
      supabase.from("financial_settings").select("min_withdrawal_amount").maybeSingle(),
      earningsPromise,
      supabase.from("withdrawal_requests").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("teacher_payments" as any).select("id,amount,created_at").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.rpc("get_teacher_month_earnings_split", { _teacher_id: user.id, _month: month }),
      supabase.rpc("get_teacher_withdrawal_summary" as any, { _teacher_id: user.id }),
    ]);
    const firstError = breakdown.error ?? settings.error ?? withdrawalsResult.error ?? monthResult.error ?? withdrawalSummaryResult.error;
    if (firstError) {
      const message = errorMessage(firstError, "تعذر تحميل بيانات الأرباح.");
      if (silent) setRefreshError(message);
      else setLoadError(message);
      setLoading(false);
      return;
    }
    setRefreshError(null);
    const summary = Array.isArray(breakdown.data) ? (breakdown.data[0] as Row | undefined) : breakdown.data as Row | null;
    const currentMonth = Array.isArray(monthResult.data) ? (monthResult.data[0] as Row | undefined) : monthResult.data as Row | null;
    const withdrawalSummaryRow = Array.isArray(withdrawalSummaryResult.data)
      ? (withdrawalSummaryResult.data[0] as Row | undefined)
      : withdrawalSummaryResult.data as Row | null;
    const availableBalance = numeric(withdrawalSummaryRow?.online_available);
    setAvailable(availableBalance);
    setWithdrawalAmount((current) => {
      const currentAmount = Number(current);
      return !current || !Number.isFinite(currentAmount) || currentAmount > availableBalance + 0.01
        ? availableBalance > 0 ? availableBalance.toFixed(2) : ""
        : current;
    });
    setPaid(numeric(withdrawalSummaryRow?.paid_total ?? summary?.paid_total));
    setWithdrawalSummary({
      pendingTotal: numeric(withdrawalSummaryRow?.pending_total),
      reservedTotal: numeric(withdrawalSummaryRow?.reserved_total),
      adjustmentTotal: numeric(withdrawalSummaryRow?.adjustment_total),
    });
    const monthlySplit = getTeacherMonthlyEarningsSplit(currentMonth);
    setMonthNet(monthlySplit.total);
    setMonthOnline(monthlySplit.online);
    setMonthInPerson(monthlySplit.inPerson);
    setMonthCompensation(monthlySplit.compensation);
    setMinimum(numeric((settings.data as Row | null)?.min_withdrawal_amount) || 100);
    setEarnings((earningsResult.data ?? []) as Row[]);
    setWithdrawals((withdrawalsResult.data ?? []) as Row[]);
    setPayments((paymentsResult.data ?? []) as Row[]);
    setEarningsLoadError(earningsResult.error ? errorMessage(earningsResult.error, "تعذر تحميل سجل الأرباح.") : null);
    setEarningsLoadWarning(earningsResult.rolloverFieldUnavailable ? "مصدر الترحيل الشهري غير متاح في قاعدة البيانات الحالية؛ عُرض سجل الأرباح الأساسي." : null);
    setPaymentsLoadError(paymentsResult.error ? errorMessage(paymentsResult.error, "تعذر تحميل سجل المدفوعات.") : null);
    setLoading(false);
  }, [role, user]);

  const cancelWithdrawal = (withdrawalId: string) => {
    const client = supabase;
    if (!client || cancellingWithdrawalId) return;
    Alert.alert("إلغاء طلب السحب؟", "سيُحرر المبلغ المحجوز ويعود إلى رصيدك المتاح.", [
      { text: "تراجع", style: "cancel" },
      {
        text: "إلغاء الطلب",
        style: "destructive",
        onPress: () => void (async () => {
          setCancellingWithdrawalId(withdrawalId);
          try {
            const result = await client.rpc("cancel_own_withdrawal_request" as any, { _withdrawal_id: withdrawalId });
            if (result.error) throw result.error;
            await load();
          } catch (error) {
            Alert.alert("تعذر إلغاء الطلب", errorMessage(error, "تحقق من الاتصال وحاول مرة أخرى."));
          } finally {
            setCancellingWithdrawalId(null);
          }
        })(),
      },
    ]);
  };

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const financeChannelId = useId().replace(/:/g, "");
  useEffect(() => {
    if (!supabase || !user || role !== "teacher") return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void load({ silent: true }); }, 250);
    };
    const channel = supabase.channel(`teacher-finance-mobile-${user.id}-${financeChannelId}`);
    for (const table of ["teacher_earnings", "withdrawal_requests", "teacher_payments"] as const) {
      channel.on("postgres_changes", {
        event: "*",
        schema: "public",
        table,
        filter: `teacher_id=eq.${user.id}`,
      }, refresh);
    }
    channel.subscribe();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase?.removeChannel(channel);
    };
  }, [financeChannelId, load, role, user]);

  const monthlyEarnings = useMemo(() => groupTeacherEarningsByMonthAndType(earnings), [earnings]);
  const withdrawalAmountError = getTeacherWithdrawalAmountError(withdrawalAmount, minimum, available);

  const pickAttachment = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAttachment({ name: asset.name, uri: asset.uri, mimeType: asset.mimeType });
    }
  };

  const submit = async () => {
    if (!supabase || !user || submitting) return;
    const amountError = getTeacherWithdrawalAmountError(withdrawalAmount, minimum, available);
    if (amountError) {
      const message = amountError === "below_minimum"
        ? `الحد الأدنى للسحب هو ${money(minimum)}.`
        : amountError === "exceeds_available"
          ? `مبلغ السحب أكبر من الرصيد المتاح (${money(available)}).`
          : "أدخل مبلغاً صحيحاً للسحب.";
      Alert.alert("تحقق من مبلغ السحب", message);
      return;
    }
    const amount = Number(withdrawalAmount);
    if (available <= 0) {
      Alert.alert("لا يوجد رصيد متاح", "لا يوجد رصيد أرباح قابل للسحب حالياً.");
      return;
    }
    if (available < minimum) {
      Alert.alert("الرصيد أقل من الحد الأدنى", `الحد الأدنى للسحب هو ${money(minimum)}.`);
      return;
    }
    setSubmitting(true);
    try {
      let attachmentUrl: string | null = null;
      let attachmentName: string | null = null;
      if (attachment) {
        const extension = attachment.name.includes(".") ? attachment.name.split(".").pop() : "bin";
        const path = `${user.id}/${Date.now()}.${extension}`;
        const bytes = await (await fetch(attachment.uri)).arrayBuffer();
        const upload = await supabase.storage.from("support-files").upload(path, bytes, {
          contentType: attachment.mimeType ?? undefined,
          upsert: false,
        });
        if (upload.error) throw upload.error;
         // support-files is private in production; persist the object path and
         // resolve a short-lived signed URL only when the teacher opens it.
         attachmentUrl = path;
        attachmentName = attachment.name;
      }
      const created = await supabase.from("withdrawal_requests").insert({
        teacher_id: user.id,
        amount,
        teacher_notes: notes.trim() || null,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
      }).select().single();
      if (created.error) throw created.error;
      const notificationInsert = await supabase.from("notifications").insert({
        user_id: user.id,
        title: "تم إرسال طلب سحب أرباح",
        body: `تم إرسال طلب سحب بمبلغ ${money(amount)} وسيتم مراجعته من قبل الإدارة.`,
        type: "withdrawal",
      });
      if (notificationInsert.error) {
        await customFetch<{ delivered: boolean }>("/api/push/notifications", {
          method: "POST",
          body: JSON.stringify({
            recipientId: user.id,
            title: "تم إرسال طلب سحب أرباح",
            body: `تم إرسال طلب سحب بمبلغ ${money(amount)} وسيتم مراجعته من قبل الإدارة.`,
            type: "withdrawal",
            route: "/notifications",
          }),
        }).catch(() => undefined);
      }
      setWithdrawalAmount("");
      setNotes("");
      setAttachment(null);
      Alert.alert("تم إرسال الطلب", "سيظهر تحديث الطلب هنا بعد مراجعته من الإدارة.");
      await load();
    } catch (error) {
      Alert.alert("تعذر إرسال طلب السحب", errorMessage(error, "حاول مرة أخرى."));
    } finally {
      setSubmitting(false);
    }
  };

  if (role !== "teacher") {
    return <Screen><Header title={title} onBack={() => router.back()} avatarText={profile?.displayName?.slice(0, 1)} /><EmptyState icon="shield" title="هذا القسم للمعلم" body="سحب الأرباح متاح لحسابات المعلمين فقط." /></Screen>;
  }

  return (
    <Screen>
      <Header title={title} eyebrow="أرباح التدريس" onBack={() => router.back()} avatarText={profile?.displayName?.slice(0, 1)} />
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.teal} /><Text style={[styles.muted, { color: colors.mutedForeground }]}>جارٍ تحميل الأرباح...</Text></View> : loadError ? <EmptyState icon="alert-circle" title="تعذر تحميل الأرباح" body={loadError} action="إعادة المحاولة" onAction={() => void load()} /> : (
        <>
          {refreshError ? <Text accessibilityRole="alert" style={[styles.hint, { color: colors.destructive }]}>{`تعذر تحديث البيانات تلقائيًا: ${refreshError}`}</Text> : null}
          <View style={styles.metricGrid}>
            <MetricCard label="إجمالي الأرباح المدفوعة" value={displayMoney(paid)} tone="navy" />
            <MetricCard label="الرصيد المتاح للسحب" value={displayMoney(available)} tone="teal" />
            <MetricCard
              label="إجمالي أرباح هذا الشهر"
              value={displayMoney(monthNet)}
              detail={`أونلاين ${displayMoney(monthOnline)} · حضوري ${displayMoney(monthInPerson)}${monthCompensation ? ` · تعويضات ${displayMoney(monthCompensation)}` : ""}`}
              tone="gold"
            />
          </View>
          <View style={styles.summaryGrid}>
            <MetricCard compact label="قيد المراجعة" value={displayMoney(withdrawalSummary.pendingTotal)} tone="gold" />
            <MetricCard compact label="محجوز لطلبات السحب" value={displayMoney(withdrawalSummary.reservedTotal)} tone="navy" />
            <MetricCard compact label="التعديلات والمكافآت والخصومات" value={displayMoney(withdrawalSummary.adjustmentTotal)} tone="teal" />
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              testID="withdrawal-amount"
              value={withdrawalAmount}
              onChangeText={setWithdrawalAmount}
              keyboardType="decimal-pad"
              editable={!submitting && available > 0}
              placeholder="مبلغ السحب"
              placeholderTextColor={colors.mutedForeground}
              textAlign="right"
              style={[styles.notes, { minHeight: 48, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              accessibilityLabel="مبلغ السحب بالريال السعودي"
            />
            <Text style={[styles.hint, { color: withdrawalAmountError ? colors.destructive : colors.mutedForeground }]}>
              {withdrawalAmountError === "below_minimum"
                ? `الحد الأدنى للسحب ${money(minimum)}.`
                : withdrawalAmountError === "exceeds_available"
                  ? `المبلغ يتجاوز الرصيد المتاح ${money(available)}.`
                  : `الحد الأدنى ${money(minimum)} · المتاح ${money(available)} · يمكنك طلب جزء من الرصيد.`}
            </Text>
            <TextInput value={notes} onChangeText={setNotes} multiline textAlign="right" placeholder="أضف ملاحظات مع طلب السحب (اختياري)" placeholderTextColor={colors.mutedForeground} style={[styles.notes, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
            <Pressable testID="withdrawal-attachment" onPress={() => void pickAttachment()} style={[styles.secondaryButton, { borderColor: colors.border }]}>
              <Icon name="paperclip" size={16} color={colors.teal} /><Text style={[styles.secondaryText, { color: colors.foreground }]}>{attachment?.name ?? "إرفاق ملف"}</Text>
            </Pressable>
            <Pressable testID="submit-withdrawal" disabled={submitting || available < minimum} onPress={() => void submit()} style={[styles.primaryButton, { backgroundColor: submitting || available < minimum ? colors.muted : colors.teal }]}>
              {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : <><Icon name="send" size={16} color={colors.primaryForeground} /><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>طلب سحب الأرباح</Text></>}
            </Pressable>
          </View>
          <SectionHeading title="سجل الأرباح المضافة" />
          {earningsLoadWarning ? <Text style={[styles.hint, { color: colors.accentForeground }]}>{earningsLoadWarning}</Text> : null}
          {earningsLoadError ? <EmptyState icon="alert-circle" title="تعذر تحميل سجل الأرباح" body={earningsLoadError} /> : !monthlyEarnings.length ? <EmptyState icon="briefcase" title="لا توجد أرباح مسجلة" body="ستظهر التحويلات الشهرية والمكافآت والخصومات المسجلة على حسابك هنا." /> : monthlyEarnings.map((item) => (
            <View key={`${item.month}:${item.earningType}:${item.rolloverSourceMonth ?? ""}`} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.rowValue, { color: colors.foreground }]}>{money(item.amount)}</Text>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                  {item.month} · {item.rolloverSourceMonth ? `ترحيل تلقائي من ${item.rolloverSourceMonth}` : earningTypeLabel(item.earningType)}
                </Text>
                <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                  {`${item.hours.toFixed(1)} ساعة · `}
                  {earningStatusLabel(item.statuses)}
                </Text>
              </View>
            </View>
          ))}
          <SectionHeading title="سجل طلبات السحب" />
          {!withdrawals.length ? <EmptyState icon="file-text" title="لا توجد طلبات سحب" body="ستظهر طلباتك السابقة وحالتها هنا." /> : withdrawals.map((row) => (
            <View key={String(row.id)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardTop}><WithdrawalStatus status={row.status} /><Text style={[styles.cardTitle, { color: colors.foreground }]}>{money(numeric(row.amount))}</Text></View>
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>{dateTime(row.created_at)}</Text>
              {typeof row.teacher_notes === "string" && row.teacher_notes ? <Text style={[styles.body, { color: colors.foreground }]}>{row.teacher_notes}</Text> : null}
              {typeof row.admin_notes === "string" && row.admin_notes ? <Text style={[styles.adminNote, { color: colors.primary, backgroundColor: colors.navySoft }]}>رد الإدارة: {row.admin_notes}</Text> : null}
              {typeof row.attachment_url === "string" && row.attachment_url ? <Pressable onPress={() => void openWithdrawalAttachment(row.attachment_url as string, typeof row.attachment_name === "string" ? row.attachment_name : "المرفق")}><Text style={[styles.link, { color: colors.teal }]}>{typeof row.attachment_name === "string" ? row.attachment_name : "فتح المرفق"}</Text></Pressable> : null}
              {row.status === "pending" ? <Pressable disabled={cancellingWithdrawalId === String(row.id)} onPress={() => cancelWithdrawal(String(row.id))} style={[styles.secondaryButton, { borderColor: colors.destructive, opacity: cancellingWithdrawalId === String(row.id) ? 0.55 : 1 }]}><Text style={[styles.secondaryText, { color: colors.destructive }]}>{cancellingWithdrawalId === String(row.id) ? "جارٍ الإلغاء..." : "إلغاء الطلب"}</Text></Pressable> : null}
            </View>
          ))}
          <SectionHeading title="المدفوعات المكتملة" />
          {paymentsLoadError ? <EmptyState icon="alert-circle" title="تعذر تحميل سجل المدفوعات" body={paymentsLoadError} /> : !payments.length ? <EmptyState icon="credit-card" title="لا توجد مدفوعات مسجلة" body="ستظهر هنا المبالغ التي سجلتها الإدارة كمدفوعة." /> : payments.map((row) => (
            <View key={String(row.id)} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.rowValue, { color: colors.teal }]}>{money(numeric(row.amount))}</Text>
              <View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>تم تسجيل الدفع</Text><Text style={[styles.muted, { color: colors.mutedForeground }]}>{dateTime(row.created_at)}</Text></View>
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

export function CallWalletScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { profile, role } = useAjyal();
  const params = useLocalSearchParams<{ topup?: string; session_id?: string }>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [logs, setLogs] = useState<Row[]>([]);
  const [amount, setAmount] = useState("50");

  const load = useCallback(async () => {
    if (!supabase || !user || role !== "teacher") return;
    setLoading(true);
    setError(null);
    const [walletResult, logsResult] = await Promise.all([
      supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("call_logs").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    const problem = walletResult.error ?? logsResult.error;
    if (problem) setError(errorMessage(problem, "تعذر تحميل محفظة الاتصال."));
    else {
      setBalance(numeric((walletResult.data as Row | null)?.balance));
      setLogs((logsResult.data ?? []) as Row[]);
    }
    setLoading(false);
  }, [role, user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (!supabase || params.topup !== "success" || !params.session_id) return;
    void (async () => {
      const result = await supabase.functions.invoke("wallet-topup-verify", { body: { sessionId: params.session_id } });
      if (result.error || !result.data?.success) Alert.alert("تعذر تأكيد الشحن", errorMessage(result.error, "حاول إعادة فتح المحفظة."));
      else {
        Alert.alert("تم شحن الرصيد", result.data.alreadyCredited ? "تم تأكيد هذا الشحن مسبقاً." : `تمت إضافة ${money(numeric(result.data.credited))}.`);
        await load();
      }
    })();
  }, [load, params.session_id, params.topup]);

  const topup = async () => {
    if (!supabase || busy) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 10 || value > 5000) {
      Alert.alert("مبلغ غير صالح", "أدخل مبلغاً بين 10 و5000 ريال.");
      return;
    }
    setBusy(true);
    try {
      const result = await supabase.functions.invoke("wallet-topup", { body: { amount: value } });
      if (result.error || typeof result.data?.url !== "string") throw result.error ?? new Error(result.data?.error ?? "تعذر فتح الدفع");
      await Linking.openURL(result.data.url);
    } catch (problem) {
      Alert.alert("تعذر فتح الدفع", errorMessage(problem, "حاول مرة أخرى."));
    } finally {
      setBusy(false);
    }
  };

  if (role !== "teacher") {
    return <Screen><Header title="محفظة الاتصال" onBack={() => router.back()} avatarText={profile?.displayName?.slice(0, 1)} /><EmptyState icon="shield" title="هذا القسم للمعلم" body="محفظة الاتصال متاحة لحسابات المعلمين فقط." /></Screen>;
  }

  return (
    <Screen>
      <Header title="محفظة الاتصال" eyebrow="المكالمات الهاتفية" onBack={() => router.back()} avatarText={profile?.displayName?.slice(0, 1)} />
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : error ? <EmptyState icon="alert-circle" title="تعذر تحميل المحفظة" body={error} action="إعادة المحاولة" onAction={() => void load()} /> : (
        <>
          <View style={[styles.walletHero, { backgroundColor: colors.navySoft, borderColor: colors.border }]}>
            <Icon name="credit-card" size={24} color={colors.primary} />
            <Text style={[styles.walletLabel, { color: colors.foreground }]}>رصيد المحفظة</Text>
            <Text style={[styles.walletAmount, { color: colors.primary }]}>{money(balance)}</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>سعر الدقيقة للمكالمات الهاتفية: 0.30 ريال</Text>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>شحن الرصيد</Text>
            <View style={styles.presetRow}>{[20, 50, 100, 200].map((value) => <Pressable key={value} onPress={() => setAmount(String(value))} style={[styles.preset, { borderColor: amount === String(value) ? colors.primary : colors.border, backgroundColor: amount === String(value) ? colors.navySoft : colors.background }]}><Text style={[styles.presetText, { color: amount === String(value) ? colors.primary : colors.foreground }]}>{value}</Text></Pressable>)}</View>
            <TextInput keyboardType="decimal-pad" value={amount} onChangeText={setAmount} textAlign="right" placeholder="المبلغ بالريال" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
            <Pressable testID="wallet-topup" disabled={busy} onPress={() => void topup()} style={[styles.primaryButton, { backgroundColor: busy ? colors.muted : colors.primary }]}>
              {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>شحن عبر Stripe</Text>}
            </Pressable>
          </View>
          <SectionHeading title="سجل المكالمات" />
          {!logs.length ? <EmptyState icon="phone" title="لا توجد مكالمات بعد" body="ستظهر المكالمات الهاتفية وتكلفتها هنا." /> : logs.map((row) => {
            const phone = typeof row.student_phone === "string" ? `••••${row.student_phone.slice(-4)}` : "—";
            const status = typeof row.status === "string" ? row.status : "—";
            return <View key={String(row.id)} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.rowValue, { color: colors.primary }]}>{money(numeric(row.cost))}</Text>
              <View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{phone}</Text><Text style={[styles.muted, { color: colors.mutedForeground }]}>{dateTime(row.created_at)} · {numeric(row.estimated_minutes)} د · {status === "initiated" ? "تم البدء" : status === "failed" ? "فشل" : status}</Text></View>
            </View>;
          })}
        </>
      )}
    </Screen>
  );
}

function MetricCard({ label, value, tone, detail, compact = false }: { label: string; value: string; tone: "navy" | "teal" | "gold"; detail?: string; compact?: boolean }) {
  const colors = useColors();
  const color = tone === "navy" ? colors.primary : tone === "teal" ? colors.teal : colors.accentForeground;
  const background = tone === "navy" ? colors.navySoft : tone === "teal" ? colors.tealSoft : colors.goldSoft;
  return <View style={[styles.metric, compact && styles.summaryMetric, { backgroundColor: background, borderColor: colors.border }]}><Text style={[styles.metricLabel, compact && styles.summaryLabel, { color: colors.mutedForeground }]}>{label}</Text><Text style={[styles.metricValue, compact && styles.summaryValue, { color }]}>{value}</Text>{detail ? <Text style={[styles.metricDetail, { color: colors.mutedForeground }]}>{detail}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  center: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 10 },
  metricGrid: { flexDirection: "row", gap: 7, marginBottom: 8 },
  summaryGrid: { flexDirection: "row", gap: 7, marginBottom: 14 },
  metric: { flex: 1, minHeight: 91, borderWidth: 1, borderRadius: 15, padding: 9, alignItems: "flex-end", justifyContent: "center" },
  summaryMetric: { minHeight: 65, padding: 7 },
  metricLabel: { fontSize: 9, lineHeight: 13, fontFamily: "Inter_500Medium", writingDirection: "rtl", textAlign: "right" },
  summaryLabel: { fontSize: 8, lineHeight: 11 },
  metricValue: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 4, textAlign: "right" },
  summaryValue: { fontSize: 13, marginTop: 3 },
  metricDetail: { fontSize: 7, lineHeight: 11, fontFamily: "Inter_400Regular", marginTop: 3, textAlign: "right", writingDirection: "rtl" },
  card: { borderWidth: 1, borderRadius: 18, padding: 15, marginBottom: 13 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 7 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  notes: { minHeight: 84, borderWidth: 1, borderRadius: 13, padding: 11, textAlignVertical: "top", fontFamily: "Inter_400Regular", fontSize: 12, writingDirection: "rtl" },
  secondaryButton: { minHeight: 43, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 10, paddingHorizontal: 10 },
  secondaryText: { fontSize: 11, fontFamily: "Inter_600SemiBold", maxWidth: "85%" },
  primaryButton: { minHeight: 47, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 12 },
  primaryText: { fontSize: 12, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  hint: { fontSize: 10, lineHeight: 17, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 8 },
  rowCard: { minHeight: 72, borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 9, flexDirection: "row", alignItems: "center", gap: 12 },
  rowCopy: { flex: 1, alignItems: "flex-end" },
  rowTitle: { fontSize: 12, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  rowValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
  muted: { fontSize: 10, lineHeight: 17, fontFamily: "Inter_400Regular", writingDirection: "rtl", textAlign: "right" },
  body: { fontSize: 11, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 8 },
  adminNote: { fontSize: 10, lineHeight: 17, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl", padding: 9, borderRadius: 10, marginTop: 8 },
  link: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "right", marginTop: 9 },
  badge: { overflow: "hidden", borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, fontSize: 9, fontFamily: "Inter_700Bold" },
  walletHero: { minHeight: 170, borderWidth: 1, borderRadius: 22, padding: 18, alignItems: "flex-end", marginBottom: 14 },
  walletLabel: { fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 12, writingDirection: "rtl" },
  walletAmount: { fontSize: 29, fontFamily: "Inter_700Bold", marginTop: 8 },
  presetRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  preset: { flex: 1, minHeight: 39, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  presetText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  input: { minHeight: 45, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, marginTop: 11, fontSize: 12, fontFamily: "Inter_500Medium" },
});