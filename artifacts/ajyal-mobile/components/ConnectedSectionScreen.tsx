import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useAjyal } from "@/hooks/useAjyal";
import { EmptyState, Header, Icon, Screen, SectionHeading } from "@/components/AjyalUI";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import { hasAiTutorFeature, isSubscriptionActive } from "@/lib/subscriptionEntitlements";

type Row = Record<string, unknown>;
type AiReport = Row & {
  summary?: unknown;
  performance_score?: unknown;
  quality_score?: unknown;
  usefulness_score?: unknown;
  data_level?: unknown;
  duration_minutes?: unknown;
  teacher_speaking_minutes?: unknown;
  student_speaking_minutes?: unknown;
  total_messages?: unknown;
  teacher_messages_count?: unknown;
  student_messages_count?: unknown;
  total_silence_seconds?: unknown;
  extracted_topics?: unknown;
  detected_questions?: unknown;
  gap_warnings?: unknown;
  generated_at?: unknown;
};
type ConnectedSection = "subscriptions" | "subscription" | "invoices" | "wallet" | "materials" | "teacher-materials";
type ConsumptionRecord = {
  id: string;
  subjectName: string;
  teacherName: string;
  actualMinutes: number;
  shortSession: boolean;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
};

function text(row: Row, ...keys: string[]): string | null {
  for (const key of keys) {
    if (typeof row[key] === "string" && row[key]) return row[key] as string;
  }
  return null;
}

function value(row: Row, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== null && row[key] !== undefined) return row[key];
  }
  return null;
}

function number(row: Row, ...keys: string[]): number | null {
  for (const key of keys) {
    if (typeof row[key] === "number" && Number.isFinite(row[key])) return row[key] as number;
  }
  return null;
}

function parseAiReport(raw: unknown): AiReport | null {
  let parsed = raw;
  if (typeof parsed === "string") {
    if (!parsed.trim()) return null;
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as AiReport : null;
}

function reportNumber(report: AiReport, key: string): number | null {
  return typeof report[key] === "number" && Number.isFinite(report[key]) ? report[key] as number : null;
}

function reportStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const row = item as Row;
        return text(row, "label", "text", "title", "question", "topic", "message") ?? "";
      }
      return "";
    })
    .filter(Boolean);
}

function boolean(row: Row, ...keys: string[]): boolean | null {
  for (const key of keys) {
    if (typeof row[key] === "boolean") return row[key] as boolean;
  }
  return null;
}

function planFeatures(plan: Row): string[] {
  const raw = plan.features;
  const listedFeatures = Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const derivedFeatures = [
    hasAiTutorFeature(plan) ? "مدرس ذكي AI" : null,
    boolean(plan, "has_recording") ? "تسجيل الحصص" : null,
    boolean(plan, "has_priority_booking") ? "أولوية الحجز" : null,
    plan.tier !== "basic" ? "تقارير مفصلة" : null,
    plan.tier === "basic" ? "دعم فني عبر الشات" : plan.tier === "standard" ? "دعم فني عبر الشات والبريد" : "دعم فني بأولوية",
  ].filter((value): value is string => Boolean(value));
  const features = raw && typeof raw === "object" && !Array.isArray(raw)
      ? Object.entries(raw as Record<string, unknown>)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key)
      : listedFeatures;
  return [...new Set([...features, ...derivedFeatures])];
}

function subscriptionStatus(row: Row | null): "فعال" | "منتهي" | "موقوف" | "غير مشترك" {
  if (!row) return "غير مشترك";
  if (isSubscriptionActive(row)) return "فعال";
  const endsAt = text(row, "ends_at");
  const endsAtMs = endsAt ? new Date(endsAt).getTime() : Number.NaN;
  const hasExpired = Boolean(endsAt) && (!Number.isFinite(endsAtMs) || endsAtMs <= Date.now());
  const depleted = (number(row, "remaining_minutes") ?? 0) <= 0;
  if (hasExpired || depleted) return "منتهي";
  if (boolean(row, "is_active") === false) return "موقوف";
  return "غير مشترك";
}

function statusStyle(status: string, colors: ReturnType<typeof useColors>) {
  if (status === "فعال") return { color: colors.teal, backgroundColor: colors.tealSoft };
  if (status === "منتهي") return { color: colors.mutedForeground, backgroundColor: colors.background };
  if (status === "موقوف") return { color: colors.destructive, backgroundColor: colors.accent };
  return { color: colors.mutedForeground, backgroundColor: colors.background };
}

