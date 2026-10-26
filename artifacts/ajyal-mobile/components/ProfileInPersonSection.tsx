import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { Icon } from "@/components/AjyalUI";
import LocationPicker from "@/components/InPersonLocationPicker";
import type { GooglePlaceDetails } from "@/lib/googlePlaces";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

type City = { id: string; name_ar: string };
type Address = { id: string; city_id: string; street_address: string; latitude: number; longitude: number; is_primary?: boolean };

export default function ProfileInPersonSection({ number, role, userId }: { number: string; role: "student" | "teacher"; userId: string }) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const [addressToDelete, setAddressToDelete] = useState<Address | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [enabled, setEnabled] = useState(role === "student");
  const [cities, setCities] = useState<City[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [cityId, setCityId] = useState("");
  const [street, setStreet] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState("10");
  const [mode, setMode] = useState<"online" | "in_person" | "both">("online");
  const [approval, setApproval] = useState("not_requested");
  const [approvalReason, setApprovalReason] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<GooglePlaceDetails | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !userId) {
      setLoading(false);
      setError(t("يلزم تسجيل الدخول لتحميل الموقع.", "Sign in to load the location."));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const cityResult = await supabase.from("cities" as any).select("id,name_ar").eq("country_iso2", "SA").eq("is_active", true).order("name_ar");
      if (cityResult.error) throw cityResult.error;
      setCities((cityResult.data ?? []) as City[]);
      if (role === "student") {
        const result = await supabase.from("user_addresses" as any)
          .select("id,city_id,street_address,latitude,longitude,is_primary")
          .eq("owner_id", userId).order("is_primary", { ascending: false });
        if (result.error) throw result.error;
        const rows = (result.data ?? []) as Address[];
        setAddresses(rows);
        if (rows[0]) {
          setCityId(rows[0].city_id);
          setStreet(rows[0].street_address ?? "");
          setLatitude(String(rows[0].latitude ?? ""));
          setLongitude(String(rows[0].longitude ?? ""));
        }
      } else {
        const pilot = await supabase.rpc("is_in_person_test_user" as any);
        if (pilot.error) throw pilot.error;
        setEnabled(Boolean(pilot.data));
        if (!pilot.data) return;
        const result = await supabase.rpc("get_my_teacher_in_person_settings" as any);
        if (result.error) throw result.error;
        const settings = Array.isArray(result.data) ? result.data[0] : result.data;
        if (settings) {
          setCityId(String(settings.city_id ?? ""));
          setStreet(String(settings.street_address ?? ""));
          setLatitude(String(settings.latitude ?? ""));
          setLongitude(String(settings.longitude ?? ""));
          setRadius(String(settings.service_radius_km ?? 10));
          setMode(settings.teaching_mode === "in_person" || settings.teaching_mode === "both" ? settings.teaching_mode : "online");
          setApproval(String(settings.approval_status ?? "not_requested"));
          setApprovalReason(String(settings.rejection_reason ?? ""));
        }
      }
    } catch {
      setError(t("تعذر تحميل بيانات الموقع الحضوري.", "Could not load the in-person location."));
    } finally {
      setLoading(false);
    }
  }, [role, userId, t]);

  useEffect(() => { void load(); }, [load]);

  const getCurrentLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("إذن الموقع مطلوب", "Location permission required"), t("اسمح بالوصول للموقع أو حرّك العلامة على الخريطة.", "Allow location access or move the map marker."));
      return;
    }
    setLocationGranted(true);
    try {
      const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLatitude(String(point.coords.latitude));
      setLongitude(String(point.coords.longitude));
    } catch {
      setError(t("تعذر تحديد الموقع الحالي.", "Could not determine the current location."));
    }
  };

  const handlePlaceSelect = (place: GooglePlaceDetails) => {
    setSelectedPlace(place);
    setStreet(place.formattedAddress);
    setLatitude(String(place.latitude));
    setLongitude(String(place.longitude));
    const normalizedCity = place.city.trim().toLocaleLowerCase();
    const city = cities.find((item) => item.name_ar.trim().toLocaleLowerCase() === normalizedCity);
    setCityId(city?.id ?? "");
  };

  const deleteAddress = async () => {
    const address = addressToDelete;
    if (!supabase || !address || deletingAddressId) return;
    setDeletingAddressId(address.id);
    setDeleteError("");
    try {
      const result = await supabase.from("user_addresses" as any).delete().eq("id", address.id).eq("owner_id", userId);
      if (result.error) {
        setDeleteError(t("تعذر حذف العنوان. حاول مرة أخرى.", "Could not delete the address. Please retry."));
        return;
      }
      const remaining = addresses.filter((item) => item.id !== address.id);
      setAddresses(remaining);
      const currentPrimary = addresses.find((item) => item.is_primary) ?? addresses[0];
      if (currentPrimary?.id === address.id) {
        const next = remaining.find((item) => item.is_primary) ?? remaining[0] ?? null;
        setCityId(next?.city_id ?? "");
        setStreet(next?.street_address ?? "");
        setLatitude(next ? String(next.latitude) : "");
        setLongitude(next ? String(next.longitude) : "");
      }
      setAddressToDelete(null);
    } catch {
      setDeleteError(t("تعذر حذف العنوان. تحقق من الاتصال ثم حاول مرة أخرى.", "Could not delete the address. Check your connection and retry."));
    } finally {
      setDeletingAddressId(null);
    }
  };

  const save = async () => {
    if (!supabase) {
      setError(t("الخدمة غير متاحة حالياً.", "The service is not available right now."));
      return;
    }
    const lat = Number(latitude);
    const lng = Number(longitude);
    const serviceRadius = Number(radius);
    if (
      (!cityId && !selectedPlace) ||
      !street.trim() ||
      !latitude.trim() ||
      !longitude.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setError(t("اختر المدينة واكتب العنوان وحدد الموقع على الخريطة.", "Choose a city, enter the address, and select a map location."));
      return;
    }
    if (role === "teacher" && (!Number.isInteger(serviceRadius) || serviceRadius < 1 || serviceRadius > 100)) {
      setError(t("نطاق الخدمة يجب أن يكون بين 1 و100 كم.", "Service radius must be between 1 and 100 km."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      let savedCityId = cityId;
      if (selectedPlace) {
        const cityResult = await supabase.rpc("upsert_saudi_city_from_places" as any, {
          p_name_ar: selectedPlace.city,
          p_name_en: null,
          p_latitude: selectedPlace.latitude,
          p_longitude: selectedPlace.longitude,
          p_country_iso2: selectedPlace.countryCode,
        });
        if (cityResult.error || !cityResult.data) throw cityResult.error ?? new Error("تعذر تحديد المدينة.");
        savedCityId = String(cityResult.data);
        setCities((current) => current.some((city) => city.id === savedCityId)
          ? current
          : [...current, { id: savedCityId, name_ar: selectedPlace.city }]);
        setCityId(savedCityId);
      }
      if (role === "student") {
        const primary = addresses.find((address) => address.is_primary) ?? addresses[0];
        const values = {
          city_id: savedCityId,
          street_address: street.trim(),
          latitude: lat,
          longitude: lng,
          is_primary: true,
        };
        const result = primary
          ? await supabase.from("user_addresses" as any).update(values).eq("id", primary.id).eq("owner_id", userId)
          : await supabase.from("user_addresses" as any).insert({ ...values, owner_id: userId });
        if (result.error) throw result.error;
      } else {
        const result = await supabase.rpc("save_my_teacher_service_location" as any, {
          p_city_id: savedCityId,
          p_street_address: street.trim(),
          p_latitude: lat,
          p_longitude: lng,
          p_service_radius_km: serviceRadius,
        });
        if (result.error) throw result.error;
      }
      setSelectedPlace(null);
      await load();
    } catch {
      setError(t("تعذر حفظ الموقع. احتفظنا بالتعديلات؛ أعد المحاولة.", "Could not save the location. Your edits are still here; please retry."));
    } finally {
      setSaving(false);
    }
  };

  const updateMode = async (next: "online" | "in_person" | "both") => {
    if (!supabase) return;
    setMode(next);
    const result = await supabase.rpc("set_my_teacher_teaching_mode" as any, { p_mode: next });
    if (result.error) {
      setMode(mode);
      setError(t("تعذر تحديث نمط التدريس.", "Could not update teaching mode."));
    }
  };

  if (!enabled) return null;
  const title = role === "student" ? t("عنوانك للحصص الحضورية", "Address for in-person lessons") : t("موقع التدريس الحضوري", "In-person teaching location");
  const buttonStyle = (active: boolean) => [styles.choice, { borderColor: active ? colors.teal : colors.border, backgroundColor: active ? colors.tealSoft : colors.card }, active && styles.choiceActive];
  const approvalLabel = approval === "approved" ? t("معتمد", "Approved") : approval === "pending" ? t("قيد المراجعة", "Under review") : approval === "rejected" ? t("مرفوض", "Rejected") : t("لم يُطلب بعد", "Not requested");

  return (
    <>
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}, ${expanded ? t("إخفاء القسم", "Collapse section") : t("فتح القسم", "Expand section")}`}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.sectionHeader, { flexDirection: direction === "rtl" ? "row-reverse" : "row", opacity: pressed ? 0.82 : 1 }]}
      >
        <View style={[styles.sectionNumber, { backgroundColor: colors.tealSoft }]}>
          <Text style={[styles.sectionNumberText, { color: colors.teal }]}>{number}</Text>
        </View>
        <View style={[styles.sectionHeaderCopy, { alignItems: direction === "rtl" ? "flex-end" : "flex-start" }]}>
          <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground, writingDirection: direction }]}>{t(`القسم ${number}`, `Section ${number}`)}</Text>
          <Text style={[styles.title, { color: colors.foreground, writingDirection: direction }]}>{title}</Text>
          <Text style={[styles.description, { color: colors.mutedForeground, writingDirection: direction }]}>
            {role === "student"
              ? t("احفظ عنوانك لاستخدامه عند طلب الحصة. لن يُشارك مع المعلم قبل تأكيد الحجز.", "Save your address for lesson requests. It is not shared with a teacher before booking confirmation.")
              : t("موقعك محفوظ بشكل خاص ولن يظهر للطلاب قبل موافقة الإدارة.", "Your location is private and is not shown to students before admin approval.")}
          </Text>
        </View>
        {role === "teacher" && <View style={[styles.approvalPill, { backgroundColor: approval === "approved" ? colors.tealSoft : colors.muted }]}><Text style={[styles.approvalText, { color: approval === "approved" ? colors.teal : colors.mutedForeground }]}>{approvalLabel}</Text></View>}
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
      </Pressable>
      {expanded ? <View style={styles.body}>
      {loading ? <ActivityIndicator color={colors.teal} style={styles.loader} /> : <>
        {role === "teacher" && <>
          <Text style={[styles.label, { color: colors.foreground }]}>{t("طريقة التدريس", "Teaching mode")}</Text>
          <View style={styles.row}>
            {(["online", "in_person", "both"] as const).map((value) => (
              <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} onPress={() => void updateMode(value)} style={[buttonStyle(mode === value), styles.modeChoice]}>
                <Text style={[styles.choiceText, { color: mode === value ? colors.teal : colors.foreground }]}>{value === "online" ? t("عن بُعد", "Online") : value === "in_person" ? t("حضوري", "In person") : t("كلاهما", "Both")}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.statusPanel, { backgroundColor: colors.muted }]}>
            <Text style={[styles.status, { color: colors.mutedForeground }]}>{t("حالة اعتماد الموقع", "Location approval")}</Text>
            <Text style={[styles.statusValue, { color: colors.foreground }]}>{approvalLabel}{approvalReason ? ` · ${approvalReason}` : ""}</Text>
          </View>
        </>}
        <Text style={[styles.label, { color: colors.foreground }]}>{t("المدينة", "City")}</Text>
        <View style={styles.row}>
          {cities.map((city) => <Pressable key={city.id} accessibilityRole="button" accessibilityState={{ selected: cityId === city.id }} onPress={() => { setSelectedPlace(null); setCityId(city.id); }} style={buttonStyle(cityId === city.id)}><Text style={[styles.choiceText, { color: cityId === city.id ? colors.teal : colors.foreground }]}>{city.name_ar}</Text></Pressable>)}
        </View>
        {selectedPlace && !cities.some((city) => city.id === cityId) ? <Text style={[styles.helper, { color: colors.teal }]}>{t("المدينة من نتيجة Google Maps: ", "City from Google Maps: ")}{selectedPlace.city}</Text> : null}
        {cities.length === 0 ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>{t("لا توجد مدن نشطة للاختيار حالياً.", "There are no active cities to choose from right now.")}</Text> : null}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>{t("العنوان أو الشارع", "Street address")}</Text>
         <TextInput value={street} onChangeText={setStreet} placeholder={t("اكتب العنوان بالتفصيل", "Enter the address")} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: direction === "rtl" ? "right" : "left", writingDirection: direction }]} />
        </View>
        <View style={[styles.mapPanel, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <View style={styles.mapHeading}>
            <Text style={[styles.label, styles.mapLabel, { color: colors.foreground }]}>{t("حدد الموقع على الخريطة", "Select the location on the map")}</Text>
            <Text style={[styles.mapHint, { color: colors.mutedForeground }]}>{t("ابحث عن العنوان أو اختر نقطة دقيقة.", "Search for an address or choose a precise point.")}</Text>
          </View>
        <LocationPicker
          latitude={latitude}
          longitude={longitude}
          locationGranted={locationGranted}
          colors={{ card: colors.card, border: colors.border, teal: colors.teal, foreground: colors.foreground, mutedForeground: colors.mutedForeground, destructive: colors.destructive }}
          onChange={(lat, lng) => { setSelectedPlace(null); setLatitude(String(lat)); setLongitude(String(lng)); }}
          onPlaceSelect={handlePlaceSelect}
          searchPlaceholder={t("ابحث عن مدينة أو عنوان", "Search for a city or address")}
          webMessage={t("افتح التطبيق على جهازك لاختيار الموقع من الخريطة.", "Open the app on your device to select a map location.")}
        />
        </View>
        <Pressable accessibilityRole="button" onPress={() => void getCurrentLocation()} style={({ pressed }) => [styles.secondary, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.8 : 1 }]}>
          <Text style={[styles.secondaryText, { color: colors.teal }]}>{t("استخدم موقعي الحالي", "Use my current location")}</Text>
        </Pressable>
        {role === "teacher" && <View style={styles.radiusField}>
          <Text style={[styles.label, styles.sectionLabel, { color: colors.foreground }]}>{t("نطاق الخدمة", "Service radius")}</Text>
          <View style={[styles.radiusInputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
           <TextInput accessibilityLabel={t("نطاق الخدمة بالكيلومتر", "Service radius in kilometers")} value={radius} onChangeText={setRadius} keyboardType="number-pad" maxLength={3} placeholder="10" placeholderTextColor={colors.mutedForeground} style={[styles.radiusInput, { color: colors.foreground, textAlign: direction === "rtl" ? "right" : "left", writingDirection: direction }]} />
            <View style={[styles.unitPill, { backgroundColor: colors.tealSoft }]}><Text style={[styles.unitText, { color: colors.teal }]}>{t("كم", "km")}</Text></View>
          </View>
          <Text style={[styles.helper, { color: colors.mutedForeground }]}>{t("أدخل نطاقاً من 1 إلى 100 كم.", "Enter a radius from 1 to 100 km.")}</Text>
        </View>}
        {role === "student" && addresses.map((address) => <View key={address.id} style={[styles.saved, { backgroundColor: colors.muted, borderColor: colors.border }]}><View style={styles.savedRow}><View style={styles.savedCopy}><Text style={[styles.savedTitle, { color: colors.foreground }]}>{cities.find((city) => city.id === address.city_id)?.name_ar ?? t("عنوان محفوظ", "Saved address")}</Text><Text style={[styles.savedText, { color: colors.mutedForeground }]}>{address.street_address}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={t("حذف العنوان", "Delete address")} disabled={deletingAddressId === address.id} onPress={() => { setDeleteError(""); setAddressToDelete(address); }} hitSlop={8} style={[styles.deleteAddress, { backgroundColor: colors.card, borderColor: colors.border }]}>{deletingAddressId === address.id ? <ActivityIndicator size="small" color={colors.destructive} /> : <Icon name="trash-2" size={16} color={colors.destructive} />}</Pressable></View></View>)}
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <Pressable disabled={saving} accessibilityRole="button" onPress={() => void save()} style={({ pressed }) => [styles.save, { backgroundColor: colors.primary, opacity: saving ? 0.65 : pressed ? 0.88 : 1 }]}>
          {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.saveText, { color: colors.primaryForeground }]}>{role === "student" ? t("حفظ العنوان", "Save address") : t("حفظ الموقع وإرساله للاعتماد", "Save location and request approval")}</Text>}
        </Pressable>
      </>}
      </View> : null}
    </View>
    {addressToDelete ? (
      <Modal transparent animationType="fade" onRequestClose={() => !deletingAddressId && setAddressToDelete(null)}>
        <View style={styles.deleteOverlay}>
          <View style={[styles.deleteDialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.deleteIcon, { backgroundColor: `${colors.destructive}18` }]}><Icon name="trash-2" size={20} color={colors.destructive} /></View>
            <Text accessibilityRole="header" style={[styles.deleteTitle, { color: colors.foreground, writingDirection: direction, textAlign: direction === "rtl" ? "right" : "left" }]}>{t("حذف العنوان؟", "Delete address?")}</Text>
            <Text style={[styles.deleteBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: direction === "rtl" ? "right" : "left" }]}>{t("سيُحذف هذا العنوان من حسابك ولن يكون متاحاً لطلبات الحضوري.", "This address will be removed from your account and unavailable for in-person requests.")}</Text>
            {deleteError ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{deleteError}</Text> : null}
            <View style={styles.deleteActions}>
              <Pressable accessibilityRole="button" disabled={!!deletingAddressId} onPress={() => setAddressToDelete(null)} style={[styles.deleteAction, { backgroundColor: colors.muted, opacity: deletingAddressId ? 0.6 : 1 }]}><Text style={[styles.deleteActionText, { color: colors.foreground }]}>{t("إلغاء", "Cancel")}</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={!!deletingAddressId} onPress={() => void deleteAddress()} style={[styles.deleteAction, { backgroundColor: colors.destructive, opacity: deletingAddressId ? 0.7 : 1 }]}>{deletingAddressId ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.deleteActionText, { color: colors.primaryForeground }]}>{t("حذف العنوان", "Delete address")}</Text>}</Pressable>
            </View>
          </View>
        </View>
      </Modal>
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 22, marginBottom: 16, overflow: "hidden", shadowColor: "#12233F", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  sectionHeader: { minHeight: 92, alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  sectionNumber: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  sectionNumberText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  sectionHeaderCopy: { flex: 1, minWidth: 0 },
  sectionEyebrow: { fontSize: 9, fontFamily: "Inter_500Medium", marginBottom: 2 },
  approvalPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  approvalText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  title: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_700Bold" },
  description: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular", marginTop: 3 },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18, borderTopWidth: StyleSheet.hairlineWidth },
  loader: { padding: 24 },
  label: { fontSize: 11, lineHeight: 16, fontFamily: "Inter_700Bold", marginBottom: 8 },
  sectionLabel: { marginTop: 1 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 12 },
  choice: { borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  choiceActive: { borderWidth: 1.5 },
  modeChoice: { flex: 1, minWidth: 82, minHeight: 46, alignItems: "center", justifyContent: "center" },
  choiceText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statusPanel: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, marginTop: 2, marginBottom: 5, gap: 3 },
  status: { fontSize: 10, fontFamily: "Inter_500Medium" },
  statusValue: { fontSize: 11, fontFamily: "Inter_700Bold" },
  fieldGroup: { marginBottom: 13 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 12, fontFamily: "Inter_400Regular" },
  radiusField: { gap: 7, marginTop: 6, marginBottom: 12 },
  radiusInputWrap: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  radiusInput: { flex: 1, minHeight: 48, paddingHorizontal: 5, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  unitPill: { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  unitText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  helper: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular" },
  mapPanel: { borderWidth: 1, borderRadius: 18, padding: 12, marginTop: 1, marginBottom: 12 },
  mapHeading: { marginBottom: 10 },
  mapLabel: { marginBottom: 3 },
  mapHint: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular" },
  secondary: { minHeight: 46, alignSelf: "stretch", borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, justifyContent: "center", alignItems: "center", marginBottom: 8 },
  secondaryText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  saved: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8, gap: 4 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  savedCopy: { flex: 1, gap: 4 },
  deleteAddress: { width: 44, height: 44, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  deleteOverlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 22, backgroundColor: "rgba(8, 18, 38, 0.48)" },
  deleteDialog: { width: "100%", maxWidth: 360, borderWidth: 1, borderRadius: 22, padding: 20, gap: 8, shadowColor: "#10264A", shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 9 }, elevation: 8 },
  deleteIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  deleteTitle: { fontSize: 15, lineHeight: 22, fontFamily: "Inter_700Bold" },
  deleteBody: { fontSize: 11, lineHeight: 17, fontFamily: "Inter_400Regular" },
  deleteActions: { flexDirection: "row", gap: 9, marginTop: 10 },
  deleteAction: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  deleteActionText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  savedTitle: { fontSize: 11, fontFamily: "Inter_700Bold" },
  savedText: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular" },
  empty: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular", marginBottom: 9 },
  error: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_500Medium", marginBottom: 10 },
  save: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 15, paddingHorizontal: 16, marginTop: 5, shadowColor: "#12233F", shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  saveText: { fontSize: 12, fontFamily: "Inter_700Bold" },
});
