import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/AjyalUI";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import { useColors } from "@/hooks/useColors";

export type InPersonTeacherResult = {
  teacher_id: string;
  full_name: string;
  avg_rating: number;
  distance_km: number;
  service_radius_km: number;
};

type Props = {
  visible: boolean;
  teachers: InPersonTeacherResult[];
  selectedTeacherIds: string[];
  subjectLabel: string;
  cityLabel: string;
  scheduledAtLabel: string;
  searching: boolean;
  sending: boolean;
  onClose: () => void;
  onToggleTeacher: (teacherId: string) => void;
  onSubmit: () => void;
  onSearchAgain: () => void;
};

export default function InPersonTeacherResultsSheet({
  visible,
  teachers,
  selectedTeacherIds,
  subjectLabel,
  cityLabel,
  scheduledAtLabel,
  searching,
  sending,
  onClose,
  onToggleTeacher,
  onSubmit,
  onSearchAgain,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, locale, direction } = useAppPreferences();
  const selectedCount = selectedTeacherIds.length;
  const textStyle = { color: colors.foreground, writingDirection: direction } as const;
  const mutedStyle = { color: colors.mutedForeground, writingDirection: direction } as const;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("إغلاق نافذة المعلمين", "Close teacher results")}
          onPress={onClose}
          style={styles.scrim}
        />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.heading}>
            <View style={[styles.headingIcon, { backgroundColor: colors.tealSoft }]}>
              <Icon name="users" size={18} color={colors.teal} />
            </View>
            <View style={styles.headingCopy}>
              <Text style={[styles.eyebrow, { color: colors.teal }]}>{t("نتائج البحث", "SEARCH RESULTS")}</Text>
              <Text style={[styles.title, textStyle]}>{t("المعلمون المتاحون", "Available teachers")}</Text>
              <Text style={[styles.subtitle, mutedStyle]}>{t("اختر معلماً أو أكثر لإرسال طلب الحجز", "Choose one or more teachers for your request")}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("إغلاق", "Close")}
              onPress={onClose}
              hitSlop={8}
              style={[styles.closeButton, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <Icon name="x" size={17} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={styles.summary}>
            {[
              { icon: "book-open" as const, label: subjectLabel },
              { icon: "map-pin" as const, label: cityLabel },
              { icon: "clock" as const, label: scheduledAtLabel },
            ].filter((item) => item.label).map((item) => (
              <View key={item.icon} style={[styles.summaryChip, { backgroundColor: colors.muted }]}>
                <Icon name={item.icon} size={12} color={colors.teal} />
                <Text numberOfLines={1} style={[styles.summaryText, mutedStyle]}>{item.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.resultsHeading}>
            <Text style={[styles.resultsTitle, textStyle]}>{t("مطابقون لموعدك", "Matching your time")}</Text>
            {!searching ? <Text style={[styles.resultCount, { color: colors.teal }]}>{teachers.length.toLocaleString(locale)} {t("معلمين", "teachers")}</Text> : null}
          </View>

          {searching ? (
            <View style={styles.state}>
              <ActivityIndicator color={colors.teal} size="large" />
              <Text style={[styles.stateTitle, textStyle]}>{t("جارٍ البحث عن المعلمين", "Finding available teachers")}</Text>
              <Text style={[styles.stateDescription, mutedStyle]}>{t("نتحقق من المادة والمرحلة والموعد والعنوان.", "Checking your subject, stage, time, and location.")}</Text>
            </View>
          ) : teachers.length ? (
            <ScrollView
              style={styles.teacherScroll}
              contentContainerStyle={styles.teacherList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {teachers.map((teacher) => {
                const selected = selectedTeacherIds.includes(teacher.teacher_id);
                const rating = Number(teacher.avg_rating);
                const distance = Number(teacher.distance_km);
                const radius = Number(teacher.service_radius_km);
                return (
                  <Pressable
                    key={teacher.teacher_id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${teacher.full_name}، ${t("التقييم", "rating")} ${Number.isFinite(rating) ? rating.toLocaleString(locale, { maximumFractionDigits: 2 }) : "—"}`}
                    onPress={() => onToggleTeacher(teacher.teacher_id)}
                    style={({ pressed }) => [
                      styles.teacherCard,
                      { borderColor: selected ? colors.teal : colors.border, backgroundColor: selected ? colors.tealSoft : colors.card, opacity: pressed ? 0.82 : 1 },
                    ]}
                  >
                    <View style={[styles.teacherAvatar, { backgroundColor: selected ? colors.teal : colors.navySoft }]}>
                      {selected
                        ? <Icon name="check" size={17} color={colors.primaryForeground} />
                        : <Text style={[styles.avatarInitial, { color: colors.primary }]}>{teacher.full_name.trim().slice(0, 1) || "م"}</Text>}
                    </View>
                    <View style={styles.teacherCopy}>
                      <Text numberOfLines={1} style={[styles.teacherName, textStyle]}>{teacher.full_name}</Text>
                      <View style={styles.teacherMeta}>
                        <Icon name="map-pin" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.metaText, mutedStyle]}>{Number.isFinite(distance) ? distance.toLocaleString(locale, { maximumFractionDigits: 1 }) : "—"} {t("كم منك", "km away")}</Text>
                        <View style={[styles.metaDot, { backgroundColor: colors.border }]} />
                        <Text style={[styles.metaText, mutedStyle]}>{t("نطاق", "radius")} {Number.isFinite(radius) ? radius.toLocaleString(locale) : "—"} {t("كم", "km")}</Text>
                      </View>
                      <View style={styles.availability}>
                        <Icon name="check-circle" size={12} color={colors.teal} />
                        <Text style={[styles.availabilityText, { color: colors.teal }]}>{t("متاح لهذا الموعد", "Available at this time")}</Text>
                      </View>
                    </View>
                    <View style={styles.rating}>
                      <Icon name="star" size={12} color={colors.gold} />
                      <Text style={[styles.ratingText, { color: colors.foreground }]}>{Number.isFinite(rating) ? rating.toLocaleString(locale, { maximumFractionDigits: 2 }) : "—"}</Text>
                    </View>
                    <View style={[styles.radio, { borderColor: selected ? colors.teal : colors.border, backgroundColor: selected ? colors.teal : "transparent" }]}>
                      {selected ? <Icon name="check" size={12} color={colors.primaryForeground} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.state}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.tealSoft }]}>
                <Icon name="search" size={22} color={colors.teal} />
              </View>
              <Text style={[styles.stateTitle, textStyle]}>{t("لا يوجد معلم متاح لهذا الموعد", "No teacher is available for this time")}</Text>
              <Text style={[styles.stateDescription, mutedStyle]}>{t("جرّب موعداً آخر أو راجع العنوان والمرحلة والمادة.", "Try another time or review the address, stage, and subject.")}</Text>
              <Pressable accessibilityRole="button" onPress={onSearchAgain} style={[styles.retryButton, { borderColor: colors.border }]}>
                <Icon name="refresh-cw" size={13} color={colors.teal} />
                <Text style={[styles.retryText, { color: colors.teal }]}>{t("إعادة البحث", "Search again")}</Text>
              </Pressable>
            </View>
          )}

          {!searching && teachers.length ? (
            <View style={styles.trustNote}>
              <Icon name="shield" size={13} color={colors.teal} />
              <Text style={[styles.trustText, mutedStyle]}>{t("النتائج مطابقة للمرحلة والمادة والموعد المحدد.", "Results match your selected stage, subject, and time.")}</Text>
            </View>
          ) : null}

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <View style={styles.selectionInfo}>
              {selectedCount > 0 ? (
                <>
                  <Text style={[styles.countBadge, { color: colors.teal, backgroundColor: colors.tealSoft }]}>{selectedCount.toLocaleString(locale)}</Text>
                  <Text style={[styles.selectionText, mutedStyle]}>{selectedCount === 1 ? t("معلم محدد", "teacher selected") : t("معلمين محددين", "teachers selected")}</Text>
                </>
              ) : <Text style={[styles.selectionText, mutedStyle]}>{t("حدد المعلمين المناسبين", "Select teachers to continue")}</Text>}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !selectedCount || sending || searching }}
              disabled={!selectedCount || sending || searching}
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: colors.teal, opacity: !selectedCount || sending || searching ? 0.52 : pressed ? 0.86 : 1 },
              ]}
            >
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="send" size={15} color="#fff" />}
              <Text style={styles.submitText}>
                {sending
                  ? t("جارٍ إرسال الطلب...", "Sending request...")
                  : `${t("إرسال طلب الحجز", "Send booking request")}${selectedCount ? ` · ${selectedCount.toLocaleString(locale)}` : ""}`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(10, 24, 44, 0.48)" },
  sheet: { maxHeight: "84%", borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, paddingHorizontal: 18, paddingTop: 9, shadowColor: "#10264A", shadowOpacity: 0.2, shadowRadius: 22, shadowOffset: { width: 0, height: -8 }, elevation: 16 },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 4, marginBottom: 14 },
  heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headingCopy: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.7 },
  title: { fontSize: 17, lineHeight: 22, fontFamily: "Inter_700Bold", textAlign: "right" },
  subtitle: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_500Medium", textAlign: "right" },
  closeButton: { width: 36, height: 36, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 13, marginBottom: 11 },
  summaryChip: { minHeight: 30, maxWidth: "100%", borderRadius: 9, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  summaryText: { flexShrink: 1, fontSize: 10, fontFamily: "Inter_600SemiBold" },
  resultsHeading: { minHeight: 27, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultsTitle: { fontSize: 11, fontFamily: "Inter_700Bold" },
  resultCount: { fontSize: 10, fontFamily: "Inter_700Bold" },
  teacherScroll: { flexShrink: 1 },
  teacherList: { gap: 8, paddingVertical: 4 },
  teacherCard: { minHeight: 76, borderWidth: 1, borderRadius: 16, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 },
  teacherAvatar: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 18, fontFamily: "Inter_700Bold" },
  teacherCopy: { flex: 1, minWidth: 0, gap: 4 },
  teacherName: { fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "right" },
  teacherMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 9, fontFamily: "Inter_500Medium" },
  metaDot: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 1 },
  availability: { flexDirection: "row", alignItems: "center", gap: 4 },
  availabilityText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  rating: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 3, paddingTop: 2 },
  ratingText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  radio: { width: 21, height: 21, borderWidth: 1.5, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  trustNote: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 6 },
  trustText: { flex: 1, fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "right" },
  state: { minHeight: 140, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  stateTitle: { fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "center" },
  stateDescription: { fontSize: 11, lineHeight: 16, fontFamily: "Inter_500Medium", textAlign: "center" },
  emptyIcon: { width: 48, height: 48, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  retryButton: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 11, paddingHorizontal: 14, marginTop: 2 },
  retryText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  footer: { borderTopWidth: 1, paddingTop: 10, marginTop: 4, flexDirection: "row", alignItems: "center", gap: 8 },
  selectionInfo: { minWidth: 92, flexDirection: "row", alignItems: "center", gap: 5 },
  countBadge: { minWidth: 24, height: 24, borderRadius: 8, paddingHorizontal: 5, textAlign: "center", textAlignVertical: "center", overflow: "hidden", fontSize: 11, fontFamily: "Inter_700Bold" },
  selectionText: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  submitButton: { minHeight: 48, flex: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 10 },
  submitText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "center" },
});
