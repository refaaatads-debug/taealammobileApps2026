import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/AjyalUI";
import type { GooglePlaceDetails } from "@/lib/googlePlaces";

type Props = {
  latitude: string;
  longitude: string;
  locationGranted: boolean;
  colors: { card: string; border: string; teal: string; tealSoft: string; foreground: string; mutedForeground: string; destructive: string };
  onChange: (latitude: number, longitude: number) => void;
  onPlaceSelect?: (place: GooglePlaceDetails) => void;
  searchPlaceholder?: string;
  webMessage: string;
};

export default function InPersonLocationPicker({ colors, webMessage }: Props) {
  return (
    <View style={[styles.fallback, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Icon name="map-pin" size={18} color={colors.teal} />
      <Text style={{ color: colors.mutedForeground }}>{webMessage}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { minHeight: 92, borderWidth: 1, borderRadius: 12, marginTop: 8, padding: 14, flexDirection: "row", alignItems: "center", gap: 8 },
});
