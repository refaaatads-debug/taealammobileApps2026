import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/AjyalUI";

type Props = {
  latitude: string;
  longitude: string;
  locationGranted: boolean;
  colors: { card: string; border: string; teal: string; tealSoft: string; mutedForeground: string };
  onChange: (latitude: number, longitude: number) => void;
  webMessage: string;
};

export default function InPersonLocationPicker({ colors, webMessage }: Props) {
  return (
    <View style={[styles.fallback, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.tealSoft }]}>
        <Icon name="map-pin" size={18} color={colors.teal} />
      </View>
      <Text style={[styles.message, { color: colors.mutedForeground }]}>{webMessage}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { minHeight: 70, borderWidth: 1, borderRadius: 14, marginTop: 3, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  iconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  message: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl" },
});
