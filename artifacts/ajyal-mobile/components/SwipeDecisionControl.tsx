import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND_ICON } from '@/components/AjyalUI';
import { useColors } from '@/hooks/useColors';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { bookingSwipeDecision, type BookingSwipeDecision } from '@/lib/bookingSwipeDecision';

type Props = {
  disabled?: boolean;
  onDecision: (decision: BookingSwipeDecision) => void;
};

const HANDLE_SIZE = 48;

function withOpacity(color: string, opacity: number) {
  const normalized = color.replace('#', '');
  if (normalized.length !== 6) return color;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

export default function SwipeDecisionControl({ disabled = false, onDecision }: Props) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  const width = useSharedValue(0);
  const threshold = useSharedValue(72);

  const pan = useMemo(() => Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-8, 8])
    .onUpdate((event) => {
      const limit = Math.max(0, width.get() / 2 - HANDLE_SIZE / 2);
      translateX.set(Math.max(-limit, Math.min(limit, event.translationX)));
    })
    .onEnd((event) => {
      const decision = bookingSwipeDecision(translateX.get(), event.velocityX, threshold.get());
      if (decision) {
        scheduleOnRN(onDecision, decision);
        scheduleOnRN(Haptics.impactAsync, Haptics.ImpactFeedbackStyle.Medium);
      }
      translateX.set(withSpring(0, {
        duration: 400,
        dampingRatio: 0.8,
        velocity: event.velocityX,
        reduceMotion: ReduceMotion.System,
      }));
    })
    .onFinalize((_event, success) => {
      if (!success) {
        translateX.set(withSpring(0, {
          duration: reducedMotion ? 180 : 400,
          dampingRatio: 0.8,
          reduceMotion: ReduceMotion.System,
        }));
      }
    }), [disabled, onDecision, reducedMotion]);

  const trackStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      translateX.get(),
      [-threshold.get(), 0, threshold.get()],
      [colors.destructive, colors.border, colors.teal],
    ),
  }), [colors.border, colors.destructive, colors.teal]);
  const tintStyle = useAnimatedStyle(() => ({
    backgroundColor: translateX.get() < 0 ? colors.destructive : colors.teal,
    opacity: Math.min(1, Math.abs(translateX.get()) / Math.max(1, threshold.get())),
  }), [colors.destructive, colors.teal]);
  const declineTextColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      translateX.get(),
      [-threshold.get(), 0, threshold.get()],
      [colors.destructiveForeground, colors.destructive, colors.secondaryForeground],
    ),
  }), [colors.destructive, colors.destructiveForeground, colors.secondaryForeground]);
  const acceptTextColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      translateX.get(),
      [-threshold.get(), 0, threshold.get()],
      [colors.destructiveForeground, colors.teal, colors.secondaryForeground],
    ),
  }), [colors.destructiveForeground, colors.secondaryForeground, colors.teal]);
  const declineLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.get(), [-threshold.get(), 0, threshold.get()], [1, 0.82, 0.52], Extrapolation.CLAMP),
  }));
  const acceptLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.get(), [-threshold.get(), 0, threshold.get()], [0.52, 0.82, 1], Extrapolation.CLAMP),
  }));
  const handleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  const updateWidth = (event: { nativeEvent: { layout: { width: number } } }) => {
    const nextWidth = event.nativeEvent.layout.width;
    width.set(nextWidth);
    threshold.set(Math.min(82, Math.max(62, nextWidth * 0.23)));
  };
  const handleAccessibilityAction = (event: { nativeEvent: { actionName: string } }) => {
    if (disabled) return;
    if (event.nativeEvent.actionName === 'increment') onDecision('accepted');
    if (event.nativeEvent.actionName === 'decrement') onDecision('rejected');
  };

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('قبول أو رفض الطلب', 'Accept or decline this request')}
        accessibilityHint={t('اسحب الشعار يميناً للقبول أو يساراً للرفض', 'Swipe the logo right to accept or left to decline')}
        accessibilityActions={[
          { name: 'increment', label: t('قبول الطلب', 'Accept request') },
          { name: 'decrement', label: t('رفض الطلب', 'Decline request') },
        ]}
        onAccessibilityAction={handleAccessibilityAction}
        onLayout={updateWidth}
        testID="booking-swipe-decision-control"
        style={[styles.track, { opacity: disabled ? 0.62 : 1, backgroundColor: colors.muted }, trackStyle]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={[withOpacity(colors.teal, 0.16), withOpacity(colors.primary, 0.11), withOpacity(colors.teal, 0.23)]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View pointerEvents="none" style={[styles.tintOverlay, tintStyle]} />
        <View pointerEvents="none" style={styles.trackLabels}>
          <Animated.View style={[styles.labelGroup, declineLabelStyle]}>
            <Animated.Text style={[styles.declineLabel, declineTextColorStyle, { writingDirection: direction }]}>
              {t('← اسحب للرفض', '← Swipe to decline')}
            </Animated.Text>
          </Animated.View>
          <Animated.View style={[styles.labelGroup, acceptLabelStyle]}>
            <Animated.Text style={[styles.acceptLabel, acceptTextColorStyle, { writingDirection: direction }]}>
              {t('اسحب للقبول →', 'Swipe to accept →')}
            </Animated.Text>
          </Animated.View>
        </View>
        <Animated.View testID="booking-swipe-handle" style={[styles.handle, { borderColor: colors.border, backgroundColor: colors.card }, handleStyle]}>
          <Image source={BRAND_ICON} resizeMode="contain" style={styles.logo} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 58,
    borderWidth: 1,
    borderRadius: 29,
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 4,
  },
  tintOverlay: {
    ...StyleSheet.absoluteFill,
  },
  trackLabels: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 11,
  },
  labelGroup: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 },
  declineLabel: { fontSize: 11, lineHeight: 14, fontFamily: 'Inter_700Bold', fontWeight: '700' },
  acceptLabel: { fontSize: 11, lineHeight: 14, fontFamily: 'Inter_700Bold', fontWeight: '700' },
  handle: {
    position: 'absolute',
    left: '50%',
    marginLeft: -24,
    width: 48,
    height: 48,
    borderWidth: 1,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#10243E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
  },
  logo: { width: 30, height: 30, borderRadius: 9 },
});
