import React from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, StyleProp, TextStyle, ViewStyle } from "react-native";
import { Icon } from "@/components/AjyalUI";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import { useColors } from "@/hooks/useColors";
import { buildExternalMapUrl } from "@/lib/externalMapLocation";

export default function StudentLocationLink({
  address,
  latitude,
  longitude,
  containerStyle,
  textStyle,
  backgroundColor,
  textColor,
  iconColor,
  numberOfLines = 2,
}: {
  address: string;
  latitude?: unknown;
  longitude?: unknown;
  containerStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  backgroundColor?: string;
  textColor?: string;
  iconColor?: string;
  numberOfLines?: number;
}) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const url = buildExternalMapUrl({ address, latitude, longitude });
  const displayAddress = address.trim() || (latitude != null && longitude != null ? `${latitude}, ${longitude}` : "");

  const openLocation = async (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        t("تعذر فتح الموقع", "Could not open the location"),
        t("تحقق من توفر تطبيق خرائط أو متصفح على جهازك.", "Make sure a maps app or browser is available on your device."),
      );
    }
  };

  if (!url || !displayAddress) return null;

  return (
    <Pressable
      testID="student-location-link"
      accessibilityRole="button"
      accessibilityLabel={t(`فتح موقع الطالب في الخرائط: ${displayAddress}`, `Open student's location in Maps: ${displayAddress}`)}
      accessibilityHint={t("يفتح الموقع خارج التطبيق.", "Opens the location outside this app.")}
      onPress={(event) => { void openLocation(event); }}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: backgroundColor ?? colors.muted },
        containerStyle,
        pressed && styles.pressed,
      ]}
    >
      <Icon name="map-pin" size={14} color={iconColor ?? colors.teal} />
      <Text numberOfLines={numberOfLines} style={[styles.text, { color: textColor ?? colors.foreground, writingDirection: direction }, textStyle]}>
        {displayAddress}
      </Text>
      <Icon name="external-link" size={12} color={iconColor ?? colors.teal} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 34, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  text: { flex: 1, fontSize: 10, lineHeight: 14, fontFamily: "Inter_500Medium", textAlign: "right" },
  pressed: { opacity: 0.72 },
});
