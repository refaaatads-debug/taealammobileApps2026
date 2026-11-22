import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import VoiceOrb, { type VoiceOrbState } from "@/components/VoiceOrb";
import { Icon } from "@/components/AjyalUI";

type Props = {
  visible: boolean;
  state: VoiceOrbState;
  level: number;
  statusTitle: string;
  statusBody?: string;
  muted: boolean;
  canSendNow?: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
  onSendNow?: () => void;
};

export default function VoiceModeScreen({
  visible,
  state,
  level,
  statusTitle,
  statusBody,
  muted,
  canSendNow,
  onToggleMute,
  onEnd,
  onSendNow,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onEnd}>
      <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28 }]}>
        <Text style={styles.brand}>أجيال المعرفة</Text>
        <View style={styles.orbWrap}>
          <VoiceOrb state={state} level={level} size={280} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.title} accessibilityLiveRegion="polite">{statusTitle}</Text>
          {statusBody ? <Text style={styles.body}>{statusBody}</Text> : null}
          {canSendNow && onSendNow ? (
            <Pressable testID="send-voice-now" onPress={onSendNow} style={styles.sendNow} accessibilityRole="button">
              <Text style={styles.sendNowText}>إرسال الآن</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.buttons}>
          <Pressable
            testID="end-voice-mode"
            accessibilityRole="button"
            accessibilityLabel="إنهاء المحادثة"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onEnd();
            }}
            style={[styles.round, styles.endButton]}
          >
            <Icon name="x" size={28} color="#FFFFFF" />
          </Pressable>
          <Pressable
            testID="toggle-voice-mute"
            accessibilityRole="button"
            accessibilityState={{ selected: muted }}
            accessibilityLabel={muted ? "تشغيل الميكروفون" : "كتم الميكروفون"}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => {});
              onToggleMute();
            }}
            style={[styles.round, muted ? styles.mutedButton : styles.micButton]}
          >
            <Icon name={muted ? "mic-off" : "mic"} size={28} color={muted ? "#0F1E3D" : "#FFFFFF"} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B1730", alignItems: "center", justifyContent: "space-between" },
  brand: { color: "#4FC59A", fontSize: 15, fontWeight: "600", opacity: 0.9 },
  orbWrap: { alignItems: "center", justifyContent: "center" },
  texts: { alignItems: "center", paddingHorizontal: 32, minHeight: 110 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", textAlign: "center" },
  body: { color: "#A9B8D6", fontSize: 14, marginTop: 8, textAlign: "center", lineHeight: 22 },
  sendNow: { marginTop: 14, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 99, backgroundColor: "#2E9E79" },
  sendNowText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  buttons: { flexDirection: "row", gap: 36, alignItems: "center", justifyContent: "center" },
  round: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  endButton: { backgroundColor: "#D45B52" },
  micButton: { backgroundColor: "#1F3560" },
  mutedButton: { backgroundColor: "#FFFFFF" },
});
