import React, { useEffect, useId } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import { Header, Icon, Screen, SectionHeading } from "@/components/AjyalUI";
import {
  getLearningMaterialHostname,
  getLearningMaterialLabel,
  getSafeLearningMaterialUrl,
} from "@/lib/learningMaterialLinks";

type LearningMaterialLink = {
  id: string;
  name: string;
  description: string;
  url: string;
  sort_order: number;
  created_at: string;
};

const queryKey = ["teacher-learning-material-links"] as const;

export default function TeacherLearningMaterialsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { t, direction, formatNumber } = useAppPreferences();
  const isRTL = direction === "rtl";
  const queryClient = useQueryClient();
  const channelId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const materials = useQuery<LearningMaterialLink[], Error>({
    queryKey,
    queryFn: async () => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("learning_material_links")
        .select("id,name,description,url,sort_order,created_at")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LearningMaterialLink[];
    },
    staleTime: 60_000,
    refetchOnMount: true,
    retry: false,
  });

  useEffect(() => {
    if (!supabase || !user?.id) return undefined;
    const channel = supabase
      .channel(`teacher-learning-materials-${user.id}-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "learning_material_links" }, () => {
        void queryClient.invalidateQueries({ queryKey });
      })
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [channelId, queryClient, user?.id]);

  const openSource = async (rawUrl: string) => {
    const url = getSafeLearningMaterialUrl(rawUrl);
    if (!url) {
      Alert.alert(
        t("الرابط غير آمن", "Unsafe link"),
        t("تعذر فتح المصدر لأن رابطه لا يستخدم HTTPS.", "This source could not be opened because it does not use HTTPS."),
      );
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        t("تعذر فتح المصدر", "Could not open source"),
        t("تحقق من اتصالك وحاول مرة أخرى.", "Check your connection and try again."),
      );
    }
  };

  return (
    <Screen>
      <Header title="" onBack={() => router.back()} />

      <LinearGradient
        colors={[colors.primary, colors.teal]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { flexDirection: isRTL ? "row-reverse" : "row" }]}
      >
        <View style={[styles.heroIcon, { backgroundColor: colors.card }]}>
          <Icon name="book-open" size={23} color={colors.teal} />
        </View>
        <View style={[styles.heroCopy, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
          <Text style={[styles.heroEyebrow, { writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>
            {t("مصادر المعلم", "Teacher resources")}
          </Text>
          <Text style={[styles.heroTitle, { writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>
            {t("جهّز المادة العلمية", "Prepare your lesson")}
          </Text>
          <Text style={[styles.heroBody, { writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>
            {t("روابط الكتب والمصادر التي تساعدك على تجهيز الدرس ومراجعة المنهج.", "Books and learning sources to help you prepare lessons and review the curriculum.")}
          </Text>
        </View>
      </LinearGradient>

      {!materials.isLoading && !materials.isError ? (
        <View style={[styles.summaryCard, { backgroundColor: colors.tealSoft, borderColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={[styles.summaryIcon, { backgroundColor: colors.card }]}>
            <Icon name="layers" size={17} color={colors.teal} />
          </View>
          <View style={[styles.summaryCopy, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
            <Text style={[styles.summaryCount, { color: colors.foreground, writingDirection: direction }]}>
              {formatNumber(materials.data?.length ?? 0)}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground, writingDirection: direction }]}>
              {t("مصدر متاح للمعلمين", "sources available to teachers")}
            </Text>
          </View>
          <View style={[styles.activeBadge, { backgroundColor: colors.card, flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={[styles.activeDot, { backgroundColor: colors.teal }]} />
            <Text style={[styles.activeLabel, { color: colors.teal, writingDirection: direction }]}>
              {t("محدّثة", "Updated")}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.sectionIntro, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={styles.sectionIntroCopy}>
          <SectionHeading title={t("مصادر المنهج", "Curriculum sources")} />
          <Text style={[styles.sectionDescription, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>
            {t("اختر المصدر المناسب لعرض الكتب والمواد الدراسية الرسمية.", "Open a source to find official textbooks and learning materials.")}
          </Text>
        </View>
        {materials.data?.length ? (
          <Text style={[styles.sourceCount, { color: colors.primary, backgroundColor: colors.navySoft, writingDirection: direction }]}>
            {formatNumber(materials.data.length)}
          </Text>
        ) : null}
      </View>

      {materials.isLoading ? (
        <View style={[styles.loadingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator color={colors.teal} />
          <Text style={[styles.stateText, { color: colors.mutedForeground, writingDirection: direction }]}>
            {t("جارٍ تحميل مصادر المنهج…", "Loading curriculum sources…")}
          </Text>
        </View>
      ) : materials.isError ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.stateIcon, { backgroundColor: colors.accent }]}>
            <Icon name="alert-circle" size={21} color={colors.destructive} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.foreground, writingDirection: direction }]}>
            {t("تعذر تحميل مصادر المادة العلمية", "Could not load lesson resources")}
          </Text>
          <Text style={[styles.stateBody, { color: colors.mutedForeground, writingDirection: direction }]}>
            {t("تحقق من الاتصال ثم أعد المحاولة.", "Check your connection and try again.")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void materials.refetch()}
            style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
          >
            <Icon name="refresh-cw" size={15} color={colors.primaryForeground} />
            <Text style={[styles.retryText, { color: colors.primaryForeground, writingDirection: direction }]}>
              {t("إعادة المحاولة", "Try again")}
            </Text>
          </Pressable>
        </View>
      ) : materials.data?.length ? (
        <View style={styles.sourcesList}>
          {materials.data.map((material, index) => {
            const label = getLearningMaterialLabel(material.name);
            const hostname = getLearningMaterialHostname(material.url);
            return (
              <View
                key={material.id}
                testID={`learning-material-${material.id}`}
                style={[styles.sourceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[styles.sourceTop, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <View style={[styles.sourceIcon, { backgroundColor: colors.goldSoft }]}>
                    <Icon name="book-open" size={19} color={colors.accentForeground} />
                  </View>
                  <View style={[styles.sourceTitleBlock, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                    <Text style={[styles.categoryPill, { color: colors.teal, backgroundColor: colors.tealSoft, writingDirection: direction }]}>
                      {t(label.category, label.category)}
                    </Text>
                    <Text style={[styles.sourceTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>
                      {t(label.title, label.title)}
                    </Text>
                  </View>
                  <Text style={[styles.sourceIndex, { color: colors.mutedForeground }]}>
                    {formatNumber(index + 1).toString().padStart(2, "0")}
                  </Text>
                </View>

                <Text style={[styles.sourceDescription, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>
                  {t(material.description, material.description)}
                </Text>

                {hostname ? (
                  <View style={[styles.hostRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <Icon name="globe" size={13} color={colors.mutedForeground} />
                    <Text numberOfLines={1} style={[styles.hostText, { color: colors.mutedForeground }]}>{hostname}</Text>
                  </View>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("فتح المصدر", "Open source")} ${label.title}`}
                  testID={`open-learning-material-${material.id}`}
                  onPress={() => void openSource(material.url)}
                  style={({ pressed }) => [
                    styles.openButton,
                    { backgroundColor: colors.tealSoft, borderColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.openButtonText, { color: colors.teal, writingDirection: direction }]}>
                    {t("فتح المصدر", "Open source")}
                  </Text>
                  <Icon name="external-link" size={16} color={colors.teal} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.stateIcon, { backgroundColor: colors.tealSoft }]}>
            <Icon name="book-open" size={21} color={colors.teal} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.foreground, writingDirection: direction }]}>
            {t("لا توجد روابط مفعّلة الآن", "No active sources right now")}
          </Text>
          <Text style={[styles.stateBody, { color: colors.mutedForeground, writingDirection: direction }]}>
            {t("ستظهر هنا روابط المواد الدراسية التي تتيحها المنصة للمعلمين.", "Platform-approved learning sources will appear here when available.")}
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 160, borderRadius: 24, padding: 18, alignItems: "center", gap: 14, overflow: "hidden", marginBottom: 16 },
  heroIcon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, gap: 5 },
  heroEyebrow: { color: "#FFFFFFB8", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  heroTitle: { color: "#FFFFFF", fontSize: 20, fontFamily: "Inter_700Bold" },
  heroBody: { color: "#FFFFFFD9", fontSize: 11, lineHeight: 18, fontFamily: "Inter_400Regular" },
  summaryCard: { minHeight: 76, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderRadius: 18, alignItems: "center", gap: 11, marginBottom: 20 },
  summaryIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  summaryCopy: { flex: 1, gap: 2 },
  summaryCount: { fontSize: 18, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  activeBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, alignItems: "center", gap: 5 },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  activeLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  sectionIntro: { alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionIntroCopy: { flex: 1 },
  sectionDescription: { fontSize: 10, lineHeight: 16, marginTop: 3, paddingHorizontal: 3, fontFamily: "Inter_400Regular" },
  sourceCount: { overflow: "hidden", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, fontSize: 10, fontFamily: "Inter_700Bold" },
  sourcesList: { gap: 11, paddingBottom: 12 },
  sourceCard: { borderRadius: 20, padding: 14, borderWidth: 1, shadowColor: "#183A60", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  sourceTop: { alignItems: "flex-start", gap: 10 },
  sourceIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  sourceTitleBlock: { flex: 1, gap: 5 },
  categoryPill: { fontSize: 9, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, overflow: "hidden", fontFamily: "Inter_600SemiBold" },
  sourceTitle: { fontSize: 15, lineHeight: 21, fontFamily: "Inter_700Bold" },
  sourceIndex: { fontSize: 10, fontFamily: "Inter_600SemiBold", paddingTop: 2 },
  sourceDescription: { fontSize: 11, lineHeight: 18, marginTop: 12, fontFamily: "Inter_400Regular" },
  hostRow: { alignItems: "center", gap: 6, marginTop: 9 },
  hostText: { flex: 1, fontSize: 10, textAlign: "left", writingDirection: "ltr", fontFamily: "Inter_500Medium" },
  openButton: { minHeight: 44, marginTop: 13, paddingHorizontal: 13, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "space-between" },
  openButtonText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  loadingCard: { minHeight: 170, borderWidth: 1, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 11 },
  stateCard: { minHeight: 220, padding: 21, borderWidth: 1, borderRadius: 22, alignItems: "center", justifyContent: "center", gap: 9, marginBottom: 15 },
  stateIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 3 },
  stateTitle: { fontSize: 14, textAlign: "center", fontFamily: "Inter_700Bold" },
  stateBody: { maxWidth: 280, fontSize: 10, lineHeight: 17, textAlign: "center", fontFamily: "Inter_400Regular" },
  stateText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  retryButton: { minHeight: 41, borderRadius: 13, paddingHorizontal: 15, marginTop: 5, flexDirection: "row", alignItems: "center", gap: 8 },
  retryText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
});
