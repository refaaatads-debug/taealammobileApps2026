import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND_ICON, Icon } from '@/components/AjyalUI';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useColors } from '@/hooks/useColors';

type OnboardingStep = {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  eyebrow: string;
  eyebrowEnglish: string;
  title: string;
  titleEnglish: string;
  body: string;
  bodyEnglish: string;
  accent: 'navy' | 'teal' | 'gold';
};

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'goal',
    icon: 'target',
    eyebrow: 'الخطوة الأولى',
    eyebrowEnglish: 'STEP ONE',
    title: 'ابدأ بهدف واضح',
    titleEnglish: 'Start with a clear goal',
    body: 'حدّد ما تريد فهمه، وسنساعدك على تحويله إلى خطوة تعليمية قابلة للإنجاز.',
    bodyEnglish: 'Name what you want to understand, and we’ll turn it into a practical next step.',
    accent: 'navy',
  },
  {
    id: 'lesson',
    icon: 'book-open',
    eyebrow: 'الخطوة الثانية',
    eyebrowEnglish: 'STEP TWO',
    title: 'اختر درسًا يناسب طريقك',
    titleEnglish: 'Find the lesson that fits',
    body: 'استكشف المواد والمعلمين الذين يشاركونك هدفك، ثم اختر الوقت الذي يناسب يومك.',
    bodyEnglish: 'Explore materials and teachers who match your goal, then choose a time that works for you.',
    accent: 'teal',
  },
  {
    id: 'teacher',
    icon: 'users',
    eyebrow: 'الخطوة الثالثة',
    eyebrowEnglish: 'STEP THREE',
    title: 'تعلّم مع معلمك',
    titleEnglish: 'Learn with your teacher',
    body: 'تصل إلى جلسة حقيقية، وتخرج منها بفهم أوضح وخطوة جديدة إلى الأمام.',
    bodyEnglish: 'Meet for a real lesson, leave with a clearer understanding, and know what to do next.',
    accent: 'gold',
  },
];

