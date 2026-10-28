import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import { Icon } from "@/components/AjyalUI";
import { supabase } from "@/lib/supabase";
import { canRevealInPersonAttendanceCode } from "@/lib/inPersonScheduling";
import StudentLocationLink from "@/components/StudentLocationLink";

export default function TeacherInPersonCode({
  bookingId,
  details,
}: {
  bookingId: string;
  details?: Record<string, unknown>;
}) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const addressQuery = useQuery({
    queryKey: ["in-person-address-snapshot", bookingId],
    enabled: Boolean(supabase && bookingId && !details),
    staleTime: 60_000,
    queryFn: async () => {
      if (!supabase) throw new Error(t("تعذر الاتصال بالمنصة.", "Platform connection unavailable."));
      const { data, error: queryError } = await supabase
        .from("bookings" as any)
        .select("scheduled_at,visit_address_snapshot")
        .eq("id", bookingId)
        .maybeSingle();
      if (queryError) throw queryError;
      return data as Record<string, unknown> | null;
    },
  });
  const bookingDetails = details ?? addressQuery.data;
  const snapshot = bookingDetails && typeof bookingDetails === "object"
    ? (bookingDetails as Record<string, unknown>).visit_address_snapshot as Record<string, unknown> | null
    : null;
  const location = [snapshot?.street_address, snapshot?.district, snapshot?.city_name]
    .map((value) => typeof value === "string" ? value.trim() : "")
    .filter(Boolean)
    .join(" · ");
  const canReveal = canRevealInPersonAttendanceCode(
    typeof bookingDetails?.scheduled_at === "string" ? bookingDetails.scheduled_at : "",
    nowMs,
  );

  const revealCode = async () => {
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("get_in_person_attendance_code", { p_booking_id: bookingId });
      if (result.error || typeof result.data !== "string") {
        setError(result.error?.message || t("تعذر إظهار الرمز لهذه الحصة الآن.", "The code is not available for this lesson right now."));
        return;
      }
      setCode(result.data);
    } catch (rpcError) {
      setError(rpcError instanceof Error ? rpcError.message : t("تعذر إظهار الكود.", "Could not show the code."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      {location ? (
        <StudentLocationLink address={location} latitude={snapshot?.latitude} longitude={snapshot?.longitude} />
      ) : null}
      {code || canReveal ? (
        <Pressable
          testID={`show-in-person-code-${bookingId}`}
          accessibilityRole="button"
          disabled={busy || Boolean(code)}
          onPress={(event) => { event.stopPropagation(); void revealCode(); }}
          style={({ pressed }) => [styles.button, { borderColor: colors.teal, opacity: busy ? 0.6 : 1 }, pressed && styles.pressed]}
        >
          <Icon name={code ? "check-circle" : "key"} size={14} color={colors.teal} />
          <Text style={[styles.buttonText, { color: colors.teal, writingDirection: direction }]}>
            {code ? t("تم إظهار كود الحضور", "Attendance code revealed") : busy ? t("جارٍ إظهار الرمز…", "Loading code…") : t("إظهار كود الحضور", "Show attendance code")}
          </Text>
        </Pressable>
      ) : (
        <Text style={[styles.hint, { color: colors.mutedForeground, writingDirection: direction }]}>
          {t("يمكن إظهار الكود فور قبول الحصة وحتى 15 دقيقة بعد موعدها.", "The code is available as soon as the lesson is accepted and until 15 minutes after its scheduled time.")}
        </Text>
      )}
      {code ? <Text selectable accessibilityLabel={t("كود الحضور", "Attendance code")} style={[styles.code, { color: colors.primary }]}>{code}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive, writingDirection: direction }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6, marginTop: 4 },
  button: { minHeight: 34, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6 },
  buttonText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 10, lineHeight: 14, fontFamily: "Inter_500Medium", textAlign: "right" },
  code: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: 5, textAlign: "center" },
  error: { fontSize: 10, lineHeight: 14, fontFamily: "Inter_500Medium", textAlign: "right" },
  pressed: { opacity: 0.72 },
});
