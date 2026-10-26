import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { BRAND_ICON } from '@/components/AjyalUI';
import { useColors } from '@/hooks/useColors';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { bookingSwipeDecision, type BookingSwipeDecision } from '@/lib/bookingSwipeDecision';

type Props = {
  disabled?: boolean;
  onDecision: (decision: BookingSwipeDecision) => void;
};

const HANDLE_SIZE = 48;

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
    .onFinalize(() => {
      translateX.set(withSpring(0, {
        duration: reducedMotion ? 180 : 400,
        dampingRatio: 0.8,
        reduceMotion: ReduceMotion.System,
      }));
    }), [disabled, onDecision, reducedMotion]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      translateX.get(),
      [-threshold.get(), 0, threshold.get()],
      [colors.destructive, colors.muted, colors.teal],
    ),
  }), [colors.destructive, colors.muted, colors.teal]);
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
        style={[styles.track, { borderColor: colors.border, opacity: disabled ? 0.62 : 1 }, trackStyle]}
      >
        <View pointerEvents="none" style={styles.trackLabels}>
          <Text style={[styles.declineLabel, { color: colors.destructive, writingDirection: direction }]}>{t('اسحب للرفض', 'Swipe to decline')}</Text>
          <Text style={[styles.acceptLabel, { color: colors.teal, writingDirection: direction }]}>{t('اسحب للقبول', 'Swipe to accept')}</Text>
        </View>
        <Animated.View style={[styles.handle, { borderColor: colors.border, backgroundColor: colors.card }, handleStyle]}>
          <Image source={BRAND_ICON} resizeMode="contain" style={styles.logo} />
          <View style={[styles.dot, styles.dotLeft, { backgroundColor: colors.teal }]} />
          <View style={[styles.dot, styles.dotRight, { backgroundColor: colors.destructive }]} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 58,
    borderWidth: 1,
    borderRadius: 18,
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 4,
  },
  trackLabels: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  declineLabel: { fontSize: 11, fontWeight: '700' },
  acceptLabel: { fontSize: 11, fontWeight: '700' },
  handle: {
    position: 'absolute',
    left: '50%',
    marginLeft: -HANDLE_SIZE / 2,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  logo: { width: 30, height: 30, borderRadius: 9 },
  dot: { position: 'absolute', top: 20, width: 4, height: 4, borderRadius: 2 },
  dotLeft: { left: -8 },
  dotRight: { right: -8 },
});