export type OnboardingScreenProps = {
  onComplete: () => void;
};

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const colors = useColors();
  const { direction, t, formatNumber } = useAppPreferences();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const transition = useRef(new Animated.Value(1)).current;
  const isRTL = direction === 'rtl';
  const step = ONBOARDING_STEPS[stepIndex];
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;
  const compact = height < 700;
  const artSize = Math.min(width - 56, compact ? 246 : 294);
  const bottomInset = insets.bottom + (Platform.OS === 'web' ? 34 : 18);
  const topInset = insets.top + (Platform.OS === 'web' ? 67 : 14);

  const accentColor = step.accent === 'teal'
    ? colors.teal
    : step.accent === 'gold'
      ? colors.accentForeground
      : colors.primary;
  const accentSurface = step.accent === 'teal'
    ? colors.tealSoft
    : step.accent === 'gold'
      ? colors.goldSoft
      : colors.navySoft;

  useEffect(() => {
    transition.setValue(0);
    Animated.timing(transition, {
      toValue: 1,
      duration: 260,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [stepIndex, transition]);

  const goNext = () => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setStepIndex((current) => current + 1);
  };

  const goBack = () => {
    if (stepIndex > 0) setStepIndex((current) => current - 1);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.topBar, { flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
          <View style={[styles.wordmark, { flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
            <View style={[styles.logoFrame, { backgroundColor: colors.primary }]}>
              <Image accessibilityLabel={t('شعار أجيال المعرفة', 'Ajyal Knowledge logo')} source={BRAND_ICON} style={styles.logo} />
            </View>
            <View style={[styles.wordmarkCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={[styles.brandName, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
                {t('أجيال المعرفة', 'Ajyal Knowledge')}
              </Text>
              <Text style={[styles.brandTagline, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
                {t('نتعلم اليوم، نصنع الغد', 'Learn today, shape tomorrow')}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel={t('تخطي التعريف', 'Skip introduction')}
            accessibilityRole="button"
            hitSlop={10}
            onPress={onComplete}
            testID="onboarding-skip"
            style={({ pressed }) => [styles.skipButton, { borderColor: colors.border }, pressed && styles.pressed]}
          >
            <Text style={[styles.skipText, { color: colors.mutedForeground }]}>{t('تخطي', 'Skip')}</Text>
          </Pressable>
        </View>

        <View style={[styles.progressRow, { flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
            {formatNumber(stepIndex + 1)} {t('من', 'of')} {formatNumber(ONBOARDING_STEPS.length)}
          </Text>
          <View
            accessibilityLabel={t(`التقدم: الخطوة ${stepIndex + 1} من ${ONBOARDING_STEPS.length}`, `Progress: step ${stepIndex + 1} of ${ONBOARDING_STEPS.length}`)}
            accessibilityRole="progressbar"
            style={[styles.progressTrack, { backgroundColor: colors.muted }]}
          >
            {ONBOARDING_STEPS.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.progressSegment,
                  { backgroundColor: index <= stepIndex ? colors.teal : colors.muted },
                  index === stepIndex && styles.progressSegmentActive,
                ]}
              />
            ))}
          </View>
        </View>

        <Animated.View
          style={[
            styles.stepContent,
            {
              opacity: transition,
              transform: [{
                translateX: transition.interpolate({
                  inputRange: [0, 1],
                  outputRange: [isRTL ? 14 : -14, 0],
                }),
              }],
            },
          ]}
        >
          <View style={[styles.illustration, { width: artSize, height: artSize, backgroundColor: accentSurface }]}>
            <View style={[styles.illustrationOrbit, { borderColor: accentColor }]} />
            <View style={[styles.illustrationOrbitSmall, { borderColor: colors.border }]} />
            <View style={[styles.artDotOne, { backgroundColor: colors.accent }]} />
            <View style={[styles.artDotTwo, { backgroundColor: colors.teal }]} />
            <View style={[styles.artCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.artCardTop, { flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
                <View style={[styles.artMiniIcon, { backgroundColor: accentSurface }]}>
                  <Icon name={step.icon} size={19} color={accentColor} />
                </View>
                <View style={styles.artLines}>
                  <View style={[styles.artLine, styles.artLineLong, { backgroundColor: colors.muted }]} />
                  <View style={[styles.artLine, styles.artLineShort, { backgroundColor: colors.muted }]} />
                </View>
              </View>
              <View style={[styles.artRule, { backgroundColor: colors.border }]} />
              <View style={styles.artChart}>
                <View style={[styles.chartBar, styles.chartBarOne, { backgroundColor: colors.navySoft }]} />
                <View style={[styles.chartBar, styles.chartBarTwo, { backgroundColor: colors.tealSoft }]} />
                <View style={[styles.chartBar, styles.chartBarThree, { backgroundColor: colors.goldSoft }]} />
                <View style={[styles.chartLine, { backgroundColor: accentColor }]} />
              </View>
              <View style={[styles.artPill, { backgroundColor: accentSurface }]}>
                <View style={[styles.artPillDot, { backgroundColor: accentColor }]} />
                <View style={[styles.artLine, styles.artPillLine, { backgroundColor: colors.border }]} />
              </View>
            </View>
            <View style={[styles.artBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Icon name={isLastStep ? 'check-circle' : 'arrow-up-right'} size={17} color={colors.teal} />
            </View>
          </View>

          <View style={[styles.copy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <View style={[styles.eyebrowRow, { flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
              <View style={[styles.eyebrowMark, { backgroundColor: accentColor }]} />
              <Text style={[styles.eyebrow, { color: accentColor, textAlign: isRTL ? 'right' : 'left' }]}>
                {t(step.eyebrow, step.eyebrowEnglish)}
              </Text>
            </View>
            <Text style={[styles.title, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
              {t(step.title, step.titleEnglish)}
            </Text>
            <Text style={[styles.body, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
              {t(step.body, step.bodyEnglish)}
            </Text>
          </View>
        </Animated.View>

        <View style={[styles.footer, { flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
          <Pressable
            accessibilityLabel={t('التالي', 'Next')}
            accessibilityRole="button"
            onPress={goNext}
            testID={isLastStep ? 'onboarding-start' : 'onboarding-next'}
            style={({ pressed }) => [
              styles.nextButton,
              { backgroundColor: colors.primary },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.nextText, { color: colors.primaryForeground }]}>
              {isLastStep ? t('ابدأ الآن', 'Start learning') : t('التالي', 'Next')}
            </Text>
            <Icon name={isRTL ? 'arrow-left' : 'arrow-right'} size={18} color={colors.tint} />
          </Pressable>
          <Pressable
            accessibilityLabel={t('العودة للخطوة السابقة', 'Go to previous step')}
            accessibilityRole="button"
            disabled={stepIndex === 0}
            onPress={goBack}
            testID="onboarding-back"
            style={({ pressed }) => [styles.backButton, { borderColor: colors.border, opacity: stepIndex === 0 ? 0.35 : 1 }, pressed && styles.pressed]}
          >
            <Icon name={isRTL ? 'arrow-right' : 'arrow-left'} size={18} color={colors.foreground} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 22 },
  topBar: { alignItems: 'center', justifyContent: 'space-between', minHeight: 46 },
  wordmark: { alignItems: 'center', gap: 9 },
  logoFrame: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 27, height: 27, borderRadius: 8 },
  wordmarkCopy: { gap: 1 },
  brandName: { fontFamily: 'Inter_700Bold', fontSize: 13, lineHeight: 17 },
  brandTagline: { fontFamily: 'Inter_500Medium', fontSize: 8, lineHeight: 12 },
  skipButton: { minHeight: 36, paddingHorizontal: 11, justifyContent: 'center', borderWidth: 1, borderRadius: 12 },
  skipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  progressRow: { alignItems: 'center', gap: 10, marginTop: 27 },
  progressLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, minWidth: 42 },
  progressTrack: { flex: 1, height: 6, maxWidth: 180, borderRadius: 8, padding: 1, flexDirection: 'row', gap: 3 },
  progressSegment: { flex: 1, borderRadius: 8, opacity: 0.8 },
  progressSegmentActive: { opacity: 1 },
  stepContent: { flex: 1, alignItems: 'center', paddingTop: 24 },
  illustration: { borderRadius: 36, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  illustrationOrbit: { position: 'absolute', width: '83%', height: '83%', borderWidth: 1, borderRadius: 999, opacity: 0.32, borderStyle: 'dashed' },
  illustrationOrbitSmall: { position: 'absolute', width: '58%', height: '58%', borderWidth: 1, borderRadius: 999, opacity: 0.44 },
  artDotOne: { position: 'absolute', width: 11, height: 11, borderRadius: 8, top: '17%', left: '20%' },
  artDotTwo: { position: 'absolute', width: 7, height: 7, borderRadius: 5, bottom: '21%', right: '18%' },
  artCard: { width: '68%', minHeight: '57%', borderRadius: 20, borderWidth: 1, padding: 13, shadowColor: '#173E8C', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  artCardTop: { alignItems: 'center', gap: 9 },
  artMiniIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  artLines: { flex: 1, gap: 7, alignItems: 'flex-end' },
  artLine: { height: 6, borderRadius: 5 },
  artLineLong: { width: '84%' },
  artLineShort: { width: '56%' },
  artRule: { height: 1, width: '100%', marginTop: 14, marginBottom: 13 },
  artChart: { height: 61, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, position: 'relative' },
  chartBar: { width: 18, borderRadius: 6 },
  chartBarOne: { height: 27 },
  chartBarTwo: { height: 43 },
  chartBarThree: { height: 34 },
  chartLine: { height: 2, width: 66, position: 'absolute', top: 17, left: '50%', transform: [{ rotate: '-14deg' }], marginLeft: -33, borderRadius: 3 },
  artPill: { height: 19, width: '76%', borderRadius: 8, marginTop: 11, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, gap: 5 },
  artPillDot: { width: 6, height: 6, borderRadius: 4 },
  artPillLine: { flex: 1, height: 5 },
  artBadge: { position: 'absolute', right: '17%', bottom: '17%', width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#173E8C', shadowOpacity: 0.12, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  copy: { width: '100%', marginTop: 27 },
  eyebrowRow: { alignItems: 'center', gap: 7 },
  eyebrowMark: { width: 18, height: 3, borderRadius: 4 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, lineHeight: 37, letterSpacing: -0.6, marginTop: 11, maxWidth: 340 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 25, marginTop: 10, maxWidth: 350 },
  footer: { alignItems: 'center', gap: 10, marginTop: 23 },
  nextButton: { flex: 1, minHeight: 56, borderRadius: 17, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12 },
  nextText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  backButton: { width: 56, height: 56, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
});

export default OnboardingScreen;