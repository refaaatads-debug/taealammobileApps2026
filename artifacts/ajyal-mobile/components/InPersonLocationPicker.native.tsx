import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import {
  getPlacesErrorMessage,
  parseAutocompleteSuggestions,
  parsePlaceDetails,
  type GooglePlaceDetails,
  type GooglePlaceSuggestion,
} from "@/lib/googlePlaces";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

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

function placesStatus(payload: unknown, httpStatus: number): string {
  const apiStatus = (payload as { error?: { status?: unknown } } | null)?.error?.status;
  if (typeof apiStatus === "string" && apiStatus) return apiStatus;
  if (httpStatus === 401 || httpStatus === 403) return "PERMISSION_DENIED";
  if (httpStatus === 429) return "RESOURCE_EXHAUSTED";
  return "";
}

export default function InPersonLocationPicker({ latitude, longitude, locationGranted, colors, onChange, onPlaceSelect, searchPlaceholder }: Props) {
  const { t, locale } = useAppPreferences();
  const isArabic = locale.startsWith("ar");
  const mapRef = useRef<MapView | null>(null);
  const detailsController = useRef<AbortController | null>(null);
  const [sessionToken, setSessionToken] = useState(() => Crypto.randomUUID());
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState(false);
  const [suggestions, setSuggestions] = useState<GooglePlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [searchError, setSearchError] = useState("");
  const platformKey = (Constants.expoConfig?.extra as { googleMapsApiKeys?: Record<string, string> } | undefined)?.googleMapsApiKeys?.[Platform.OS];
  const lat = Number(latitude), lng = Number(longitude);
  const hasCoordinate = Number.isFinite(lat) && Number.isFinite(lng) && Boolean(latitude.trim()) && Boolean(longitude.trim());
  const coordinate = hasCoordinate ? { latitude: lat, longitude: lng } : { latitude: 23.8859, longitude: 45.0792 };
  const mapDelta = hasCoordinate ? 0.018 : 4.5;

  useEffect(() => {
    if (hasCoordinate) mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: mapDelta, longitudeDelta: mapDelta }, 250);
  }, [latitude, longitude]);

  useEffect(() => {
    const input = search.trim();
    if (committedSearch || input.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setSearchError("");
      return;
    }
    if (!platformKey) {
      setSearchError(t("إعداد البحث في خرائط Google غير متاح لهذا الجهاز.", "Google Maps place search is not configured for this device."));
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchError("");
      void fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": platformKey,
          "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
        },
        body: JSON.stringify({ input, includedRegionCodes: ["sa"], languageCode: isArabic ? "ar" : "en", sessionToken }),
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(getPlacesErrorMessage(placesStatus(payload, response.status), isArabic ? "ar" : "en"));
        }
        setSuggestions(parseAutocompleteSuggestions(payload));
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setSearchError(error instanceof Error ? error.message : getPlacesErrorMessage("", isArabic ? "ar" : "en"));
        }
      }).finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, committedSearch, platformKey, locale, isArabic, sessionToken, t]);

  useEffect(() => () => detailsController.current?.abort(), []);

  const choosePlace = async (suggestion: GooglePlaceSuggestion) => {
    if (!platformKey || selecting) return;
    detailsController.current?.abort();
    const controller = new AbortController();
    detailsController.current = controller;
    setSelecting(true);
    setSearchError("");
    setSuggestions([]);
    try {
      const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(suggestion.placeId)}?languageCode=${isArabic ? "ar" : "en"}&regionCode=SA&sessionToken=${encodeURIComponent(sessionToken)}`, {
        signal: controller.signal,
        headers: {
          "X-Goog-Api-Key": platformKey,
          "X-Goog-FieldMask": "formattedAddress,location,addressComponents",
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(getPlacesErrorMessage(placesStatus(payload, response.status), isArabic ? "ar" : "en"));
      }
      const place = parsePlaceDetails(payload);
      onChange(place.latitude, place.longitude);
      onPlaceSelect?.(place);
      setSearch(place.formattedAddress);
      setCommittedSearch(true);
      setSessionToken(Crypto.randomUUID());
    } catch (error) {
      if (!controller.signal.aborted) {
        setSearchError(error instanceof Error ? error.message : getPlacesErrorMessage("", isArabic ? "ar" : "en"));
      }
    } finally {
      if (!controller.signal.aborted) setSelecting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View>
        <TextInput
          accessibilityLabel={searchPlaceholder ?? t("ابحث عن المدينة أو العنوان", "Search for a city or address")}
          value={search}
          onChangeText={(value) => { setSearch(value.slice(0, 120)); setCommittedSearch(false); }}
          placeholder={searchPlaceholder ?? t("ابحث عن المدينة أو العنوان", "Search for a city or address")}
          placeholderTextColor={colors.mutedForeground}
          maxLength={120}
           style={[styles.searchInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isArabic ? "right" : "left", writingDirection: isArabic ? "rtl" : "ltr", paddingRight: 40 }]}
          returnKeyType="search"
        />
        {searching || selecting ? <ActivityIndicator accessibilityLabel={t("جارٍ البحث", "Searching")} color={colors.teal} style={styles.searchSpinner} /> : null}
        {searchError ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{searchError}</Text> : null}
        {!searching && search.trim().length >= 2 && suggestions.length === 0 && !searchError && !committedSearch
          ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>{t("لا توجد اقتراحات في السعودية بهذا الاسم.", "No suggestions found in Saudi Arabia.")}</Text>
          : null}
        {suggestions.length > 0 ? (
          <View accessibilityLabel={t("اقتراحات الأماكن", "Place suggestions")} style={[styles.suggestions, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion.placeId}
                accessibilityRole="button"
                disabled={selecting}
                onPress={() => void choosePlace(suggestion)}
                style={({ pressed }) => [styles.suggestion, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text numberOfLines={2} style={[styles.suggestionText, { color: colors.teal, textAlign: isArabic ? "right" : "left" }]}>{suggestion.description}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <View style={[styles.frame, { borderColor: colors.border }]}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{ ...coordinate, latitudeDelta: mapDelta, longitudeDelta: mapDelta }}
          showsUserLocation={locationGranted}
          onPress={(event) => onChange(event.nativeEvent.coordinate.latitude, event.nativeEvent.coordinate.longitude)}
        >
          {hasCoordinate ? (
            <Marker
              coordinate={{ latitude: lat, longitude: lng }}
              draggable
              onDragEnd={(event) => onChange(event.nativeEvent.coordinate.latitude, event.nativeEvent.coordinate.longitude)}
              pinColor={colors.teal}
            />
          ) : null}
        </MapView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  searchInput: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 12, fontFamily: "Inter_400Regular" },
  searchSpinner: { position: "absolute", right: 12, top: 14 },
  suggestions: { borderWidth: 1, borderRadius: 12, overflow: "hidden", marginTop: 5 },
  suggestion: { minHeight: 48, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  suggestionText: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_500Medium" },
  empty: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular", paddingHorizontal: 6, paddingVertical: 4 },
  error: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_500Medium", paddingHorizontal: 6, paddingVertical: 4 },
  frame: { borderWidth: 1, borderRadius: 14, overflow: "hidden", marginTop: 2 },
  map: { height: 156, width: "100%" },
});
