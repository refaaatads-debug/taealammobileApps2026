import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import { Header, Icon, Screen } from "@/components/AjyalUI";
import InPersonTeacherResultsSheet, { type InPersonTeacherResult } from "@/components/InPersonTeacherResultsSheet";
import LocationPicker from "@/components/InPersonLocationPicker";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import { useAjyal } from "@/hooks/useAjyal";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { firstAvailableInPersonSchedule, formatLocalDateTimeInput, getInPersonAppointmentTimes, inPersonRequestStatusLabel, parseFutureInPersonDateTime } from "@/lib/inPersonScheduling";
import { getInPersonBookingSnapshot } from "@/lib/inPersonBookingSnapshot";
import { selectSavedAddress } from "@/lib/inPersonAddressSelection";
import { isCurrentInPersonTeacherSearch } from "@/lib/inPersonTeacherSearch";
import { TEACHING_STAGES } from "@/constants/education";
import { OptionDropdown } from "@/components/OptionDropdown";

type Row = Record<string, any>;
type City = { id: string; name_ar: string; name_en: string | null; in_person_enabled: boolean };
type Address = { id: string; city_id: string; street_address: string; district: string | null; additional_details: string | null; latitude: number; longitude: number; is_primary: boolean; created_at?: string | null };
type Teacher = InPersonTeacherResult;

function errorText(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const details = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [details.message, details.details, details.hint]
      .filter((part): part is string => typeof part === "string" && !!part.trim());
    if (parts.length) return parts.join(" · ");
  }
  return fallback;
}