function money(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)} SAR`;
}

function minutesLabel(minutes: number, t?: (arabic: string, english: string) => string, formatNumber?: (value: number) => string): string {
  const label = (value: number, arabic: string, english: string) => `${formatNumber ? formatNumber(value) : value} ${t ? t(arabic, english) : arabic}`;
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remaining = safeMinutes % 60;
  if (hours > 0 && remaining > 0) return `${label(hours, "س", "hr")} ${label(remaining, "د", "min")}`;
  if (hours > 0) return label(hours, "س", "hr");
  return label(remaining, "د", "min");
}

function actualMinutes(session: Row): number {
  const deducted = number(session, "deducted_minutes") ?? 0;
  if (deducted > 0) return deducted;
  const seconds = number(session, "duration_seconds") ?? 0;
  if (seconds > 0) return Math.ceil(seconds / 60);
  const startedAt = text(session, "started_at");
  const endedAt = text(session, "ended_at");
  if (startedAt && endedAt) {
    const elapsedSeconds = (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000;
    if (elapsedSeconds >= 60) return Math.ceil(elapsedSeconds / 60);
  }
  return Math.max(0, number(session, "duration_minutes") ?? 0);
}

function dateTimeLabel(value: string | null, locale = "ar-SA"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function totalMinutesForSubscription(subscription: Row, plan: Row | undefined): number {
  const totalHours = number(subscription, "total_hours") ?? 0;
  if (totalHours > 0) return totalHours * 60;
  const sessions = number(plan ?? {}, "sessions_count", "session_count") ?? 0;
  const duration = number(subscription, "session_duration_minutes")
    ?? number(plan ?? {}, "session_duration_minutes")
    ?? 0;
  return sessions * duration;
}

function urlFromRow(row: Row, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  const metadata = row.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    for (const key of keys) {
      const value = (metadata as Record<string, unknown>)[key];
      if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
    }
  }
  return null;
}

function useRealtimeRefresh(userId: string | undefined, tables: string[]) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!supabase || !userId) return;
    const channel = supabase.channel(`mobile-billing-${userId}-${tables.join("-")}`);
    for (const table of tables) {
      const userColumn = table === "invoices" ? "student_id" : "user_id";
      channel.on("postgres_changes", {
        event: "*",
        schema: "public",
        table,
        filter: `${userColumn}=eq.${userId}`,
      }, () => setRevision((value) => value + 1));
    }
    channel.subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [userId, tables.join("|")]);
  return revision;
}

function useMaterialsRealtimeRefresh(userId: string | undefined, teacher: boolean) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!supabase || !userId) return;
    const role = teacher ? "teacher" : "student";
    const column = teacher ? "teacher_id" : "student_id";
    const channel = supabase.channel(`mobile-session-materials-${role}-${userId}`);
    channel.on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "session_materials",
      filter: `${column}=eq.${userId}`,
    }, () => setRevision((value) => value + 1));
    channel.subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [userId, teacher]);
  return revision;
}

function dateLabel(value: string | null, locale = "ar-SA"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function useRemoteData<T>(loader: () => Promise<T>, dependencies: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loader().then((value) => {
      if (active) setData(value);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "تعذر تحميل البيانات");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
    // The caller controls the loader's inputs through dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  useEffect(() => reload(), [reload]);
  return { data, loading, error, reload };
}

function SectionHeader({ eyebrow, title, avatarText }: { eyebrow: string; title: string; avatarText?: string }) {
  return <Header onBack={() => router.back()} eyebrow={eyebrow} title={title} avatarText={avatarText} onAvatar={() => router.push("/profile")} />;
}

function StateBlock({ loading, error, empty, onRetry }: { loading: boolean; error: string | null; empty: boolean; onRetry: () => void }) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  if (loading) return <View style={styles.state}><ActivityIndicator color={colors.teal} /><Text style={[styles.stateText, { color: colors.mutedForeground, writingDirection: direction }]}>{t("جارٍ مزامنة بيانات المنصة…", "Syncing platform data…")}</Text></View>;
  if (error) return <EmptyState icon="alert-circle" title={t("تعذر تحميل بيانات المنصة", "Could not load platform data")} body={t("تحقق من الاتصال والصلاحيات ثم حاول مرة أخرى.", "Check your connection and permissions, then try again.")} action={t("إعادة المحاولة", "Try again")} onAction={onRetry} />;
  if (empty) return <EmptyState icon="inbox" title={t("لا توجد بيانات متاحة", "No data available")} body={t("لم تُرجع المنصة سجلات مرتبطة بهذا الحساب حتى الآن.", "The platform has not returned records linked to this account yet.")} />;
  return null;
}

function ValueRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return <View style={[styles.valueRow, { borderBottomColor: colors.border }]}><Text style={[styles.value, { color: colors.foreground }]}>{value}</Text><Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text></View>;
}

function PlanCard({ plan, onChoose, disabled }: { plan: Row; onChoose: () => void; disabled?: boolean }) {
  const colors = useColors();
  const { t, direction, formatNumber } = useAppPreferences();
  const name = text(plan, "name_ar", "name", "title") ?? "باقة تعليمية";
  const description = text(plan, "description_ar", "description");
  const price = money(number(plan, "price", "amount"));
  const sessions = number(plan, "sessions_count", "session_count");
  const duration = number(plan, "session_duration_minutes");
  const features = planFeatures(plan);
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}><Text style={[styles.price, { color: colors.primary }]}>{price}</Text><View style={[styles.iconBox, { backgroundColor: colors.goldSoft }]}><Icon name="award" size={19} color={colors.accentForeground} /></View></View>
      <Text style={[styles.cardTitle, { color: colors.foreground, writingDirection: direction }]}>{t(name, name)}</Text>
      {description ? <Text style={[styles.cardBody, { color: colors.mutedForeground, writingDirection: direction }]}>{description}</Text> : null}
      {sessions !== null ? <ValueRow label={t("عدد الجلسات", "Sessions")} value={`${formatNumber(sessions)} ${t("جلسة", "sessions")}`} /> : null}
      {duration !== null ? <ValueRow label={t("مدة الجلسة", "Session duration")} value={`${formatNumber(duration)} ${t("دقيقة", "min")}`} /> : null}
      {features.length ? <View style={styles.featureList}>{features.map((feature) => <View key={feature} style={styles.featureRow}><Icon name="check-circle" size={14} color={colors.teal} /><Text style={[styles.featureText, { color: colors.mutedForeground, writingDirection: direction }]}>{t(feature, feature === "مدرس ذكي AI" ? "AI tutor" : feature === "تسجيل الحصص" ? "Session recording" : feature === "أولوية الحجز" ? "Priority booking" : feature === "تقارير مفصلة" ? "Detailed reports" : feature === "دعم فني عبر الشات" ? "Chat support" : feature === "دعم فني عبر الشات والبريد" ? "Chat and email support" : feature === "دعم فني بأولوية" ? "Priority support" : feature)}</Text></View>)}</View> : null}
      <Pressable disabled={disabled} onPress={onChoose} style={({ pressed }) => [styles.actionButton, { backgroundColor: disabled ? colors.muted : colors.primary }, pressed && styles.pressed]}><Text style={[styles.actionText, { color: colors.primaryForeground }]}>{disabled ? t("جارٍ التحضير…", "Preparing…") : t("اختيار الباقة", "Choose plan")}</Text><Icon name={direction === "rtl" ? "arrow-left" : "arrow-right"} size={15} color={colors.tint} /></Pressable>
    </View>
  );
}

function SubscriptionsScreen({ detail }: { detail: boolean }) {
  const colors = useColors();
  const { user } = useAuth();
  const { t, locale, direction, formatNumber } = useAppPreferences();
  const revision = useRealtimeRefresh(user?.id, ["user_subscriptions"]);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [activeExpanded, setActiveExpanded] = useState(true);
  const [endedExpanded, setEndedExpanded] = useState(false);
  const query = useRemoteData<{
    plans: Row[];
    subscriptions: Row[];
    deductions: ConsumptionRecord[];
    freeTrialUsed: boolean;
    profileComplete: boolean;
  }>(async () => {
    if (!supabase || !user) return { plans: [], subscriptions: [], deductions: [], freeTrialUsed: false, profileComplete: false };
    const [plansResult, subscriptionsResult, profileResult] = await Promise.all([
      supabase.from("subscription_plans").select("*").order("price", { ascending: true }),
      supabase.from("user_subscriptions").select("*").eq("user_id", user.id).order("ends_at", { ascending: true }),
      supabase.from("profiles").select("free_trial_used, full_name, phone, teaching_stage").eq("user_id", user.id).maybeSingle(),
    ]);
    if (plansResult.error) throw plansResult.error;
    if (subscriptionsResult.error) throw subscriptionsResult.error;
    const profile = profileResult.data;
    let deductions: ConsumptionRecord[] = [];
    if (detail) {
      const bookingsResult = await supabase
        .from("bookings")
        .select("id, teacher_id, subject_id, subjects(name), scheduled_at")
        .eq("student_id", user.id)
        .eq("status", "completed")
        .order("scheduled_at", { ascending: false })
        .limit(50);
      if (bookingsResult.error) throw bookingsResult.error;
      const bookings = (bookingsResult.data ?? []) as Row[];
      if (bookings.length) {
        const bookingIds = bookings.map((booking) => String(booking.id));
        const teacherIds = [...new Set(bookings.map((booking) => text(booking, "teacher_id")).filter(Boolean))] as string[];
        const teacherProfilesResult = teacherIds.length
          ? await supabase.from("teacher_profiles").select("id, user_id").in("user_id", teacherIds)
          : { data: [], error: null };
        if (teacherProfilesResult.error) throw teacherProfilesResult.error;
        const teacherProfiles = (teacherProfilesResult.data ?? []) as Row[];
        const userIdToProfileId = new Map(teacherProfiles.map((profileRow) => [String(profileRow.user_id), String(profileRow.id)]));
        const profileIds = teacherProfiles.map((profileRow) => String(profileRow.id));
        const [sessionsResult, profilesResult, teacherSubjectsResult] = await Promise.all([
          supabase.from("sessions").select("booking_id, duration_minutes, duration_seconds, deducted_minutes, short_session, started_at, ended_at").in("booking_id", bookingIds),
          teacherIds.length ? supabase.from("public_profiles").select("user_id, full_name").in("user_id", teacherIds) : Promise.resolve({ data: [], error: null }),
          profileIds.length ? supabase.from("teacher_subjects").select("teacher_id, subjects(name)").in("teacher_id", profileIds) : Promise.resolve({ data: [], error: null }),
        ]);
        if (sessionsResult.error) throw sessionsResult.error;
        if (profilesResult.error) throw profilesResult.error;
        if (teacherSubjectsResult.error) throw teacherSubjectsResult.error;
        const sessionsByBooking = new Map((sessionsResult.data ?? []).map((session) => [String(session.booking_id), session as Row]));
        const namesByTeacher = new Map((profilesResult.data ?? []).map((profileRow) => [String(profileRow.user_id), text(profileRow as Row, "full_name") ?? "معلم"]));
        const subjectsByTeacher = new Map<string, string>();
        for (const subjectRow of teacherSubjectsResult.data ?? []) {
          const row = subjectRow as Row;
          const teacherProfileId = text(row, "teacher_id");
          const subject = row.subjects && typeof row.subjects === "object" ? text(row.subjects as Row, "name") : null;
          if (teacherProfileId && subject) {
            const teacherId = [...userIdToProfileId.entries()].find(([, profileId]) => profileId === teacherProfileId)?.[0];
            if (teacherId && !subjectsByTeacher.has(teacherId)) subjectsByTeacher.set(teacherId, subject);
          }
        }
        deductions = bookings.map((booking) => {
          const bookingId = String(booking.id);
          const session = sessionsByBooking.get(bookingId);
          if (!session) return null;
          const teacherId = text(booking, "teacher_id") ?? "";
          const nestedSubject = booking.subjects && typeof booking.subjects === "object" ? text(booking.subjects as Row, "name") : null;
          const minutes = actualMinutes(session);
          return {
            id: bookingId,
            subjectName: nestedSubject ?? subjectsByTeacher.get(teacherId) ?? "غير محدد",
            teacherName: namesByTeacher.get(teacherId) ?? "معلم",
            actualMinutes: minutes,
            shortSession: minutes > 0 && minutes < 5 ? true : boolean(session, "short_session") === true,
            scheduledAt: text(booking, "scheduled_at"),
            startedAt: text(session, "started_at"),
            endedAt: text(session, "ended_at"),
          };
        }).filter((record): record is ConsumptionRecord => Boolean(record));
      }
    }
    return {
      plans: (plansResult.data ?? []) as Row[],
      subscriptions: (subscriptionsResult.data ?? []) as Row[],
      deductions,
      freeTrialUsed: profile?.free_trial_used === true,
      profileComplete: Boolean(profile?.full_name && profile?.phone && profile?.teaching_stage),
    };
  }, [user?.id, detail, revision]);
  const activeRows = (query.data?.subscriptions ?? []).filter((row) => subscriptionStatus(row) === "فعال");
  const endedRows = (query.data?.subscriptions ?? []).filter((row) => subscriptionStatus(row) !== "فعال");
  const active = activeRows[0];
  const planById = new Map((query.data?.plans ?? []).map((plan) => [String(plan.id), plan]));
  const activePlan = active ? planById.get(String(active.plan_id)) : undefined;
  const aggregateRemainingMinutes = activeRows.reduce((sum, row) => sum + (number(row, "remaining_minutes") ?? 0), 0);
  const aggregateRemainingSessions = activeRows.reduce((sum, row) => sum + (number(row, "sessions_remaining") ?? 0), 0);
  const aggregateTotalMinutes = activeRows.reduce((sum, row) => sum + totalMinutesForSubscription(row, planById.get(String(row.plan_id))), 0);
  const usedMinutes = Math.max(0, aggregateTotalMinutes - aggregateRemainingMinutes);
  const usagePercent = aggregateTotalMinutes > 0 ? Math.min(100, (usedMinutes / aggregateTotalMinutes) * 100) : 0;
  const overallStatus = subscriptionStatus(active ?? null);

  const checkout = async (plan: Row) => {
    if (!supabase) return;
    const planId = plan.id === null || plan.id === undefined ? null : String(plan.id);
    if (!planId) return;
    const price = number(plan, "price") ?? 0;
    if (!query.data?.profileComplete) {
      Alert.alert(
        "أكمل بياناتك أولاً",
        "تحتاج المنصة إلى الاسم ورقم الجوال والمرحلة الدراسية قبل بدء الاشتراك.",
        [
          { text: "لاحقاً", style: "cancel" },
          {
            text: "فتح الملف",
            onPress: () => {
              void Linking.openURL("https://ajyalalmaerifa.com/complete-profile?redirect=%2Fpricing").catch(() => undefined);
            },
          },
        ],
      );
      return;
    }
    if (price <= 0 && query.data?.freeTrialUsed) {
      Alert.alert("الباقة المجانية مستخدمة", "لا يمكن تفعيل الباقة المجانية أكثر من مرة.");
      return;
    }
    setCheckoutBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          plan_id: planId,
          success_url: "https://ajyalalmaerifa.com/payment-success",
          cancel_url: "https://ajyalalmaerifa.com/pricing?payment=cancelled",
          promo_code: promoCode.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data && typeof data.error === "string") throw new Error(data.error);
      if (data && data.free === true && data.activated === true) {
        Alert.alert("تم تفعيل الباقة", "تمت إضافة الباقة المجانية إلى حسابك.");
        await query.reload();
        router.replace("/(tabs)");
        return;
      }
      const url = data && typeof data.url === "string" ? data.url : null;
      if (!url) throw new Error("لم تُرجع المنصة رابط الدفع");
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert("تعذر بدء الاشتراك", error instanceof Error ? error.message : "تحقق من اتصالك وحاول مرة أخرى.");
    } finally {
      setCheckoutBusy(false);
    }
  };

  return (
    <Screen>
      <SectionHeader eyebrow={detail ? t("تفاصيل خطتك", "Plan details") : t("خطتك التعليمية", "Your learning plan")} title={detail ? t("رصيد الباقة", "Plan balance") : t("الباقات والاشتراكات", "Plans and subscriptions")} avatarText={user?.email?.slice(0, 1)} />
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.goldSoft }]}><Icon name="award" size={22} color={colors.accentForeground} /></View>
         <View style={styles.heroCopy}><Text style={[styles.heroEyebrow, { color: colors.tint, writingDirection: direction }]}>{t("بيانات من حساب المنصة", "Data from your platform account")}</Text><Text style={[styles.heroTitle, { color: colors.primaryForeground, writingDirection: direction }]}>{detail ? t("خطتك الحالية", "Your current plan") : t("اختر ما يناسب هدفك", "Choose what fits your goal")}</Text><Text style={[styles.heroBody, { color: colors.tint, writingDirection: direction }]}>{t("المعلومات المعروضة متزامنة من Supabase مباشرة.", "This information syncs directly from Supabase.")}</Text></View>
      </View>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
         <View style={styles.cardTop}><Text style={[styles.cardTitle, { color: colors.foreground, writingDirection: direction }]}>{activePlan ? text(activePlan, "name", "name_en", "name_ar") ?? t("الاشتراك الحالي", "Current plan") : t("لا يوجد اشتراك فعال", "No active plan")}</Text><Text style={[styles.badge, statusStyle(overallStatus, colors)]}>{t(overallStatus, overallStatus === "فعال" ? "Active" : overallStatus === "منتهي" ? "Ended" : overallStatus === "موقوف" ? "Paused" : "Not subscribed")}</Text></View>
         {activeRows.length ? <><ValueRow label={t("الجلسات المتبقية", "Sessions remaining")} value={`${formatNumber(aggregateRemainingSessions)} ${t("جلسة", "sessions")}`} /><ValueRow label={t("الدقائق المتبقية", "Minutes remaining")} value={`${formatNumber(aggregateRemainingMinutes)} ${t("دقيقة", "min")}`} /><ValueRow label={t("تاريخ البداية", "Start date")} value={dateLabel(text(active, "starts_at", "created_at"), locale)} /><ValueRow label={t("تاريخ الانتهاء", "End date")} value={dateLabel(text(active, "ends_at"), locale)} /></> : <Text style={[styles.cardBody, { color: colors.mutedForeground, writingDirection: direction }]}>{t("يمكنك اختيار إحدى الباقات المتاحة للبدء في حجز الجلسات.", "Choose one of the available plans to start booking sessions.")}</Text>}
      </View>
      {detail && query.data && activeRows.length ? (
        <View style={[styles.usageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardTop}>
             <Text style={[styles.cardTitle, { color: colors.foreground, writingDirection: direction }]}>{t("تفاصيل الاستهلاك", "Usage details")}</Text>
            <Icon name="trending-up" size={18} color={colors.teal} />
          </View>
          <View style={styles.usageStats}>
            <View style={[styles.usageStat, { backgroundColor: colors.background }]}>
              <Text style={[styles.usageNumber, { color: colors.foreground }]}>{minutesLabel(aggregateTotalMinutes, t, formatNumber)}</Text>
              <Text style={[styles.usageLabel, { color: colors.mutedForeground }]}>{t("إجمالي الباقة", "Plan total")}</Text>
            </View>
            <View style={[styles.usageStat, { backgroundColor: colors.background }]}>
              <Text style={[styles.usageNumber, { color: colors.destructive }]}>{minutesLabel(usedMinutes, t, formatNumber)}</Text>
              <Text style={[styles.usageLabel, { color: colors.mutedForeground }]}>{t("مستخدمة", "Used")}</Text>
            </View>
            <View style={[styles.usageStat, { backgroundColor: colors.tealSoft }]}>
              <Text style={[styles.usageNumber, { color: colors.teal }]}>{minutesLabel(aggregateRemainingMinutes, t, formatNumber)}</Text>
              <Text style={[styles.usageLabel, { color: colors.mutedForeground }]}>{t("متبقية", "Remaining")}</Text>
            </View>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.background }]}>
            <View style={[styles.progressFill, { width: `${usagePercent}%`, backgroundColor: colors.teal }]} />
          </View>
          <View style={styles.usageCaption}>
             <Text style={[styles.cardBody, { color: colors.mutedForeground, marginTop: 0 }]}>{formatNumber(Math.round(usagePercent))}% {t("مستخدم", "used")}</Text>
             <Text style={[styles.cardBody, { color: colors.mutedForeground, marginTop: 0 }]}>{t("الاستهلاك الفعلي بعد الجلسات المكتملة", "Actual usage after completed sessions")}</Text>
          </View>
        </View>
      ) : null}
      {!detail ? (
        <View style={[styles.promoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.promoLabel, { color: colors.foreground, writingDirection: direction }]}>{t("لديك رمز ترويجي؟", "Have a promo code?")}</Text>
          <TextInput
            value={promoCode}
            onChangeText={setPromoCode}
            placeholder={t("أدخل الرمز اختيارياً", "Enter code (optional)")}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            style={[styles.promoInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
        </View>
      ) : null}
      <SectionHeading title={detail ? t("السجل المرتبط", "Linked history") : t("الباقات المتاحة", "Available plans")} />
      <StateBlock loading={query.loading} error={query.error} empty={detail ? !query.data?.subscriptions.length : !query.data?.plans.length} onRetry={query.reload} />
      {!query.loading && !query.error && !detail ? query.data?.plans.map((plan) => <PlanCard key={String(plan.id)} plan={plan} disabled={checkoutBusy} onChoose={() => { void checkout(plan); }} />) : null}
      {!query.loading && !query.error && detail ? (
        <View style={styles.subscriptionSections}>
          <SubscriptionSection title={t("الباقات النشطة", "Active plans")} count={activeRows.length} expanded={activeExpanded} onToggle={() => setActiveExpanded((value) => !value)}>
            {activeExpanded ? activeRows.map((subscription) => <SubscriptionRow key={String(subscription.id)} subscription={subscription} plan={planById.get(String(subscription.plan_id))} locale={locale} t={t} formatNumber={formatNumber} />) : null}
          </SubscriptionSection>
          <SubscriptionSection title={t("الباقات المنتهية", "Ended plans")} count={endedRows.length} expanded={endedExpanded} onToggle={() => setEndedExpanded((value) => !value)}>
            {endedExpanded ? endedRows.map((subscription) => <SubscriptionRow key={String(subscription.id)} subscription={subscription} plan={planById.get(String(subscription.plan_id))} locale={locale} t={t} formatNumber={formatNumber} />) : null}
          </SubscriptionSection>
        </View>
      ) : null}
      {detail && !query.loading && !query.error && query.data ? (
        <>
           <SectionHeading title={t("الاستهلاك حسب الجلسات", "Usage by session")} />
          {!query.data.deductions.length ? (
             <EmptyState icon="clock" title={t("لا توجد جلسات مكتملة بعد", "No completed sessions yet")} body={t("سيظهر استهلاك الباقة هنا بعد إنهاء جلسة من المنصة.", "Plan usage will appear here after a session is completed on the platform.")} />
          ) : query.data.deductions.map((record) => (
            <View key={record.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardTop}>
                <View style={[styles.iconBox, { backgroundColor: record.shortSession ? colors.background : colors.tealSoft }]}>
                  <Icon name="book-open" size={18} color={record.shortSession ? colors.mutedForeground : colors.teal} />
                </View>
                <View style={styles.consumptionTitle}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>{record.subjectName}</Text>
                  <Text style={[styles.cardBody, { color: colors.mutedForeground, marginTop: 3 }]}>{record.teacherName}</Text>
                </View>
                {record.shortSession ? (
                   <Text style={[styles.badge, { color: colors.mutedForeground, backgroundColor: colors.background }]}>{t("لم تُحتسب", "Not counted")}</Text>
                ) : (
                   <Text style={[styles.deductionAmount, { color: colors.destructive }]}>-{formatNumber(record.actualMinutes)} {t("د", "min")}</Text>
                )}
              </View>
               <ValueRow label={t("موعد الجلسة", "Session time")} value={dateTimeLabel(record.scheduledAt ?? record.startedAt, locale)} />
               <ValueRow label={t("حالة الخصم", "Deduction status")} value={record.shortSession ? t("أقل من 5 دقائق", "Under 5 minutes") : `${t("مدة الجلسة:", "Session duration:")} ${formatNumber(record.actualMinutes)} ${t("دقيقة", "min")}`} />
               {record.shortSession ? <Text style={[styles.cardBody, { color: colors.mutedForeground, writingDirection: direction }]}>{t("الجلسة أقل من 5 دقائق، لذلك لم يتم الخصم من الباقة.", "The session was under 5 minutes, so no plan minutes were deducted.")}</Text> : null}
            </View>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function SubscriptionSection({ title, count, expanded, onToggle, children }: { title: string; count: number; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  const colors = useColors();
  const { direction, formatNumber } = useAppPreferences();
  return <View style={styles.subscriptionSection}>
    <Pressable onPress={onToggle} style={[styles.subscriptionHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Icon name={expanded ? "chevron-up" : "chevron-down"} size={17} color={colors.mutedForeground} />
      <Text style={[styles.subscriptionHeaderText, { color: colors.foreground, writingDirection: direction }]}>{title} ({formatNumber(count)})</Text>
    </Pressable>
    {children}
  </View>;
}

function SubscriptionRow({ subscription, plan, locale, t, formatNumber }: {
  subscription: Row;
  plan?: Row;
  locale: "ar-SA" | "en-US";
  t: (arabic: string, english: string) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}) {
  const colors = useColors();
  const status = subscriptionStatus(subscription);
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={styles.cardTop}>
      <Text style={[styles.cardTitle, { color: colors.foreground, writingDirection: locale === "ar-SA" ? "rtl" : "ltr" }]}>{plan ? text(plan, "name", "name_en", "name_ar") ?? t("اشتراك", "Subscription") : t("اشتراك", "Subscription")}</Text>
      <Text style={[styles.badge, statusStyle(status, colors)]}>{t(status, status === "فعال" ? "Active" : status === "منتهي" ? "Ended" : status === "موقوف" ? "Paused" : "Not subscribed")}</Text>
    </View>
    <ValueRow label={t("الجلسات المتبقية", "Sessions remaining")} value={`${formatNumber(number(subscription, "sessions_remaining") ?? 0)} ${t("جلسة", "sessions")}`} />
    <ValueRow label={t("الدقائق المتبقية", "Minutes remaining")} value={`${formatNumber(number(subscription, "remaining_minutes") ?? 0)} ${t("دقيقة", "min")}`} />
    <ValueRow label={t("تاريخ البداية", "Start date")} value={dateLabel(text(subscription, "starts_at", "created_at"), locale)} />
    <ValueRow label={t("تاريخ الانتهاء", "End date")} value={dateLabel(text(subscription, "ends_at"), locale)} />
  </View>;
}

function InvoiceRow({ row }: { row: Row }) {
  const colors = useColors();
  const { t, direction, locale, formatNumber } = useAppPreferences();
  const documentUrl = urlFromRow(row, "pdf_url", "pdfUrl", "invoice_url", "download_url");
  const qrUrl = urlFromRow(row, "qr_url", "qrUrl");
  const open = async (url: string | null) => {
    if (!url) return;
    await Linking.openURL(url);
  };
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.price, { color: colors.primary }]}>{money(number(row, "total_amount", "amount", "net_amount"))}</Text>
        <Text style={[styles.badge, { color: colors.teal, backgroundColor: colors.tealSoft }]}>
          {text(row, "zatca_status") ?? t("مسجلة", "Recorded")}
        </Text>
      </View>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>
        {text(row, "invoice_number") ?? t("فاتورة", "Invoice")}
      </Text>
      <ValueRow label={t("التاريخ", "Date")} value={dateLabel(text(row, "issued_at", "created_at"), locale)} />
      <ValueRow label={t("صافي المبلغ", "Net amount")} value={money(number(row, "net_amount"))} />
      <ValueRow label={t("ضريبة القيمة المضافة", "VAT")} value={money(number(row, "vat_amount"))} />
      <ValueRow label={t("العملة", "Currency")} value={text(row, "currency") ?? "—"} />
      {number(row, "hours_purchased") !== null ? <ValueRow label={t("الساعات المشتراة", "Hours purchased")} value={`${formatNumber(number(row, "hours_purchased") ?? 0)} ${t("ساعة", "hours")}`} /> : null}
      {text(row, "qr_code") ? <ValueRow label={t("بيانات QR", "QR data")} value={t("محفوظة في الفاتورة", "Saved in invoice")} /> : null}
      {documentUrl || qrUrl ? (
        <View style={styles.invoiceActions}>
          {documentUrl ? (
            <Pressable onPress={() => void open(documentUrl)} style={[styles.invoiceAction, { backgroundColor: colors.primary }]}>
              <Icon name="download" size={15} color={colors.primaryForeground} />
              <Text style={[styles.invoiceActionText, { color: colors.primaryForeground, writingDirection: direction }]}>{t("فتح المستند", "Open document")}</Text>
            </Pressable>
          ) : null}
          {qrUrl ? (
            <Pressable onPress={() => void open(qrUrl)} style={[styles.invoiceAction, { backgroundColor: colors.tealSoft }]}>
              <Icon name="file-text" size={15} color={colors.teal} />
              <Text style={[styles.invoiceActionText, { color: colors.teal, writingDirection: direction }]}>{t("فتح QR", "Open QR")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function InvoicesScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { t, direction } = useAppPreferences();
  const revision = useRealtimeRefresh(user?.id, ["invoices"]);
  const query = useRemoteData<Row[]>(async () => {
    if (!supabase || !user) return [];
    const invoicesResult = await supabase
      .from("invoices")
      .select("*")
      .eq("student_id", user.id)
      .order("issued_at", { ascending: false });
    if (invoicesResult.error) throw invoicesResult.error;
    return (invoicesResult.data ?? []) as Row[];
  }, [user?.id, revision]);
  return (
    <Screen>
      <SectionHeader eyebrow={t("سجل الفواتير", "Invoice history")} title={t("الفواتير", "Invoices")} avatarText={user?.email?.slice(0, 1)} />
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.goldSoft }]}><Icon name="file-text" size={22} color={colors.accentForeground} /></View>
        <View style={styles.heroCopy}>
          <Text style={[styles.heroEyebrow, { color: colors.tint, writingDirection: direction }]}>{t("الفواتير الصادرة", "Issued invoices")}</Text>
          <Text style={[styles.heroTitle, { color: colors.primaryForeground, writingDirection: direction }]}>{t("فواتيرك الرسمية من المنصة", "Your official platform invoices")}</Text>
          <Text style={[styles.heroBody, { color: colors.tint, writingDirection: direction }]}>{t("يعرض هذا السجل الفواتير الصادرة والمرتبطة بحسابك فقط.", "This history shows only issued invoices linked to your account.")}</Text>
        </View>
      </View>
      <SectionHeading title={t("آخر الفواتير", "Latest invoices")} />
      <StateBlock loading={query.loading} error={query.error} empty={!query.data?.length} onRetry={query.reload} />
      {!query.loading && !query.error ? query.data?.map((row) => <InvoiceRow key={String(row.id)} row={row} />) : null}
    </Screen>
  );
}

function WalletScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { role } = useAjyal();
  const { t, direction, locale } = useAppPreferences();
  const query = useRemoteData(async () => {
    if (role !== "teacher" || !supabase || !user) return { wallet: null, transactions: [], earnings: [] };
    const [walletResult, transactionsResult, earningsResult] = await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("wallet_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("teacher_earnings").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }),
    ]);
    if (walletResult.error) throw walletResult.error;
    if (transactionsResult.error) throw transactionsResult.error;
    if (earningsResult.error) throw earningsResult.error;
    return { wallet: walletResult.data as Row | null, transactions: (transactionsResult.data ?? []) as Row[], earnings: (earningsResult.data ?? []) as Row[] };
  }, [user?.id, role]);
  if (role !== "teacher") {
    return <Screen><SectionHeader eyebrow={t("صلاحيات الحساب", "Account access")} title={t("المحفظة والأرباح", "Wallet and earnings")} avatarText={user?.email?.slice(0, 1)} /><EmptyState icon="lock" title={t("هذه الصفحة للمعلم فقط", "Teachers only")} body={t("لا يمكن الوصول إلى بيانات المحفظة من حساب الطالب.", "Student accounts cannot access wallet data.")} /></Screen>;
  }
  const hasRows = Boolean(query.data?.wallet || query.data?.transactions.length || query.data?.earnings.length);
  return <Screen><SectionHeader eyebrow={t("إدارة دخلك التعليمي", "Manage your teaching income")} title={t("المحفظة والأرباح", "Wallet and earnings")} avatarText={user?.email?.slice(0, 1)} /><View style={[styles.hero, { backgroundColor: colors.primary }]}><View style={[styles.heroIcon, { backgroundColor: colors.goldSoft }]}><Icon name="credit-card" size={22} color={colors.accentForeground} /></View><View style={styles.heroCopy}><Text style={[styles.heroEyebrow, { color: colors.tint, writingDirection: direction }]}>{t("حساب المعلم", "Teacher account")}</Text><Text style={[styles.heroTitle, { color: colors.primaryForeground, writingDirection: direction }]}>{t("رصيدك وحركتك المالية", "Your balance and financial activity")}</Text><Text style={[styles.heroBody, { color: colors.tint, writingDirection: direction }]}>{t("تُعرض الأرقام كما هي محفوظة في محفظة المنصة.", "Figures are shown exactly as stored in the platform wallet.")}</Text></View></View><StateBlock loading={query.loading} error={query.error} empty={!hasRows} onRetry={query.reload} />{query.data?.wallet ? <View style={[styles.balanceCard, { backgroundColor: colors.tealSoft, borderColor: colors.border }]}><Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>{t("الرصيد الحالي", "Current balance")}</Text><Text style={[styles.balance, { color: colors.teal }]}>{money(number(query.data.wallet, "balance", "available_balance", "current_balance"))}</Text></View> : null}<SectionHeading title={t("آخر الحركات", "Latest activity")} />{query.data?.transactions.map((row) => <View key={`tx-${String(row.id)}`} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.cardTop}><Text style={[styles.price, { color: row.type === "debit" ? colors.destructive : colors.teal }]}>{money(number(row, "amount", "amount_sar"))}</Text><Text style={[styles.badge, { color: colors.mutedForeground }]}>{text(row, "type", "transaction_type") ?? t("حركة", "Transaction")}</Text></View><Text style={[styles.cardTitle, { color: colors.foreground }]}>{text(row, "description", "reason") ?? t("حركة مالية", "Financial transaction")}</Text><Text style={[styles.cardBody, { color: colors.mutedForeground }]}>{dateLabel(text(row, "created_at"), locale)}</Text></View>)}</Screen>;
}

async function openRecording(url: string | null) {
  if (!url) return;
  let target = url;
  const marker = "/session-recordings/";
  const index = url.indexOf(marker);
  if (index !== -1 && supabase) {
    const path = decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
    const { data } = await supabase.storage.from("session-recordings").createSignedUrl(path, 3600);
    if (data?.signedUrl) target = data.signedUrl;
  }
  await Linking.openURL(target);
}

function SessionReport({ value: raw }: { value: unknown }) {
  const colors = useColors();
  const { t, direction, formatNumber, locale } = useAppPreferences();
  const report = parseAiReport(raw);
  if (!report) {
    const fallback = typeof raw === "string" ? raw.trim() : "";
    return fallback ? <Text style={[styles.materialReportText, { color: colors.foreground, writingDirection: direction }]}>{fallback}</Text> : null;
  }

  const scoreItems = [
    { label: t("الأداء", "Performance"), value: reportNumber(report, "performance_score") },
    { label: t("الجودة", "Quality"), value: reportNumber(report, "quality_score") },
    { label: t("الفائدة", "Usefulness"), value: reportNumber(report, "usefulness_score") },
  ].filter((item): item is { label: string; value: number } => item.value !== null);
  const metricItems: Array<{ label: string; value: string }> = [];
  const addMetric = (key: string, label: string, unit?: string) => {
    const metric = reportNumber(report, key);
    if (metric !== null) metricItems.push({ label, value: `${formatNumber(metric)}${unit ? ` ${unit}` : ""}` });
  };
  addMetric("duration_minutes", t("مدة التحليل", "Analysis duration"), t("دقيقة", "min"));
  addMetric("teacher_speaking_minutes", t("تحدث المعلم", "Teacher speaking"), t("دقيقة", "min"));
  addMetric("student_speaking_minutes", t("تحدث الطالب", "Student speaking"), t("دقيقة", "min"));
  addMetric("total_messages", t("إجمالي الرسائل", "Total messages"));
  addMetric("total_silence_seconds", t("الصمت", "Silence"), t("ثانية", "sec"));
  const summary = typeof report.summary === "string" ? report.summary.trim() : "";
  const topics = reportStrings(report.extracted_topics);
  const questions = reportStrings(report.detected_questions);
  const warnings = reportStrings(report.gap_warnings);
  const generatedAt = typeof report.generated_at === "string" ? dateLabel(report.generated_at, locale) : null;
  const noRawResults = report.data_level === "no_raw_results";

  return (
    <View>
      {summary ? <Text style={[styles.reportSummary, { color: colors.foreground, writingDirection: direction }]}>{summary}</Text> : null}
      {noRawResults ? <View style={[styles.reportNotice, { backgroundColor: colors.goldSoft }]}><Icon name="info" size={14} color={colors.accentForeground} /><Text style={[styles.reportNoticeText, { color: colors.accentForeground, writingDirection: direction }]}>{t("لا توجد بيانات خام كافية لإجراء تحليل تفصيلي للجلسة.", "There was not enough raw data for a detailed session analysis.")}</Text></View> : null}
      {scoreItems.length ? <View style={styles.reportGrid}>{scoreItems.map((item) => <View key={item.label} style={[styles.reportScore, { backgroundColor: colors.background }]}><Text style={[styles.reportScoreValue, { color: colors.teal }]}>{`${formatNumber(item.value)}%`}</Text><Text style={[styles.reportScoreLabel, { color: colors.mutedForeground, writingDirection: direction }]}>{item.label}</Text></View>)}</View> : null}
      {metricItems.length ? <View style={styles.reportMetrics}>{metricItems.map((item) => <ValueRow key={item.label} label={item.label} value={item.value} />)}</View> : null}
      {topics.length ? <ReportList title={t("الموضوعات", "Topics")} items={topics} color={colors.teal} /> : null}
      {questions.length ? <ReportList title={t("الأسئلة المكتشفة", "Detected questions")} items={questions} color={colors.primary} /> : null}
      {warnings.length ? <ReportList title={t("نقاط تحتاج مراجعة", "Review points")} items={warnings} color={colors.destructive} /> : null}
      {generatedAt ? <Text style={[styles.reportGenerated, { color: colors.mutedForeground, writingDirection: direction }]}>{`${t("تم إنشاء التقرير", "Report generated")} · ${generatedAt}`}</Text> : null}
    </View>
  );
}

function ReportList({ title, items, color }: { title: string; items: string[]; color: string }) {
  const colors = useColors();
  const { direction } = useAppPreferences();
  return <View style={styles.reportList}><Text style={[styles.reportListTitle, { color: colors.foreground, writingDirection: direction }]}>{title}</Text>{items.map((item, index) => <View key={`${title}-${index}`} style={styles.reportListItem}><View style={[styles.reportBullet, { backgroundColor: color }]} /><Text style={[styles.reportListText, { color: colors.mutedForeground, writingDirection: direction }]}>{item}</Text></View>)}</View>;
}

function MaterialsScreen({ teacher }: { teacher: boolean }) {
  const colors = useColors();
  const { user } = useAuth();
  const { t: baseT, direction, locale } = useAppPreferences();
  const t = (arabic: string, english = "Check your connection and try again.") => baseT(arabic, english);
  const materialsRevision = useMaterialsRealtimeRefresh(user?.id, teacher);
  const query = useRemoteData(async () => {
    if (!supabase || !user) return [];
    const column = teacher ? "teacher_id" : "student_id";
    const result = await supabase.from("session_materials").select("*").eq(column, user.id).eq("is_deleted", false).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
    if (result.error) throw result.error;
    const materials = (result.data ?? []) as Row[];
    if (!materials.length) return [];

    const sessionIds = materials
      .map((material) => text(material, "session_id"))
      .filter((value): value is string => Boolean(value));
    const studentIds = materials
      .map((material) => text(material, "student_id"))
      .filter((value): value is string => Boolean(value));
    const [{ data: sessions, error: sessionsError }, { data: profiles, error: profilesError }] = await Promise.all([
      sessionIds.length
        ? supabase.from("sessions").select("id, ai_report, booking_id").in("id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
      teacher && studentIds.length
        ? supabase.from("public_profiles").select("user_id, full_name").in("user_id", [...new Set(studentIds)])
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (sessionsError) throw sessionsError;
    if (profilesError) throw profilesError;

    const sessionRows = (sessions ?? []) as Row[];
    const sessionMap = new Map(sessionRows.map((session) => [text(session, "id") ?? "", session]));
    const profileMap = new Map(((profiles ?? []) as Row[]).map((profile) => [text(profile, "user_id") ?? "", text(profile, "full_name")]));
    const bookingIds = sessionRows
      .map((session) => text(session, "booking_id"))
      .filter((value): value is string => Boolean(value));
    const { data: bookings, error: bookingsError } = bookingIds.length
      ? await supabase.from("bookings").select("id, subjects(name)").in("id", [...new Set(bookingIds)])
      : { data: [], error: null };
    if (bookingsError) throw bookingsError;
    const subjectMap = new Map(
      ((bookings ?? []) as Row[]).map((booking) => {
        const subject = booking.subjects;
        const subjectName = subject && typeof subject === "object" && !Array.isArray(subject)
          ? (subject as Row).name
          : null;
        return [text(booking, "id") ?? "", typeof subjectName === "string" ? subjectName : null] as const;
      }),
    );

    return materials.map((material) => {
      const session = sessionMap.get(text(material, "session_id") ?? "");
      const bookingId = session ? text(session, "booking_id") : null;
      return {
        ...material,
        subject_name: subjectMap.get(bookingId ?? "") ?? null,
        ai_report: session ? value(session, "ai_report") : null,
        student_name: profileMap.get(text(material, "student_id") ?? "") ?? null,
        days_remaining: Math.max(0, Math.ceil((new Date(text(material, "expires_at") ?? "").getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
      };
    }) as Row[];
  }, [user?.id, teacher, materialsRevision]);
  return <Screen><SectionHeader eyebrow={teacher ? t("مصادر طلابك التعليمية", "Your students’ learning resources") : t("مصادر التعلم الخاصة بك", "Your learning resources")} title={teacher ? t("مواد طلابي", "My students’ materials") : t("المواد التعليمية", "Learning materials")} avatarText={user?.email?.slice(0, 1)} /><View style={[styles.hero, { backgroundColor: colors.primary }]}><View style={[styles.heroIcon, { backgroundColor: colors.tealSoft }]}><Icon name="book-open" size={22} color={colors.teal} /></View><View style={styles.heroCopy}><Text style={[styles.heroEyebrow, { color: colors.tint, writingDirection: direction }]}>{t("جلساتك المرتبطة", "Your linked sessions")}</Text><Text style={[styles.heroTitle, { color: colors.primaryForeground, writingDirection: direction }]}>{teacher ? t("مواد شاركتها مع الطلاب", "Materials shared with students") : t("ملفات ومراجعات جلساتك", "Your session files and reviews")}</Text><Text style={[styles.heroBody, { color: colors.tint, writingDirection: direction }]}>{t("تسجيلات الجلسات المكتملة تبقى متاحة خلال مدة الإتاحة المحددة.", "Completed session recordings stay available during their configured access period.")}</Text></View></View><SectionHeading title={t("المواد المتاحة", "Available materials")} /><StateBlock loading={query.loading} error={query.error} empty={!query.data?.length} onRetry={query.reload} />{query.data?.map((material) => <View key={String(material.id)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.cardTop}><View style={[styles.iconBox, { backgroundColor: colors.tealSoft }]}><Icon name="file-text" size={18} color={colors.teal} /></View><View style={{ flex: 1, marginRight: 10, alignItems: "flex-end" }}><Text style={[styles.cardTitle, { color: colors.foreground, width: "100%", writingDirection: direction }]}>{text(material, "title", "name") ?? text(material, "subject_name") ?? t("جلسة تعليمية", "Learning session")}</Text><Text style={[styles.cardMeta, { color: colors.mutedForeground, writingDirection: direction }]}>{text(material, "subject_name") ?? text(material, "student_name") ?? t("جلسة مرتبطة بحسابك", "Session linked to your account")}</Text></View></View><Text style={[styles.cardBody, { color: colors.mutedForeground, writingDirection: direction }]}>{text(material, "description") ?? t("تسجيل ومواد مرتبطة بجلسة تعليمية مكتملة.", "Recording and materials linked to a completed learning session.")}</Text><ValueRow label={t("تاريخ الإضافة", "Added")} value={dateLabel(text(material, "created_at"), locale)} />{number(material, "duration_minutes", "duration") !== null ? <ValueRow label={t("مدة التسجيل", "Recording duration")} value={`${number(material, "duration_minutes", "duration")} ${t("دقيقة", "min")}`} /> : null}<ValueRow label={t("متبقي", "Remaining")} value={`${number(material, "days_remaining") ?? 0} ${t("يوم", "days")}`} />{value(material, "ai_report") !== null ? <View style={[styles.materialReport, { backgroundColor: colors.navySoft, borderColor: colors.primary }]}><Text style={[styles.materialReportLabel, { color: colors.primary }]}>{t("تقرير الجلسة", "Session report")}</Text><SessionReport value={value(material, "ai_report")} /></View> : null}{text(material, "recording_url") ? <Pressable onPress={() => void openRecording(text(material, "recording_url")).catch(() => Alert.alert(t("تعذر فتح التسجيل", "Unable to open recording"), t("تحقق من الاتصال وحاول مرة أخرى.")))} style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.tealSoft }, pressed && styles.pressed]}><Text style={[styles.actionText, { color: colors.teal }]}>{t("فتح تسجيل الجلسة", "Open session recording")}</Text><Icon name="play-circle" size={15} color={colors.teal} /></Pressable> : <View style={[styles.pendingMaterial, { backgroundColor: colors.muted }]}><Icon name="clock" size={15} color={colors.mutedForeground} /><Text style={[styles.pendingMaterialText, { color: colors.mutedForeground }]}>{t("جاري تجهيز تسجيل الجلسة", "Session recording is being prepared")}</Text></View>}</View>)}</Screen>;
}

export function ConnectedSectionScreen({ section }: { section: ConnectedSection }) {
  if (section === "subscriptions") return <SubscriptionsScreen detail={false} />;
  if (section === "subscription") return <SubscriptionsScreen detail />;
  if (section === "invoices") return <InvoicesScreen />;
  if (section === "wallet") return <WalletScreen />;
  return <MaterialsScreen teacher={section === "teacher-materials"} />;
}

const styles = StyleSheet.create({
  state: { minHeight: 150, alignItems: "center", justifyContent: "center", gap: 10 },
  stateText: { fontSize: 11, fontFamily: "Inter_500Medium", writingDirection: "rtl" },
  hero: { minHeight: 158, borderRadius: 23, padding: 17, flexDirection: "row", alignItems: "center", marginBottom: 25 },
  heroIcon: { width: 58, height: 58, borderRadius: 19, alignItems: "center", justifyContent: "center", marginLeft: 4 },
  heroCopy: { flex: 1, alignItems: "flex-end", marginLeft: 14 },
  heroEyebrow: { width: "100%", fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl" },
  heroTitle: { width: "100%", fontSize: 21, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl", marginTop: 6 },
  heroBody: { width: "100%", fontSize: 11, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 6 },
  card: { borderRadius: 18, borderWidth: 1, padding: 15, marginBottom: 11 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  cardMeta: { width: "100%", fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 3 },
  cardBody: { fontSize: 11, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 7 },
  featureList: { marginTop: 10, gap: 7 },
  featureRow: { flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  featureText: { flex: 1, fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl" },
  price: { fontSize: 15, fontFamily: "Inter_700Bold" },
  iconBox: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  valueRow: { minHeight: 34, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  label: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl" },
  value: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "right", writingDirection: "rtl" },
  actionButton: { minHeight: 42, borderRadius: 13, paddingHorizontal: 13, marginTop: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  actionText: { fontSize: 11, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  materialReport: { borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 11 },
  materialReportLabel: { fontSize: 10, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl", marginBottom: 4 },
  materialReportText: { fontSize: 11, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl" },
  reportSummary: { fontSize: 11, lineHeight: 19, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl" },
  reportNotice: { borderRadius: 10, padding: 9, marginTop: 9, flexDirection: "row", alignItems: "center", gap: 7 },
  reportNoticeText: { flex: 1, fontSize: 10, lineHeight: 17, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl" },
  reportGrid: { flexDirection: "row", gap: 7, marginTop: 11 },
  reportScore: { flex: 1, minHeight: 57, borderRadius: 10, padding: 7, alignItems: "center", justifyContent: "center" },
  reportScoreValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  reportScoreLabel: { fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center", writingDirection: "rtl", marginTop: 3 },
  reportMetrics: { marginTop: 8 },
  reportList: { marginTop: 10, gap: 5 },
  reportListTitle: { fontSize: 10, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  reportListItem: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 6 },
  reportBullet: { width: 5, height: 5, borderRadius: 3, marginTop: 6 },
  reportListText: { flex: 1, fontSize: 10, lineHeight: 17, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl" },
  reportGenerated: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 10 },
  pendingMaterial: { minHeight: 42, borderRadius: 13, marginTop: 13, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  pendingMaterialText: { fontSize: 11, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, fontSize: 10, fontFamily: "Inter_600SemiBold", overflow: "hidden" },
  balanceCard: { borderRadius: 20, borderWidth: 1, padding: 19, marginBottom: 17 },
  balanceLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl" },
  balance: { fontSize: 29, fontFamily: "Inter_700Bold", textAlign: "right", marginTop: 8 },
  usageCard: { borderRadius: 18, borderWidth: 1, padding: 15, marginBottom: 17 },
  usageStats: { flexDirection: "row", gap: 8, marginTop: 14 },
  usageStat: { flex: 1, minHeight: 72, borderRadius: 13, padding: 9, alignItems: "center", justifyContent: "center" },
  usageNumber: { fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center" },
  usageLabel: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center", writingDirection: "rtl", marginTop: 4 },
  progressTrack: { height: 7, borderRadius: 5, overflow: "hidden", marginTop: 15 },
  progressFill: { height: "100%", borderRadius: 5 },
  usageCaption: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 7 },
  consumptionTitle: { flex: 1, alignItems: "flex-end", marginHorizontal: 10 },
  deductionAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  invoiceActions: { flexDirection: "row", gap: 8, marginTop: 13 },
  invoiceAction: { minHeight: 40, flex: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  invoiceActionText: { fontSize: 10, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  promoCard: { borderRadius: 18, borderWidth: 1, padding: 15, marginBottom: 13 },
  promoLabel: { fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  promoInput: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginTop: 9, textAlign: "right", writingDirection: "rtl", fontSize: 12, fontFamily: "Inter_500Medium" },
  subscriptionSections: { gap: 10, marginBottom: 14 },
  subscriptionSection: { gap: 8 },
  subscriptionHeader: { minHeight: 45, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  subscriptionHeaderText: { flex: 1, fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  pressed: { opacity: 0.72 },
});