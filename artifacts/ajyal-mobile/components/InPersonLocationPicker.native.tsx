import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import { Icon } from "@/components/AjyalUI";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getPlacesErrorMessage,
  parseAutocompleteSuggestions,
  parsePlaceDetails,
  type GooglePlaceDetails,
  type GooglePlaceSuggestion,
} from "@/lib/googlePlaces";
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";

type Coordinate = { latitude: number; longitude: number };
type Props = {
  latitude: string;
  longitude: string;
  locationGranted?: boolean;
  colors: { card: string; border: string; teal: string; tealSoft: string; foreground: string; mutedForeground: string; destructive: string; primary?: string; primaryForeground?: string };
  onChange?: (latitude: number, longitude: number) => void;
  onPlaceSelect?: (place: GooglePlaceDetails) => void;
  onConfirmLocation?: (latitude: number, longitude: number, address: string, place?: GooglePlaceDetails) => void;
  searchPlaceholder?: string;
  webMessage: string;
};

const SAUDI_CENTER: Coordinate = { latitude: 23.8859, longitude: 45.0792 };

function placesStatus(payload: unknown, httpStatus: number): string {
  const apiStatus = (payload as { error?: { status?: unknown } } | null)?.error?.status;
  if (typeof apiStatus === "string" && apiStatus) return apiStatus;
  if (httpStatus === 401 || httpStatus === 403) return "PERMISSION_DENIED";
  if (httpStatus === 429) return "RESOURCE_EXHAUSTED";
  return "";
}

function isValidCoordinate(point: Coordinate): boolean {
  return Number.isFinite(point.latitude) && point.latitude >= -90 && point.latitude <= 90
    && Number.isFinite(point.longitude) && point.longitude >= -180 && point.longitude <= 180;
}

function addressFromGeocode(item: Location.LocationGeocodedAddress | undefined): string {
  if (!item) return "";
  const direct = typeof item.formattedAddress === "string" ? item.formattedAddress.trim() : "";
  if (direct) return direct;
  return [item.name, item.street, item.district, item.city, item.region, item.country]
    .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
    .filter((part, index, all) => all.indexOf(part) === index)
    .join("، ");
}