function normalizeSubjectName(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function records(data: unknown): Row[] {
  return Array.isArray(data) ? data.filter((row): row is Row => !!row && typeof row === "object") : [];
}

function localLabel(value: unknown, locale: string) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export default function InPersonScreen() {
  const colors = useColors();
  const { t, locale, direction } = useAppPreferences();
  const { profile, role } = useAjyal();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [groups, setGroups] = useState<Row[]>([]);
  const [teacherBookings, setTeacherBookings] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row | null>(null);
  const [cityId, setCityId] = useState("");
  const [addressId, setAddressId] = useState("");
  const [locationExpanded, setLocationExpanded] = useState(true);
  const [teachingStage, setTeachingStage] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(firstAvailableInPersonSchedule);
  const [scheduleDate = "", scheduleTime = ""] = scheduledAt.split("T");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [teacherResultsVisible, setTeacherResultsVisible] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [teacherStreet, setTeacherStreet] = useState("");
  const [teacherLatitude, setTeacherLatitude] = useState("");
  const [teacherLongitude, setTeacherLongitude] = useState("");
  const [teacherRadius, setTeacherRadius] = useState("10");
  const [attendanceCodes, setAttendanceCodes] = useState<Record<string, string>>({});
  const addressIdRef = useRef(addressId);
  const searchRequestIdRef = useRef(0);
  const searchInFlightRef = useRef(false);
  addressIdRef.current = addressId;

  const isTeacher = role === "teacher";
  const cityOptions = useMemo(() => cities, [cities]);
  const selectedCity = cities.find((city) => city.id === cityId) ?? null;
  const selectedAddress = addresses.find((address) => address.id === addressId) ?? null;
  const locationReady = Boolean(selectedCity?.in_person_enabled && selectedAddress);
  const cityAddresses = addresses.filter((address) => !cityId || address.city_id === cityId);
  const dateOptions = useMemo(() => Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return { key: formatLocalDateTimeInput(date).slice(0, 10), day: date.toLocaleDateString(locale, { weekday: "short" }), label: date.toLocaleDateString(locale, { day: "numeric", month: "short" }) };
  }), [locale]);
  const timeOptions = useMemo(() => getInPersonAppointmentTimes(scheduleDate), [scheduleDate]);
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const selectedScheduleLabel = new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  useEffect(() => {
    if (!loading && role === "student" && locationReady) setLocationExpanded(false);
  }, [loading, locationReady, role]);

  const invalidateTeacherSearch = () => {
    searchRequestIdRef.current += 1;
    if (searchInFlightRef.current) {
      searchInFlightRef.current = false;
      setSaving(false);
    }
    setError("");
    setRequestSent(false);
    setTeachers([]);
    setSelectedTeachers([]);
    setSearchPerformed(false);
    setTeacherResultsVisible(false);
  };

  useEffect(() => {
    if (!teachingStage && profile?.teachingStage) setTeachingStage(profile.teachingStage);
  }, [profile?.teachingStage, teachingStage]);
  useEffect(() => {
    if (!requestSent) return;
    const timer = setTimeout(() => router.replace("/(tabs)/bookings"), 2400);
    return () => clearTimeout(timer);
  }, [requestSent]);
  const load = useCallback(async () => {
    searchRequestIdRef.current += 1;
    searchInFlightRef.current = false;
    setSaving(false);
    if (!supabase || !user?.id || (role !== "student" && role !== "teacher")) {
      setLoading(false);
      setError(t("يلزم تسجيل الدخول بحساب طالب أو معلم.", "Sign in with a student or teacher account."));
      return;
    }
    setLoading(true);
    setError("");
    setCities([]);
    setAddresses([]);
    setSubjects([]);
    setTeacherBookings([]);
    setSettings(null);
    setTeachers([]);
    setSelectedTeachers([]);
    setSearchPerformed(false);
    setTeacherResultsVisible(false);
    try {
      const [cityResult, addressResult, subjectResult] = await Promise.all([
        supabase.from("cities").select("id,name_ar,name_en,in_person_enabled").eq("country_iso2", "SA").eq("is_active", true).order("name_ar"),
        role === "student"
          ? supabase.from("user_addresses").select("id,city_id,street_address,district,additional_details,latitude,longitude,is_primary,created_at").eq("owner_id", user.id).order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        role === "student" ? supabase.from("subjects").select("id,name").order("name") : Promise.resolve({ data: [], error: null }),
      ]);
      if (cityResult.error) throw cityResult.error;
      if (addressResult.error) throw addressResult.error;
      if (subjectResult.error) throw subjectResult.error;
      const cityRows = records(cityResult.data) as City[];
      setCities(cityRows);
      const addressRows = records(addressResult.data) as Address[];
      setAddresses(addressRows);
      setSubjects(records(subjectResult.data).map((item) => ({ id: String(item.id), name: String(item.name ?? "") })));
      if (role === "student") {
        const selected = selectSavedAddress(addressRows, addressIdRef.current);
        setAddressId(selected?.id ?? "");
        setCityId(selected?.city_id ?? "");
      } else {
        const [requestsResult, settingResult, bookingsResult] = await Promise.all([
          supabase.rpc("list_teacher_in_person_requests_priced"),
          supabase.rpc("get_my_teacher_in_person_settings"),
          supabase.from("bookings").select("id,scheduled_at,instruction_duration_minutes,balance_cost_minutes,status,session_status,attendance_confirmed_at").eq("teacher_id", user.id).eq("delivery_mode", "in_person").order("scheduled_at", { ascending: false }).limit(20),
        ]);
        if (requestsResult.error) throw requestsResult.error;
        if (settingResult.error) throw settingResult.error;
        if (bookingsResult.error) throw bookingsResult.error;
        const row = records(settingResult.data)[0] ?? null;
        setGroups(records(requestsResult.data));
        setSettings(row);
        setTeacherBookings(records(bookingsResult.data));
        if (row) {
          setCityId(String(row.city_id ?? ""));
          setTeacherStreet(String(row.street_address ?? ""));
          setTeacherLatitude(String(row.latitude ?? ""));
          setTeacherLongitude(String(row.longitude ?? ""));
          setTeacherRadius(String(row.service_radius_km ?? 10));
        }
      }
    } catch (cause) {
      setError(errorText(cause, t("تعذر تحميل بيانات الحضوري.", "Could not load in-person data.")));
    } finally {
      setLoading(false);
    }
  }, [role, t, user?.id]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const getCurrentLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t("إذن الموقع مطلوب", "Location permission required"), t("يمكنك إدخال العنوان يدوياً أو تفعيل الإذن من إعدادات الجهاز.", "Enter the address manually or enable permission in device settings."));
        return;
      }
      setLocationGranted(true);
      const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
       setTeacherLatitude(String(point.coords.latitude));
       setTeacherLongitude(String(point.coords.longitude));
    } catch (cause) {
      setError(errorText(cause, t("تعذر تحديد الموقع. أدخل العنوان والإحداثيات يدوياً.", "Could not get location. Enter the address and coordinates manually.")));
    }
  };

  const saveTeacherLocation = async () => {
    const lat = Number(teacherLatitude), lng = Number(teacherLongitude), radius = Number(teacherRadius);
    if (!supabase || !cityId || !teacherStreet.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isInteger(radius) || radius < 1 || radius > 100) {
      setError(t("أكمل المدينة والعنوان والإحداثيات ونطاق الخدمة من 1 إلى 100 كم.", "Enter the city, address, coordinates, and a service radius from 1 to 100 km."));
      return;
    }
    setSaving(true); setError("");
    const result = await supabase.rpc("save_my_teacher_service_location", {
      p_city_id: cityId, p_street_address: teacherStreet.trim(), p_latitude: lat, p_longitude: lng, p_service_radius_km: radius,
    });
    setSaving(false);
    if (result.error) setError(errorText(result.error, t("تعذر حفظ موقع التدريس.", "Could not save the teaching location.")));
    else await load();
  };

  const setTeachingMode = async (mode: "online" | "in_person" | "both") => {
    if (!supabase) return;
    setSaving(true); setError("");
    const result = await supabase.rpc("set_my_teacher_teaching_mode", { p_mode: mode });
    setSaving(false);
    if (result.error) setError(errorText(result.error, t("تعذر تحديث نمط التدريس.", "Could not update teaching mode.")));
    else await load();
  };

  const searchTeachers = async () => {
    const date = parseFutureInPersonDateTime(scheduledAt);
    if (!supabase || !selectedCity?.in_person_enabled || !selectedAddress || selectedAddress.city_id !== cityId || !teachingStage || !subjects.some((subject) => subject.id === subjectId) || !date) {
      setError(t("اختر المرحلة والمدينة والعنوان والمادة وموعداً بعد ساعتين على الأقل.", "Choose a stage, city, address, subject, and a time at least two hours ahead."));
      return;
    }
    const searchRequestId = ++searchRequestIdRef.current;
    searchInFlightRef.current = true;
    setTeacherResultsVisible(true);
    setSaving(true); setError(""); setRequestSent(false); setTeachers([]); setSelectedTeachers([]); setSearchPerformed(false);
    try {
      const result = await supabase.rpc("search_in_person_teachers", {
        p_city_id: cityId, p_subject_id: subjectId, p_address_id: addressId, p_scheduled_at: date.toISOString(), p_teaching_stage: teachingStage,
      });
      if (!isCurrentInPersonTeacherSearch(searchRequestId, searchRequestIdRef.current)) return;
      searchInFlightRef.current = false;
      setSaving(false);
      if (result.error) {
        setTeacherResultsVisible(false);
        setError(errorText(result.error, t("تعذر البحث عن المعلمين.", "Teacher search failed.")));
        return;
      }
      // The platform search applies the selected subject and stage to every eligible teacher;
      // do not filter its results again through the smaller general-directory response.
      setTeachers(records(result.data) as Teacher[]);
      setSearchPerformed(true);
    } catch (cause) {
      if (!isCurrentInPersonTeacherSearch(searchRequestId, searchRequestIdRef.current)) return;
      searchInFlightRef.current = false;
      setSaving(false);
      setTeacherResultsVisible(false);
      setError(errorText(cause, t("تعذر البحث عن المعلمين.", "Teacher search failed.")));
    }
  };

  const createRequest = async () => {
    const date = parseFutureInPersonDateTime(scheduledAt);
    if (!supabase || !selectedCity?.in_person_enabled || !selectedAddress || selectedAddress.city_id !== cityId || !teachingStage || !subjects.some((subject) => subject.id === subjectId) || !date || !selectedTeachers.length) {
      setError(t("اختر معلماً واحداً على الأقل قبل إرسال الطلب.", "Select at least one teacher before sending the request."));
      return;
    }
    setSaving(true); setError(""); setRequestSent(false);
    const result = await supabase.rpc("create_in_person_request", {
      p_subject_id: subjectId, p_scheduled_at: date.toISOString(), p_city_id: cityId,
      p_address_id: addressId, p_teacher_ids: selectedTeachers, p_idempotency_key: Crypto.randomUUID(),
    });
    setSaving(false);
    if (result.error) {
      setTeacherResultsVisible(false);
      setError(errorText(result.error, t("تعذر إنشاء طلب الحضوري.", "Could not create the in-person request.")));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["in-person-request-groups"] });
    setTeacherResultsVisible(false);
    setRequestSent(true);
    setTeachers([]); setSelectedTeachers([]); setSearchPerformed(false);
  };

  const runTeacherDecision = async (groupId: string, decision: "accept" | "reject") => {
    if (!supabase) return;
    setSaving(true);
    setError("");
    const result = await supabase.rpc(decision === "accept" ? "accept_in_person_request" : "reject_in_person_request", { p_request_group_id: groupId });
    setSaving(false);
    if (result.error) setError(errorText(result.error, t("تعذر تحديث الطلب.", "Could not update the request.")));
    else {
      await queryClient.invalidateQueries({ queryKey: ["in-person-request-groups"] });
      await queryClient.invalidateQueries({ queryKey: ["teacher-in-person-request-count"] });
      await load();
    }
  };

  const revealTeacherCode = async (bookingId: string) => {
    if (!supabase) return;
    const result = await supabase.rpc("get_in_person_attendance_code", { p_booking_id: bookingId });
    if (result.error) setError(errorText(result.error, t("كود الحضور غير متاح الآن.", "Attendance code is not available now.")));
    else setAttendanceCodes((current) => ({ ...current, [bookingId]: String(result.data ?? "") }));
  };

  const cardStyle = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];
  const textStyle = { color: colors.foreground, writingDirection: direction } as const;
  const mutedStyle = { color: colors.mutedForeground, writingDirection: direction } as const;
  const actionStyle = { backgroundColor: colors.teal };
  const cityLabel = (city: City) => locale.startsWith("ar") ? city.name_ar : city.name_en ?? city.name_ar;
  const studentCardStyle = [styles.card, styles.studentCard, { backgroundColor: colors.card, borderColor: colors.border }];

  return (
    <Screen>
      <Header title={t("التدريس الحضوري", "In-person teaching")} eyebrow={t("العناوين والطلبات", "Locations and requests")} onBack={() => router.back()} avatarText={profile?.displayName?.slice(0, 1)} />
      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.teal} /><Text style={mutedStyle}>{t("جارٍ تحميل البيانات...", "Loading data...")}</Text></View> : null}
      {!!error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      {role === "student" && loading ? null : role === "student" ? (
        <>
          <View style={styles.studentIntro}>
            <Text style={[styles.studentIntroEyebrow, { color: colors.teal, writingDirection: direction }]}>
              {t("حجز حضوري · خطوة بخطوة", "IN-PERSON · PLAN YOUR LESSON")}
            </Text>
            <Text style={[styles.studentIntroTitle, textStyle]}>{t("اختر موقعك المناسب", "Choose your lesson location")}</Text>
            <Text style={[styles.studentIntroBody, mutedStyle]}>
              {t("حدد موقع الحصة والمادة والموعد لعرض المعلمين المناسبين.", "Choose a location, subject, and time to find the right teachers.")}
            </Text>
          </View>
          <View style={studentCardStyle}>
            <View style={styles.stepHeading}>
              <View style={[styles.stepIcon, { backgroundColor: colors.tealSoft }]}><Icon name="map-pin" size={18} color={colors.teal} /></View>
              <View style={styles.stepCopy}>
                <Text style={[styles.cardTitle, textStyle]}>{t("مكان الحصة", "Lesson location")}</Text>
                <Text style={mutedStyle}>{t("العنوان والمدينة التي ستستضيف المعلم", "The address where your teacher will meet you")}</Text>
              </View>
              <Text style={[styles.stepNumber, { color: colors.teal, backgroundColor: colors.tealSoft }]}>01</Text>
            </View>
            {locationExpanded || !locationReady ? (
              <>
                <Text style={[styles.fieldLabel, textStyle]}>{t("المدينة", "City")}</Text>
                <View style={styles.cityGrid}>
                  {cityOptions.map((city) => {
                    const selected = cityId === city.id;
                    return <Pressable
                      key={city.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled: !city.in_person_enabled }}
                      disabled={!city.in_person_enabled}
                      onPress={() => {
                        invalidateTeacherSearch();
                        setCityId(city.id);
                        const cityAddress = selectSavedAddress(addresses.filter((address) => address.city_id === city.id), "");
                        setAddressId(cityAddress?.id ?? "");
                      }}
                      style={({ pressed }) => [styles.cityOption, { borderColor: selected ? colors.teal : colors.border, borderWidth: selected ? 1.5 : 1, backgroundColor: selected ? colors.tealSoft : colors.card, opacity: !city.in_person_enabled ? 0.55 : pressed ? 0.78 : 1 }]}
                    >
                      <View style={[styles.radio, { borderColor: selected ? colors.teal : colors.border, backgroundColor: selected ? colors.teal : "transparent" }]}>
                        {selected ? <Icon name="check" size={12} color="#fff" /> : null}
                      </View>
                      <View style={styles.cityOptionCopy}>
                        <Text style={[styles.cityName, textStyle, { color: selected ? colors.teal : colors.foreground }]}>{cityLabel(city)}</Text>
                        <Text style={[styles.cityStatus, { color: city.in_person_enabled ? colors.teal : colors.destructive }]}>{city.in_person_enabled ? t("متاحة", "Available") : t("غير متاحة حالياً", "Unavailable")}</Text>
                      </View>
                    </Pressable>;
                  })}
                </View>
                {selectedCity && !selectedCity.in_person_enabled ? <Text style={mutedStyle}>{t("الحضوري غير متاح في هذه المدينة.", "In-person service is not enabled in this city.")}</Text> : null}
                <View style={styles.addressHeading}>
                  <Text style={[styles.fieldLabel, textStyle]}>{t("العنوان المحفوظ", "Saved address")}</Text>
                  <Pressable accessibilityRole="button" onPress={() => router.push("/profile")} style={styles.editAddressButton}>
                    <Icon name="edit-2" size={13} color={colors.teal} />
                    <Text style={[styles.editAddressText, { color: colors.teal }]}>{t("إدارة العناوين", "Manage")}</Text>
                  </Pressable>
                </View>
                {cityAddresses.length ? (
                  <OptionDropdown
                    label={t("عنوان الحصة", "Lesson address")}
                    value={addressId}
                    placeholder={t("اختر عنوان الحصة", "Choose a lesson address")}
                    options={cityAddresses.map((address) => ({
                      value: address.id,
                      label: [address.street_address, address.district, cities.find((city) => city.id === address.city_id) ? cityLabel(cities.find((city) => city.id === address.city_id)!) : ""].filter(Boolean).join(" · "),
                    }))}
                    onChange={(id) => {
                      const address = addresses.find((item) => item.id === id);
                      if (!address) return;
                      invalidateTeacherSearch();
                      setAddressId(address.id); setCityId(address.city_id);
                    }}
                    testID="in-person-address-dropdown"
                  />
                ) : null}
                {selectedAddress ? (
                  <View style={[styles.addressContext, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <View style={[styles.contextIcon, { backgroundColor: colors.tealSoft }]}><Icon name="home" size={15} color={colors.teal} /></View>
                    <View style={styles.addressContextCopy}>
                      <Text style={[styles.addressContextTitle, textStyle]} numberOfLines={2}>{[selectedAddress.street_address, selectedAddress.district].filter(Boolean).join(" · ")}</Text>
                      <Text style={mutedStyle} numberOfLines={2}>{[selectedCity ? cityLabel(selectedCity) : "", selectedAddress.additional_details].filter(Boolean).join(" · ")}</Text>
                    </View>
                    <View style={styles.addressBadges}>
                      {selectedAddress.is_primary ? <Text style={[styles.contextBadge, { color: colors.teal, backgroundColor: colors.tealSoft }]}>{t("أساسي", "Primary")}</Text> : null}
                      <Text style={[styles.addressCount, { color: colors.mutedForeground }]}>{cityAddresses.length.toLocaleString(locale)} {t("عناوين", "saved")}</Text>
                    </View>
                  </View>
                ) : null}
                {!addresses.some((address) => !cityId || address.city_id === cityId) ? <Pressable accessibilityRole="button" onPress={() => router.push("/profile")} style={[styles.emptyAddress, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                  <Icon name="plus-circle" size={20} color={colors.teal} />
                  <View style={styles.stepCopy}>
                    <Text style={[styles.emptyAddressTitle, textStyle]}>{t("أضف عنواناً لهذه المدينة", "Add an address for this city")}</Text>
                    <Text style={mutedStyle}>{t("سيُحفظ في حسابك ويُستخدم تلقائياً في الحجز القادم.", "Save it in your profile and it will be selected automatically next time.")}</Text>
                  </View>
                  <Icon name={direction === "rtl" ? "chevron-left" : "chevron-right"} size={18} color={colors.teal} />
                </Pressable> : null}
              </>
            ) : selectedCity && selectedAddress ? (
              <>
                <View style={[styles.locationSummaryGrid, { flexDirection: direction === "rtl" ? "row-reverse" : "row" }]}>
                  <Pressable
                    testID="in-person-edit-city"
                    accessibilityRole="button"
                    accessibilityLabel={t("تعديل مدينة الحصة", "Edit lesson city")}
                    onPress={() => setLocationExpanded(true)}
                    style={({ pressed }) => [styles.locationSummaryTile, { backgroundColor: colors.muted, borderColor: colors.border, opacity: pressed ? 0.78 : 1 }]}
                  >
                    <View style={[styles.locationSummaryIcon, { backgroundColor: colors.tealSoft }]}><Icon name="map-pin" size={15} color={colors.teal} /></View>
                    <View style={styles.locationSummaryCopy}>
                      <Text style={[styles.locationSummaryLabel, mutedStyle]}>{t("مدينة الحصة", "Lesson city")}</Text>
                      <Text style={[styles.locationSummaryValue, textStyle]} numberOfLines={1}>{cityLabel(selectedCity)}</Text>
                      <Text style={[styles.locationSummaryMeta, { color: selectedCity.in_person_enabled ? colors.teal : colors.destructive }]} numberOfLines={1}>
                        {selectedCity.in_person_enabled ? t("متاحة للحجز", "Available") : t("غير متاحة", "Unavailable")}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    testID="in-person-edit-address"
                    accessibilityRole="button"
                    accessibilityLabel={t("تعديل عنوان الحصة", "Edit lesson address")}
                    onPress={() => setLocationExpanded(true)}
                    style={({ pressed }) => [styles.locationSummaryTile, { backgroundColor: colors.muted, borderColor: colors.border, opacity: pressed ? 0.78 : 1 }]}
                  >
                    <View style={[styles.locationSummaryIcon, { backgroundColor: colors.tealSoft }]}><Icon name="home" size={15} color={colors.teal} /></View>
                    <View style={styles.locationSummaryCopy}>
                      <Text style={[styles.locationSummaryLabel, mutedStyle]}>{t("عنوان الحصة", "Lesson address")}</Text>
                      <Text style={[styles.locationSummaryValue, textStyle]} numberOfLines={1}>{[selectedAddress.street_address, selectedAddress.district].filter(Boolean).join(" · ")}</Text>
                      <Text style={[styles.locationSummaryMeta, mutedStyle]} numberOfLines={1}>
                        {selectedAddress.is_primary ? t("العنوان الأساسي", "Primary address") : selectedAddress.additional_details || t("عنوان محفوظ", "Saved address")}
                      </Text>
                    </View>
                  </Pressable>
                </View>
                <View style={styles.locationSummaryActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("تعديل مكان الحصة والعنوان", "Edit lesson location and address")}
                    onPress={() => setLocationExpanded(true)}
                    style={({ pressed }) => [styles.locationEditButton, { opacity: pressed ? 0.72 : 1 }]}
                  >
                    <Icon name="edit-2" size={13} color={colors.teal} />
                    <Text style={[styles.editAddressText, { color: colors.teal }]}>{t("تغيير المدينة أو العنوان", "Change city or address")}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push("/profile")}
                    style={({ pressed }) => [styles.locationManageButton, { borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}
                  >
                    <Text style={[styles.locationManageText, { color: colors.mutedForeground }]}>{t("إدارة العناوين", "Manage addresses")}</Text>
                    <Icon name={direction === "rtl" ? "chevron-left" : "chevron-right"} size={14} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
          <View style={studentCardStyle}>
            <View style={styles.stepHeading}>
              <View style={[styles.stepIcon, { backgroundColor: colors.tealSoft }]}><Icon name="book-open" size={18} color={colors.teal} /></View>
              <View style={styles.stepCopy}>
                <Text style={[styles.cardTitle, textStyle]}>{t("المادة والموعد", "Subject and time")}</Text>
                <Text style={mutedStyle}>{t("اختر ما يناسبك لعرض المعلمين المتاحين", "Choose your preferences to find available teachers")}</Text>
              </View>
              <Text style={[styles.stepNumber, { color: colors.teal, backgroundColor: colors.tealSoft }]}>02</Text>
            </View>
            <View style={[styles.subjectSelectionRow, { flexDirection: direction === "rtl" ? "row-reverse" : "row" }]}>
              <View style={styles.subjectSelectionColumn}>
                <OptionDropdown
                  label={t("المرحلة الدراسية", "Education stage")}
                  value={teachingStage}
                  placeholder={t("اختر المرحلة", "Choose a stage")}
                  options={[...TEACHING_STAGES]}
                  onChange={(stage) => { invalidateTeacherSearch(); setTeachingStage(stage); setSubjectId(""); }}
                  testID="in-person-stage-dropdown"
                />
              </View>
              <View style={styles.subjectSelectionColumn}>
                <OptionDropdown
                  label={t("المادة الدراسية", "Subject")}
                  value={subjects.find((subject) => subject.id === subjectId)?.name ?? ""}
                  placeholder={teachingStage ? t("اختر المادة", "Choose a subject") : t("اختر المرحلة أولاً", "Choose a stage first")}
                  options={subjects.map((subject) => subject.name)}
                  onChange={(name) => {
                    const subject = subjects.find((item) => normalizeSubjectName(item.name) === normalizeSubjectName(name));
                    invalidateTeacherSearch();
                    setSubjectId(subject?.id ?? "");
                  }}
                  testID="in-person-subject-dropdown"
                  loading={loading}
                  disabled={!teachingStage || loading || !subjects.length}
                />
              </View>
            </View>
            {loading ? <Text style={mutedStyle}>{t("جارٍ تحميل المواد المناسبة للمرحلة...", "Loading subjects for this stage...")}</Text> : null}
            {teachingStage && subjects.length ? <Text style={mutedStyle}>{t("سيتم عرض المعلمين الذين يدرّسون المادة للمرحلة المختارة.", "Results will match teachers who teach this subject to the selected stage.")}</Text> : null}
            {!loading && teachingStage && !subjects.length ? <Text style={mutedStyle}>{t("لا توجد مواد متاحة حالياً.", "No subjects are currently available.")}</Text> : null}
            <View style={[styles.schedulePanel, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={styles.schedulePanelHeading}>
                <View style={[styles.schedulePanelIcon, { backgroundColor: colors.navySoft }]}><Icon name="clock" size={16} color={colors.primary} /></View>
                <View style={styles.stepCopy}>
                  <Text style={[styles.schedulePanelTitle, textStyle]}>{t("متى يناسبك؟", "When works for you?")}</Text>
                  <Text style={[styles.schedulePanelSubtitle, mutedStyle]}>{t("اختر يوماً ثم وقتاً متاحاً للحصة", "Choose a day and an available time")}</Text>
                </View>
                <Text style={[styles.localTimeBadge, { color: colors.teal, backgroundColor: colors.tealSoft }]}>{t("توقيتك المحلي", "Local time")}</Text>
              </View>
              <Text style={[styles.scheduleLabel, { color: colors.mutedForeground }]}>{t("الأيام القادمة", "Coming days")}</Text>
              <View style={styles.dateGrid}>{dateOptions.map((option) => {
                const selected = scheduleDate === option.key;
                const hasAvailableTimes = getInPersonAppointmentTimes(option.key).length > 0;
                return <Pressable key={option.key} testID={`in-person-date-${option.key}`} accessibilityRole="button" accessibilityState={{ selected, disabled: !hasAvailableTimes }} disabled={!hasAvailableTimes} onPress={() => {
                  const availableTimes = getInPersonAppointmentTimes(option.key);
                  const time = availableTimes.includes(scheduleTime) ? scheduleTime : availableTimes[0] ?? "08:00";
                  invalidateTeacherSearch();
                  setScheduledAt(`${option.key}T${time}`);
                }} style={[styles.dateOption, { borderColor: selected ? colors.teal : colors.border, borderWidth: selected ? 1.5 : 1, backgroundColor: selected ? colors.tealSoft : colors.card, opacity: hasAvailableTimes ? 1 : 0.45 }]}>
                  <Text style={[styles.dateDay, { color: selected ? colors.teal : colors.mutedForeground }]}>{option.day}</Text>
                  <Text style={[styles.dateValue, { color: selected ? colors.teal : colors.foreground }]}>{option.label}</Text>
                </Pressable>;
              })}</View>
              {timeOptions.length ? (
                <>
                  <View style={styles.availableTimesHeading}>
                    <Text style={[styles.scheduleLabel, { color: colors.mutedForeground }]}>{t("الأوقات المتاحة", "Available times")}</Text>
                    <Text style={[styles.availableTimeCount, { color: colors.mutedForeground }]}>{timeOptions.length.toLocaleString(locale)} {t("موعد", "slots")}</Text>
                  </View>
                  <View style={styles.timeGrid}>{timeOptions.map((time) => {
                    const selected = scheduleTime === time;
                    return <Pressable key={time} testID={`in-person-time-${time}`} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { invalidateTeacherSearch(); setScheduledAt(`${scheduleDate}T${time}`); }} style={[styles.timeOption, { borderColor: selected ? colors.teal : colors.border, borderWidth: selected ? 1.5 : 1, backgroundColor: selected ? colors.teal : colors.card }]}>
                      <Icon name="clock" size={12} color={selected ? colors.primaryForeground : colors.mutedForeground} />
                      <Text style={{ color: selected ? colors.primaryForeground : colors.foreground, fontSize: 12, fontFamily: selected ? "Inter_700Bold" : "Inter_600SemiBold" }}>{time}</Text>
                    </Pressable>;
                  })}</View>
                </>
              ) : (
                <View testID="in-person-empty-schedule" accessibilityLiveRegion="polite" style={[styles.noTimesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.noTimesIcon, { backgroundColor: colors.navySoft }]}><Icon name="calendar" size={18} color={colors.primary} /></View>
                  <Text style={[styles.noTimesTitle, textStyle]}>{t("لا توجد حصص متاحة اليوم", "No lessons available today")}</Text>
                  <Text style={[styles.noTimesDescription, mutedStyle]}>{t("ستظهر حصص هذا اليوم عند تحديدها أو عند بدء المعلم الجلسة.", "Lessons will appear here when they are scheduled or when a teacher opens a session.")}</Text>
                </View>
              )}
              <Text style={[styles.timeRule, mutedStyle]}>{t("اختر موعداً بعد ساعتين على الأقل من الآن.", "Appointments must be at least two hours from now.")}</Text>
            </View>
            <View style={[styles.bookingReview, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <View style={styles.reviewHeading}>
                <View style={[styles.contextIcon, { backgroundColor: colors.tealSoft }]}><Icon name="clipboard" size={15} color={colors.teal} /></View>
                <View style={styles.stepCopy}>
                  <Text style={[styles.reviewTitle, textStyle]}>{t("ملخص حصتك", "Your lesson summary")}</Text>
                  <Text style={[styles.reviewSubtitle, mutedStyle]}>{t("راجع التفاصيل قبل البحث عن المعلمين", "Review the details before finding teachers")}</Text>
                </View>
              </View>
              <View style={styles.reviewFacts}>
                {[
                  { icon: "map-pin" as const, label: selectedCity ? cityLabel(selectedCity) : t("اختر مدينة", "Choose a city"), detail: selectedAddress ? [selectedAddress.street_address, selectedAddress.district].filter(Boolean).join(" · ") : t("العنوان غير محدد", "Address not selected") },
                  { icon: "book-open" as const, label: teachingStage || t("المرحلة غير محددة", "Stage not selected"), detail: selectedSubject?.name ?? t("المادة غير محددة", "Subject not selected") },
                  { icon: "clock" as const, label: selectedScheduleLabel, detail: t("بالتوقيت المحلي", "Local time") },
                ].map((fact) => (
                  <View key={fact.icon} style={[styles.reviewFact, { backgroundColor: colors.card }]}>
                    <Icon name={fact.icon} size={14} color={colors.teal} />
                    <View style={styles.reviewFactCopy}>
                      <Text style={[styles.reviewFactTitle, textStyle]} numberOfLines={1}>{fact.label}</Text>
                      <Text style={[styles.reviewFactDetail, mutedStyle]} numberOfLines={2}>{fact.detail}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
            <Pressable testID="in-person-search-teachers" disabled={saving || loading || !selectedAddress || !selectedCity?.in_person_enabled || !teachingStage || !subjects.some((subject) => subject.id === subjectId) || !parseFutureInPersonDateTime(scheduledAt)} onPress={() => searchPerformed ? setTeacherResultsVisible(true) : void searchTeachers()} style={({ pressed }) => [styles.studentSearchButton, actionStyle, (saving || loading || !selectedAddress || !selectedCity?.in_person_enabled || !teachingStage || !subjects.some((subject) => subject.id === subjectId) || !parseFutureInPersonDateTime(scheduledAt)) && styles.disabled, pressed && !saving && !loading && styles.pressed]}>
              {saving && searchInFlightRef.current ? <ActivityIndicator color={colors.primaryForeground} /> : <><Icon name={searchPerformed ? "users" : "search"} size={16} color={colors.primaryForeground} /><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{searchPerformed ? t("عرض المعلمين المتاحين", "View available teachers") : t("ابحث عن المعلمين", "Find available teachers")}</Text></>}
            </Pressable>
            {searchPerformed ? (
              <Pressable accessibilityRole="button" onPress={() => setTeacherResultsVisible(true)} style={[styles.resultsSummary, { borderColor: colors.border, backgroundColor: colors.tealSoft }]}>
                <Icon name="users" size={17} color={colors.teal} />
                <Text style={[styles.resultsSummaryText, textStyle]}>
                  {teachers.length
                    ? `${teachers.length} ${t("معلمين متاحين", "teachers available")}${selectedTeachers.length ? ` · ${selectedTeachers.length} ${t("محدد", "selected")}` : ""}`
                    : t("لا توجد نتائج لهذا الموعد", "No teachers match this time")}
                </Text>
                <Icon name={direction === "rtl" ? "chevron-left" : "chevron-right"} size={16} color={colors.teal} />
              </Pressable>
            ) : null}
          </View>
        </>
      ) : role === "teacher" ? (
        <>
          <Text style={[styles.sectionTitle, textStyle]}>{t("نمط التدريس", "Teaching mode")}</Text>
          <View style={styles.chips}>{(["online", "both", "in_person"] as const).map((mode) => <Pressable key={mode} disabled={saving} onPress={() => void setTeachingMode(mode)} style={[styles.chip, { borderColor: settings?.teaching_mode === mode ? colors.teal : colors.border }]}><Text style={mutedStyle}>{mode === "online" ? t("أونلاين", "Online") : mode === "both" ? t("كلاهما", "Both") : t("حضوري", "In-person")}</Text></Pressable>)}</View>
          <View style={cardStyle}>
            <Text style={[styles.cardTitle, textStyle]}>{t("موقع ونطاق التدريس", "Teaching location and service radius")}</Text>
            <Text style={mutedStyle}>{t("الدولة: المملكة العربية السعودية.", "Country: Saudi Arabia.")}</Text>
            <Text style={mutedStyle}>{t("حالة الاعتماد", "Approval")}: {String(settings?.approval_status ?? t("غير مقدم", "Not submitted"))}{settings?.rejection_reason ? ` · ${String(settings.rejection_reason)}` : ""}</Text>
            <View style={styles.chips}>{cityOptions.map((city) => <Pressable key={city.id} onPress={() => setCityId(city.id)} style={[styles.chip, { borderColor: cityId === city.id ? colors.teal : colors.border }]}><Text style={mutedStyle}>{city.name_ar}</Text></Pressable>)}</View>
            <TextInput value={teacherStreet} onChangeText={setTeacherStreet} placeholder={t("عنوان خدمة المعلم", "Teacher service street address")} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
            <Pressable onPress={() => void getCurrentLocation()} style={[styles.secondary, { borderColor: colors.border }]}><Icon name="map-pin" size={16} color={colors.teal} /><Text style={textStyle}>{t("استخدام موقعي الحالي", "Use current location")}</Text></Pressable>
             <Text style={mutedStyle}>{t("اضغط على الخريطة أو حرّك العلامة لتحديد موقع الخدمة.", "Tap the map or drag the marker to set the service location.")}</Text>
             <LocationPicker latitude={teacherLatitude} longitude={teacherLongitude} locationGranted={locationGranted} colors={colors} onChange={(lat, lng) => { setTeacherLatitude(String(lat)); setTeacherLongitude(String(lng)); }} webMessage={t("الخريطة التفاعلية متاحة في تطبيق الهاتف.", "Interactive map is available in the mobile app.")} />
            <View style={styles.row}><TextInput value={teacherLatitude} onChangeText={setTeacherLatitude} placeholder={t("خط العرض", "Latitude")} keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.half, { color: colors.foreground, borderColor: colors.border }]} /><TextInput value={teacherLongitude} onChangeText={setTeacherLongitude} placeholder={t("خط الطول", "Longitude")} keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.half, { color: colors.foreground, borderColor: colors.border }]} /></View>
            <TextInput value={teacherRadius} onChangeText={setTeacherRadius} placeholder={t("نطاق الخدمة بالكيلومتر", "Service radius in km")} keyboardType="number-pad" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
            <Pressable disabled={saving} onPress={() => void saveTeacherLocation()} style={[styles.primary, actionStyle, saving && styles.disabled]}><Text style={styles.primaryText}>{t("حفظ وإرسال للاعتماد", "Save and submit for approval")}</Text></Pressable>
          </View>
          {groups.length ? <Text style={[styles.sectionTitle, textStyle]}>{t("طلبات الحضوري", "In-person requests")}</Text> : null}
          {groups.map((group) => {
            const snapshot = getInPersonBookingSnapshot(group);
            const rate = snapshot.teacherRateSar === null ? "" : ` · ${snapshot.teacherRateSar} ${t("ر.س للمعلم", "SAR teacher rate")}`;
            return <View key={String(group.request_group_id)} style={cardStyle}>
              <Text style={[styles.cardTitle, textStyle]}>{group.student_name} · {group.subject_name}</Text>
              <Text style={mutedStyle}>{group.city_name} · {localLabel(group.scheduled_at, locale)} · {inPersonRequestStatusLabel(group.status, locale.startsWith("ar") ? "ar" : "en")}{rate}</Text>
              {group.status === "open" ? <View style={styles.row}>
                <Pressable disabled={saving} onPress={() => void runTeacherDecision(String(group.request_group_id), "accept")} style={[styles.primary, actionStyle, saving && styles.disabled]}><Text style={styles.primaryText}>{t("قبول", "Accept")}</Text></Pressable>
                <Pressable disabled={saving} onPress={() => void runTeacherDecision(String(group.request_group_id), "reject")} style={[styles.secondary, { borderColor: colors.destructive }]}><Text style={{ color: colors.destructive }}>{t("رفض", "Decline")}</Text></Pressable>
              </View> : null}
            </View>;
          })}
          <Text style={[styles.sectionTitle, textStyle]}>{t("أكواد الحضور", "Attendance codes")}</Text>
          {teacherBookings.map((booking) => {
            const snapshot = getInPersonBookingSnapshot(booking);
            const facts = [
              snapshot.instructionMinutes === null ? null : `${snapshot.instructionMinutes} ${t("دقيقة تدريس", "teaching minutes")}`,
              snapshot.packageMinutes === null ? null : `${snapshot.packageMinutes} ${t("دقيقة من الباقة", "package minutes")}`,
              snapshot.teacherRateSar === null ? null : `${snapshot.teacherRateSar} ${t("ر.س للمعلم", "SAR teacher rate")}`,
            ].filter(Boolean);
            return <View key={String(booking.id)} style={cardStyle}><Text style={mutedStyle}>{[localLabel(booking.scheduled_at, locale), ...facts].join(" · ")}</Text>{booking.attendance_confirmed_at ? <Text style={mutedStyle}>{t("تم تأكيد الحضور", "Attendance confirmed")}</Text> : <Pressable onPress={() => void revealTeacherCode(String(booking.id))} style={[styles.primary, actionStyle]}><Text style={styles.primaryText}>{attendanceCodes[String(booking.id)] || t("عرض كود الحضور", "Show attendance code")}</Text></Pressable>}</View>;
          })}
        </>
      ) : <Text style={mutedStyle}>{t("الحساب غير جاهز.", "Account is not ready.")}</Text>}
      <Modal visible={requestSent} transparent animationType="fade" onRequestClose={() => router.replace("/(tabs)/bookings")}>
        <View style={styles.successOverlay}>
          <View style={[styles.successModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.successIcon, { backgroundColor: colors.tealSoft }]}><Icon name="check-circle" size={28} color={colors.teal} /></View>
            <Text style={[styles.cardTitle, textStyle]}>{t("تم إرسال الطلب بنجاح", "Request sent successfully")}</Text>
            <Text style={[styles.successText, { color: colors.mutedForeground }]}>{t("سيتم نقلك إلى الحجوزات لمتابعة حالة الطلب.", "Taking you to Bookings to track your request.")}</Text>
          </View>
        </View>
      </Modal>
      <InPersonTeacherResultsSheet
        visible={teacherResultsVisible}
        teachers={teachers}
        selectedTeacherIds={selectedTeachers}
        subjectLabel={selectedSubject?.name ?? ""}
        cityLabel={selectedCity ? cityLabel(selectedCity) : ""}
        scheduledAtLabel={selectedScheduleLabel}
        searching={saving && searchInFlightRef.current}
        sending={saving && !searchInFlightRef.current}
        onClose={() => setTeacherResultsVisible(false)}
        onToggleTeacher={(teacherId) => setSelectedTeachers((current) => current.includes(teacherId) ? current.filter((id) => id !== teacherId) : [...current, teacherId])}
        onSubmit={() => void createRequest()}
        onSearchAgain={() => void searchTeachers()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  studentIntro: { gap: 4, marginTop: 1, marginBottom: 8, paddingHorizontal: 3 },
  studentIntroEyebrow: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_700Bold", textAlign: "right", letterSpacing: 0.3 },
  studentIntroTitle: { fontSize: 21, lineHeight: 28, fontFamily: "Inter_700Bold", textAlign: "right" },
  studentIntroBody: { fontSize: 11, lineHeight: 16, textAlign: "right" },
  loading: { alignItems: "center", padding: 16, gap: 8 },
  error: { padding: 7, textAlign: "right", writingDirection: "rtl", fontSize: 11, lineHeight: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "800", textAlign: "right", marginTop: 10, marginBottom: 6 },
  card: { borderWidth: 1, borderRadius: 16, padding: 11, marginBottom: 8, gap: 8, shadowColor: "#10264A", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  studentCard: { borderRadius: 20, padding: 11, marginBottom: 8, gap: 8, shadowColor: "#173E8C", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontFamily: "Inter_700Bold", textAlign: "right" },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, textAlign: "right", writingDirection: "rtl" },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  half: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  primary: { minHeight: 48, flex: 1, flexDirection: "row", gap: 8, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  primaryText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "center" },
  secondary: { minHeight: 42, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, flexDirection: "row", gap: 8 },
  disabled: { opacity: 0.5 },
  pressed: { transform: [{ scale: 0.99 }] },
  stepHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  stepIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  stepCopy: { flex: 1, gap: 3 },
  stepNumber: { fontSize: 11, fontFamily: "Inter_700Bold", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9, overflow: "hidden" },
  locationSummaryGrid: { gap: 7 },
  locationSummaryTile: { flex: 1, minWidth: 0, minHeight: 72, borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 7 },
  locationSummaryIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  locationSummaryCopy: { flex: 1, minWidth: 0, gap: 2 },
  locationSummaryLabel: { fontSize: 9, lineHeight: 13, textAlign: "right" },
  locationSummaryValue: { fontSize: 11, lineHeight: 15, fontFamily: "Inter_700Bold", textAlign: "right" },
  locationSummaryMeta: { fontSize: 9, lineHeight: 13, textAlign: "right" },
  locationSummaryActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  locationEditButton: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 2 },
  locationManageButton: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, borderWidth: 1, borderRadius: 10 },
  locationManageText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  fieldLabel: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_700Bold", marginTop: 2 },
  subjectSelectionRow: { gap: 8, alignItems: "flex-start" },
  subjectSelectionColumn: { flex: 1, minWidth: 0 },
  cityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cityOption: { minHeight: 48, width: "48%", flexGrow: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 9 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  cityOptionCopy: { flex: 1, gap: 2 },
  cityName: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_700Bold" },
  cityStatus: { fontSize: 11, lineHeight: 15, fontFamily: "Inter_600SemiBold" },
  addressHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 0 },
  addressContext: { minHeight: 64, borderWidth: 1, borderRadius: 16, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 },
  collapsedLocation: { minHeight: 58, paddingVertical: 8, borderWidth: 1.5 },
  contextIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  addressContextCopy: { flex: 1, minWidth: 0, gap: 4 },
  addressContextTitle: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_700Bold", textAlign: "right" },
  addressBadges: { alignItems: "flex-end", gap: 4 },
  contextBadge: { overflow: "hidden", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontFamily: "Inter_700Bold" },
  addressCount: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  editAddressButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8 },
  editAddressText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  addressOption: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 9 },
  addressOptionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addressOptionTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  addressIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  addressCity: { fontSize: 11, fontFamily: "Inter_700Bold" },
  addressText: { fontSize: 11, lineHeight: 17, fontFamily: "Inter_500Medium", textAlign: "right" },
  primaryAddressBadge: { alignSelf: "flex-start", fontSize: 9, fontFamily: "Inter_700Bold" },
  emptyAddress: { minHeight: 72, borderWidth: 1, borderStyle: "dashed", borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  emptyAddressTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  subjectGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  subjectOption: { minHeight: 46, width: "48%", flexGrow: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  subjectName: { flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  scheduleRow: { flexDirection: "row", gap: 9 },
  scheduleField: { flex: 1, minHeight: 68, borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8, gap: 3 },
  scheduleLabel: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_600SemiBold" },
  scheduleInput: { minHeight: 30, padding: 0, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  dateGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  schedulePanel: { borderWidth: 1, borderRadius: 16, padding: 10, gap: 8, marginTop: 2 },
  schedulePanelHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 1 },
  schedulePanelIcon: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  schedulePanelTitle: { fontSize: 14, lineHeight: 19, fontFamily: "Inter_700Bold", textAlign: "right" },
  schedulePanelSubtitle: { fontSize: 10, lineHeight: 14, textAlign: "right" },
  localTimeBadge: { overflow: "hidden", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5, fontSize: 9, fontFamily: "Inter_700Bold" },
  availableTimesHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  availableTimeCount: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  dateOption: { minHeight: 52, flexGrow: 0, flexBasis: "31%", borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 5, paddingVertical: 6 },
  dateDay: { fontSize: 11, lineHeight: 15, fontFamily: "Inter_600SemiBold" },
  dateValue: { fontSize: 12, lineHeight: 16, fontFamily: "Inter_700Bold" },
  noTimesCard: { minHeight: 112, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 12 },
  noTimesIcon: { width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 1 },
  noTimesTitle: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  noTimesDescription: { fontSize: 10, lineHeight: 15, textAlign: "center" },
  timeRule: { fontSize: 10, lineHeight: 15, textAlign: "right" },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  timeOption: { minHeight: 40, flexGrow: 1, flexBasis: "22%", borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, paddingHorizontal: 4 },
  studentSearchButton: { minHeight: 52, flex: 1, flexDirection: "row", gap: 9, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  resultsSummary: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  resultsSummaryText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  bookingReview: { borderWidth: 1, borderRadius: 16, padding: 10, gap: 7, marginTop: 1 },
  reviewHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  reviewTitle: { fontSize: 15, lineHeight: 20, fontFamily: "Inter_700Bold", textAlign: "right" },
  reviewSubtitle: { marginTop: 1, fontSize: 10, lineHeight: 14, textAlign: "right" },
  reviewFacts: { gap: 5 },
  reviewFact: { minHeight: 43, flexDirection: "row", alignItems: "center", gap: 8, padding: 7, borderRadius: 10 },
  reviewFactCopy: { flex: 1, minWidth: 0, gap: 3 },
  reviewFactTitle: { fontSize: 11, lineHeight: 15, fontFamily: "Inter_700Bold", textAlign: "right" },
  reviewFactDetail: { flex: 1, fontSize: 10, lineHeight: 14, fontFamily: "Inter_500Medium", textAlign: "right" },
  successText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: "Inter_600SemiBold", textAlign: "right", writingDirection: "rtl" },
  successOverlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10, 25, 45, 0.42)", padding: 24 },
  successModal: { width: "100%", maxWidth: 340, alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 22, padding: 24 },
  successIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
