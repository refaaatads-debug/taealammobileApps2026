import React, { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, Path, RadialGradient, Stop, Circle } from "react-native-svg";

export type VoiceOrbState = "idle" | "listening" | "thinking" | "speaking" | "muted";

type Props = {
  state: VoiceOrbState;
  /** Mic level 0..1, used while listening. */
  level?: number;
  size?: number;
};

const NAVY = "#0F1E3D";
const NAVY_MID = "#173E8C";
const TEAL = "#2E9E79";
const TEAL_LIGHT = "#4FC59A";

// Ajyal star: 8 points with rounded tips and a slight pinwheel twist.
function starPath(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const tip = ((i * 45 - 90 - 6) * Math.PI) / 180;
    const notch = ((i * 45 + 22.5 - 90 + 4) * Math.PI) / 180;
    pts.push(`${cx + outer * Math.cos(tip)},${cy + outer * Math.sin(tip)}`);
    pts.push(`${cx + inner * Math.cos(notch)},${cy + inner * Math.sin(notch)}`);
  }
  return `M${pts.join("L")}Z`;
}

const STATE_COLOR: Record<VoiceOrbState, string> = {
  idle: TEAL,
  listening: TEAL_LIGHT,
  thinking: TEAL,
  speaking: TEAL_LIGHT,
  muted: "#52627F",
};

export default function VoiceOrb({ state, level = 0, size = 260 }: Props) {
  const reduced = useReducedMotion();
  const breathe = useSharedValue(0);
  const pulse = useSharedValue(0);
  const spin = useSharedValue(0);
  const lvl = useSharedValue(0);

  useEffect(() => {
    lvl.set(withTiming(state === "listening" ? level : 0, { duration: 160 }));
  }, [level, lvl, state]);

  useEffect(() => {
    cancelAnimation(breathe);
    cancelAnimation(pulse);
    cancelAnimation(spin);
    if (reduced) {
      breathe.set(0);
      pulse.set(0);
      return;
    }
    if (state === "idle" || state === "muted") {
      breathe.set(withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true));
      pulse.set(withTiming(0, { duration: 200 }));
    } else if (state === "speaking") {
      pulse.set(withRepeat(withSequence(
        withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
        withTiming(0.25, { duration: 420, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.8, { duration: 300, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 460, easing: Easing.inOut(Easing.quad) }),
      ), -1, false));
    } else if (state === "thinking") {
      spin.set(0);
      spin.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false));
      breathe.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true));
    } else {
      breathe.set(withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }), -1, true));
    }
  }, [breathe, pulse, reduced, spin, state]);

  const outerStyle = useAnimatedStyle(() => {
    const base = state === "muted" ? 0.96 : 1;
    const s = base + breathe.get() * 0.035 + pulse.get() * 0.09 + lvl.get() * 0.18;
    return { transform: [{ scale: s }], opacity: state === "muted" ? 0.55 : 0.9 };
  });
  const midStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breathe.get() * 0.02 + pulse.get() * 0.05 + lvl.get() * 0.1 }],
  }));
  const starStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${spin.get() * 360}deg` },
      { scale: 1 + pulse.get() * 0.04 + lvl.get() * 0.06 },
    ],
  }));

  const star = useMemo(() => starPath(50, 50, 46, 30), []);
  const accent = STATE_COLOR[state];
  const core = size * 0.34;

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel="المعلم الذكي">
      <Animated.View style={[StyleSheet.absoluteFill, outerStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="55%" stopColor={accent} stopOpacity="0.0" />
              <Stop offset="78%" stopColor={accent} stopOpacity="0.28" />
              <Stop offset="100%" stopColor={accent} stopOpacity="0.0" />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill="url(#halo)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, midStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="body" cx="38%" cy="32%" r="75%">
              <Stop offset="0%" stopColor={accent} stopOpacity="0.95" />
              <Stop offset="45%" stopColor={NAVY_MID} stopOpacity="1" />
              <Stop offset="100%" stopColor={NAVY} stopOpacity="1" />
            </RadialGradient>
            <RadialGradient id="shine" cx="35%" cy="25%" r="40%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="38" fill="url(#body)" />
          <Circle cx="50" cy="50" r="38" fill="url(#shine)" />
        </Svg>
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Animated.View style={[{ width: core, height: core }, starStyle]}>
          <Svg width={core} height={core} viewBox="0 0 100 100">
            <Path d={star} fill="#000000" opacity={0.18} transform="translate(0 2.5)" strokeLinejoin="round" stroke="#000000" strokeWidth={5} />
            <Path d={star} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={5} strokeLinejoin="round" />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
});