export default function InPersonLocationPicker({ latitude, longitude, colors, onChange, onPlaceSelect, onConfirmLocation, searchPlaceholder }: Props) {
  const { t, locale } = useAppPreferences();
  const insets = useSafeAreaInsets();
  const isArabic = locale.startsWith("ar");
  const mapRef = useRef<MapView | null>(null);
  const detailsController = useRef<AbortController | null>(null);
  const reverseRequestId = useRef(0);
  const [sessionToken, setSessionToken] = useState(() => Crypto.randomUUID());
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState(false);
  const [suggestions, setSuggestions] = useState<GooglePlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationPermission, setLocationPermission] = useState<Location.LocationPermissionResponse | null>(null);
  const [permissionMessage, setPermissionMessage] = useState("");
  const [pendingCoordinate, setPendingCoordinate] = useState<Coordinate>(SAUDI_CENTER);
  const [pendingAddress, setPendingAddress] = useState("");
  const [pendingPlace, setPendingPlace] = useState<GooglePlaceDetails | undefined>();
  const [hasPendingSelection, setHasPendingSelection] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const platformKey = (Constants.expoConfig?.extra as { googleMapsApiKeys?: Record<string, string> } | undefined)?.googleMapsApiKeys?.[Platform.OS];
  const mapKeyMissingMessage = t(
    "مفتاح خرائط Google غير مضمّن في نسخة التطبيق. أضفه إلى بيئة preview في EAS ثم أعد إنشاء APK.",
    "The Google Maps key is missing from this app build. Add it to the EAS preview environment and rebuild the app.",
  );
  const lat = Number(latitude);
  const lng = Number(longitude);
  const hasCoordinate = Number.isFinite(lat) && Number.isFinite(lng) && Boolean(latitude.trim()) && Boolean(longitude.trim());
  const coordinate = hasCoordinate ? { latitude: lat, longitude: lng } : SAUDI_CENTER;
  const mapDelta = hasCoordinate ? 0.018 : 4.5;

  useEffect(() => {
    const input = search.trim();
    if (!mapOpen || committedSearch || input.length < 2) {
      setSuggestions([]);
      setSearching(false);
      if (!input) setSearchError("");
      return;
    }
    if (!platformKey) {
      setSearchError(mapKeyMissingMessage);
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
        if (!response.ok) throw new Error(getPlacesErrorMessage(placesStatus(payload, response.status), isArabic ? "ar" : "en"));
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
  }, [mapOpen, search, committedSearch, platformKey, locale, isArabic, sessionToken, mapKeyMissingMessage]);

  useEffect(() => () => detailsController.current?.abort(), []);

  const resolveCoordinate = async (point: Coordinate, selectedPlace?: GooglePlaceDetails) => {
    if (!isValidCoordinate(point)) return;
    const requestId = ++reverseRequestId.current;
    setPendingCoordinate(point);
    setPendingPlace(selectedPlace);
    setHasPendingSelection(true);
    setPendingAddress(selectedPlace?.formattedAddress ?? "");
    setReverseGeocoding(!selectedPlace);
    setSearchError("");
    mapRef.current?.animateToRegion({ ...point, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 220);
    if (selectedPlace) return;
    try {
      const [result] = await Location.reverseGeocodeAsync(point);
      if (requestId !== reverseRequestId.current) return;
      const address = addressFromGeocode(result);
      setPendingAddress(address || t("موقع محدد على الخريطة", "Selected map location"));
    } catch {
      if (requestId === reverseRequestId.current) {
        setPendingAddress(t("موقع محدد على الخريطة", "Selected map location"));
        setPendingPlace(undefined);
      }
    } finally {
      if (requestId === reverseRequestId.current) setReverseGeocoding(false);
    }
  };

  const choosePlace = async (suggestion: GooglePlaceSuggestion) => {
    if (!platformKey || selecting) return;
    Keyboard.dismiss();
    detailsController.current?.abort();
    const controller = new AbortController();
    detailsController.current = controller;
    setSelecting(true);
    setSearchError("");
    setSuggestions([]);
    try {
      const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(suggestion.placeId)}?languageCode=${isArabic ? "ar" : "en"}&regionCode=SA&sessionToken=${encodeURIComponent(sessionToken)}`, {
        signal: controller.signal,
        headers: { "X-Goog-Api-Key": platformKey, "X-Goog-FieldMask": "formattedAddress,location,addressComponents" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getPlacesErrorMessage(placesStatus(payload, response.status), isArabic ? "ar" : "en"));
      const place = parsePlaceDetails(payload);
      setSearch(place.formattedAddress);
      setCommittedSearch(true);
      setSessionToken(Crypto.randomUUID());
      await resolveCoordinate({ latitude: place.latitude, longitude: place.longitude }, place);
    } catch (error) {
      if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : getPlacesErrorMessage("", isArabic ? "ar" : "en"));
    } finally {
      if (!controller.signal.aborted) setSelecting(false);
    }
  };

  const locateMe = async () => {
    Keyboard.dismiss();
    setPermissionMessage("");
    setLocating(true);
    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      const permission = currentPermission.granted ? currentPermission : await Location.requestForegroundPermissionsAsync();
      setLocationPermission(permission);
      if (!permission.granted) {
        setPermissionMessage(permission.canAskAgain
          ? t("لم يُمنح إذن الموقع. يمكنك المحاولة مجدداً أو اختيار نقطة يدوياً.", "Location access was not granted. Try again or choose a point manually.")
          : t("إذن الموقع موقوف. افتح إعدادات النظام لتفعيله، أو اختر نقطة يدوياً.", "Location access is disabled. Open system settings to enable it, or choose a point manually."));
        return;
      }
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await resolveCoordinate({ latitude: result.coords.latitude, longitude: result.coords.longitude });
    } catch {
      setPermissionMessage(t("تعذر تحديد الموقع الحالي. حرّك الخريطة لاختيار نقطة يدوياً.", "Could not determine your location. Move the map to choose a point manually."));
    } finally {
      setLocating(false);
    }
  };

  const openSettings = async () => {
    if (Platform.OS === "web") return;
    try {
      await Linking.openSettings();
    } catch {
      setPermissionMessage(t("تعذر فتح إعدادات النظام. يمكنك تحديد نقطة يدوياً على الخريطة.", "Could not open system settings. You can still choose a point manually."));
    }
  };

  const confirmLocation = () => {
    if (!hasPendingSelection || reverseGeocoding) return;
    onConfirmLocation?.(pendingCoordinate.latitude, pendingCoordinate.longitude, pendingAddress, pendingPlace);
    onChange?.(pendingCoordinate.latitude, pendingCoordinate.longitude);
    if (pendingPlace) onPlaceSelect?.(pendingPlace);
    setSearch(pendingAddress);
    setCommittedSearch(true);
    setMapOpen(false);
  };

  const region: Region = { ...pendingCoordinate, latitudeDelta: hasPendingSelection ? 0.012 : 4.5, longitudeDelta: hasPendingSelection ? 0.012 : 4.5 };

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
          style={[styles.searchInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isArabic ? "right" : "left", writingDirection: isArabic ? "rtl" : "ltr" }]}
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
              <Pressable key={suggestion.placeId} accessibilityRole="button" disabled={selecting} onPress={() => void choosePlace(suggestion)}
                style={({ pressed }) => [styles.suggestion, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                <Text numberOfLines={2} style={[styles.suggestionText, { color: colors.teal, textAlign: isArabic ? "right" : "left" }]}>{suggestion.description}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t("فتح الخريطة لتحديد الموقع", "Open the map to choose a location")} onPress={() => {
        if (!platformKey) {
          setSearchError(mapKeyMissingMessage);
          return;
        }
        setSearchError("");
        setPendingCoordinate(coordinate);
        setPendingAddress("");
        setPendingPlace(undefined);
        setHasPendingSelection(hasCoordinate);
        setMapOpen(true);
        if (hasCoordinate) void resolveCoordinate(coordinate);
      }}
        style={({ pressed }) => [styles.mapLauncher, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.78 : 1 }]}>
        <Icon name="map-pin" size={17} color={colors.teal} />
        <Text style={[styles.mapLauncherText, { color: colors.foreground }]}>
          {hasCoordinate ? t("تعديل الموقع على الخريطة", "Adjust location on the map") : t("فتح الخريطة لتحديد الموقع", "Open the map to choose a location")}
        </Text>
        <Icon name="chevron-left" size={17} color={colors.mutedForeground} />
      </Pressable>
      <Modal visible={mapOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setMapOpen(false)}>
        <View style={[styles.mapModal, { backgroundColor: colors.card }]}>
          {platformKey ? (
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              showsUserLocation={Boolean(locationPermission?.granted)}
              onPress={(event) => {
                Keyboard.dismiss();
                void resolveCoordinate(event.nativeEvent.coordinate);
              }}
            >
              {hasPendingSelection ? <Marker coordinate={pendingCoordinate} draggable pinColor={colors.teal}
                onDragEnd={(event) => void resolveCoordinate(event.nativeEvent.coordinate)} /> : null}
            </MapView>
          ) : (
            <View style={[styles.mapUnavailable, { backgroundColor: colors.card }]}>
              <View style={[styles.unavailableIcon, { backgroundColor: colors.tealSoft }]}><Icon name="map-pin" size={23} color={colors.teal} /></View>
              <Text style={[styles.mapUnavailableTitle, { color: colors.foreground }]}>{t("الخريطة غير مهيأة", "Map is not configured")}</Text>
              <Text style={[styles.empty, { color: colors.mutedForeground, textAlign: "center" }]}>{mapKeyMissingMessage}</Text>
            </View>
          )}
          <View pointerEvents="box-none" style={[styles.mapOverlay, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.mapTopRow}>
              <Pressable testID="location-map-close" accessibilityRole="button" accessibilityLabel={t("إغلاق الخريطة", "Close map")}
                onPress={() => setMapOpen(false)} style={[styles.iconButton, { backgroundColor: colors.card }]}>
                <Icon name="arrow-right" size={19} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.mapModalTitle, { color: colors.foreground }]}>{t("حدد الموقع", "Choose a location")}</Text>
              <View style={styles.iconButtonSpacer} />
            </View>
            <View style={[styles.searchDock, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Icon name="search" size={18} color={colors.mutedForeground} />
              <TextInput testID="location-map-search" accessibilityLabel={searchPlaceholder ?? t("ابحث عن مكان", "Search for a place")}
                value={search} onChangeText={(value) => { setSearch(value.slice(0, 120)); setCommittedSearch(false); }}
                placeholder={searchPlaceholder ?? t("ابحث عن مكان", "Search for a place")} placeholderTextColor={colors.mutedForeground}
                maxLength={120} returnKeyType="search"
                style={[styles.mapSearchInput, { color: colors.foreground, textAlign: isArabic ? "right" : "left", writingDirection: isArabic ? "rtl" : "ltr" }]} />
              {searching || selecting ? <ActivityIndicator size="small" color={colors.teal} /> : null}
            </View>
            {suggestions.length > 0 ? (
              <View style={[styles.mapSuggestions, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {suggestions.map((suggestion) => <Pressable key={suggestion.placeId} accessibilityRole="button" disabled={selecting}
                  onPress={() => void choosePlace(suggestion)} style={[styles.suggestion, { borderBottomColor: colors.border }]}>
                  <Text numberOfLines={2} style={[styles.suggestionText, { color: colors.foreground, textAlign: isArabic ? "right" : "left" }]}>{suggestion.description}</Text>
                </Pressable>)}
              </View>
            ) : null}
            <View style={styles.mapSpacer} />
            <Pressable testID="location-map-current-location" accessibilityRole="button" onPress={() => void locateMe()}
              style={({ pressed }) => [styles.locateButton, { backgroundColor: colors.card, opacity: pressed || locating ? 0.78 : 1 }]}>
              {locating ? <ActivityIndicator size="small" color={colors.teal} /> : <Icon name="crosshair" size={17} color={colors.teal} />}
              <Text style={[styles.locateText, { color: colors.foreground }]}>{locating ? t("جارٍ تحديد موقعك", "Finding your location") : t("تحديد موقعي", "Use my location")}</Text>
            </Pressable>
            {permissionMessage ? (
              <View style={[styles.permissionNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text accessibilityRole="alert" style={[styles.permissionText, { color: colors.mutedForeground }]}>{permissionMessage}</Text>
                {locationPermission && !locationPermission.granted && !locationPermission.canAskAgain && Platform.OS !== "web" ? (
                  <Pressable testID="location-open-settings" accessibilityRole="button" onPress={() => void openSettings()} style={styles.settingsButton}>
                    <Text style={[styles.settingsText, { color: colors.teal }]}>{t("فتح الإعدادات", "Open settings")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {searchError ? <Text accessibilityRole="alert" style={[styles.mapError, { color: colors.destructive, backgroundColor: colors.card }]}>{searchError}</Text> : null}
            <View style={[styles.addressPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.addressMarker, { backgroundColor: colors.tealSoft }]}><Icon name="map-pin" size={18} color={colors.teal} /></View>
              <View style={styles.addressCopy}>
                <Text style={[styles.addressEyebrow, { color: colors.mutedForeground }]}>{t("الموقع المحدد", "Selected location")}</Text>
                <Text numberOfLines={2} style={[styles.addressText, { color: colors.foreground, textAlign: isArabic ? "right" : "left", writingDirection: isArabic ? "rtl" : "ltr" }]}>
                  {reverseGeocoding ? t("جارٍ قراءة العنوان...", "Looking up address...") : pendingAddress || t("حرّك الخريطة أو اضغط لاختيار نقطة", "Move the map or tap to choose a point")}
                </Text>
              </View>
              {reverseGeocoding ? <ActivityIndicator size="small" color={colors.teal} /> : null}
            </View>
            <Pressable testID="location-map-confirm" accessibilityRole="button" disabled={!hasPendingSelection || reverseGeocoding}
              onPress={confirmLocation} style={({ pressed }) => [styles.mapConfirm, { backgroundColor: colors.primary ?? colors.teal, opacity: !hasPendingSelection || reverseGeocoding ? 0.5 : pressed ? 0.86 : 1 }]}>
              <Text style={[styles.mapConfirmText, { color: colors.primaryForeground ?? colors.card }]}>{t("تأكيد العنوان", "Confirm address")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  searchInput: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 12, fontFamily: "Inter_400Regular" },
  searchSpinner: { position: "absolute", left: 12, top: 14 },
  suggestions: { borderWidth: 1, borderRadius: 12, overflow: "hidden", marginTop: 5 },
  suggestion: { minHeight: 48, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  suggestionText: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_500Medium" },
  empty: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular", paddingHorizontal: 6, paddingVertical: 4 },
  error: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_500Medium", paddingHorizontal: 6, paddingVertical: 4 },
  mapLauncher: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  mapLauncherText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "right" },
  mapModal: { flex: 1, overflow: "hidden" },
  mapOverlay: { ...StyleSheet.absoluteFill, paddingHorizontal: 16 },
  mapTopRow: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", elevation: 3 },
  iconButtonSpacer: { width: 42 },
  mapModalTitle: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Inter_700Bold" },
  searchDock: { minHeight: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10, elevation: 4 },
  mapSearchInput: { flex: 1, minHeight: 48, fontSize: 13, fontFamily: "Inter_400Regular" },
  mapSuggestions: { borderWidth: 1, borderRadius: 14, overflow: "hidden", marginTop: 6, elevation: 4 },
  mapSpacer: { flex: 1 },
  locateButton: { minHeight: 45, alignSelf: "flex-end", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 15, borderRadius: 15, marginBottom: 12, elevation: 4 },
  locateText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  permissionNotice: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, elevation: 3 },
  permissionText: { fontSize: 11, lineHeight: 16, textAlign: "right", fontFamily: "Inter_400Regular" },
  settingsButton: { alignSelf: "flex-end", paddingTop: 8 },
  settingsText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  mapError: { padding: 10, borderRadius: 12, overflow: "hidden", fontSize: 11, marginBottom: 8, textAlign: "right" },
  addressPanel: { minHeight: 76, borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 10, elevation: 4 },
  addressMarker: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  addressCopy: { flex: 1, gap: 4 },
  addressEyebrow: { fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "right" },
  addressText: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_700Bold" },
  mapConfirm: { minHeight: 53, borderRadius: 16, alignItems: "center", justifyContent: "center", elevation: 4 },
  mapConfirmText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  mapUnavailable: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: 26, gap: 10 },
  unavailableIcon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  mapUnavailableTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
