import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Header, Icon, Screen } from "@/components/AjyalUI";
import LocationPicker from "@/components/InPersonLocationPicker";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import { useAjyal } from "@/hooks/useAjyal";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatLocalDateTimeInput, inPersonRequestStatusLabel, parseFutureInPersonDateTime } from "@/lib/inPersonScheduling";
import { getInPersonBookingSnapshot } from "@/lib/inPersonBookingSnapshot";
import { selectSavedAddress } from "@/lib/inPersonAddressSelection";

type Row = Record<string, any>;
type City = { id: string; name_ar: string; name_en: string | null; in_person_enabled: boolean };
type Address = { id: string; city_id: string; street_address: string; district: string | null; additional_details: string | null; latitude: number; longitude: number; is_primary: boolean };
type Teacher = { teacher_id: string; full_name: string; avg_rating: number; distance_km: number; service_radius_km: number };

function errorText(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function records(data: unknown): Row[] {
  return Array.isArray(data) ? data.filter((row): row is Row => !!row && typeof row === "object") : [];
}

function localLabel(value: unknown, locale: string) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export default function InPersonScreen() {
  const routeParams = useLocalSearchParams<{ booking?: string }>();
  const focusedBookingId = typeof routeParams.booking === "string" ? routeParams.booking : "";
  const colors = useColors();
  const { t, locale, direction } = useAppPreferences();
  const { profile, role } = useAjyal();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [groups, setGroups] = useState<Row[]>([]);
  const [studentBookings, setStudentBookings] = useState<Row[]>([]);
  const [teacherBookings, setTeacherBookings] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row | null>(null);
  const [cityId, setCityId] = useState("");
  const [addressId, setAddressId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => formatLocalDateTimeInput(new Date(Date.now() + 3 * 60 * 60 * 1000)));
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [locationGranted, setLocationGranted] = useState(false);
  const [teacherStreet, setTeacherStreet] = useState("");
  const [teacherLatitude, setTeacherLatitude] = useState("");
  const [teacherLongitude, setTeacherLongitude] = useState("");
  const [teacherRadius, setTeacherRadius] = useState("10");
  const [attendanceCodes, setAttendanceCodes] = useState<Record<string, string>>({});
  const [studentCodes, setStudentCodes] = useState<Record<string, string>>({});
  const addressIdRef = useRef(addressId);
  addressIdRef.current = addressId;

  const isTeacher = role === "teacher";
  const cityOptions = useMemo(() => cities, [cities]);
  const selectedCity = cities.find((city) => city.id === cityId) ?? null;
  const selectedAddress = addresses.find((address) => address.id === addressId) ?? null;
  const load = useCallback(async () => {
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
    setGroups([]);
    setStudentBookings([]);
    setTeacherBookings([]);
    setSettings(null);
    setTeachers([]);
    setSelectedTeachers([]);
    setSearchPerformed(false);
    try {
      const [cityResult, addressResult, subjectResult] = await Promise.all([
        supabase.from("cities").select("id,name_ar,name_en,in_person_enabled").eq("country_iso2", "SA").eq("is_active", true).order("name_ar"),
        role === "student"
          ? supabase.from("user_addresses").select("id,city_id,street_address,district,additional_details,latitude,longitude,is_primary").eq("owner_id", user.id).order("is_primary", { ascending: false })
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
        const [groupsResult, studentBookingsResult] = await Promise.all([
          supabase.rpc("list_my_in_person_request_groups"),
          supabase.from("bookings").select("id,scheduled_at,instruction_duration_minutes,balance_cost_minutes,status,session_status,attendance_confirmed_at").eq("student_id", user.id).eq("delivery_mode", "in_person").order("scheduled_at", { ascending: false }).limit(20),
        ]);
        if (groupsResult.error) throw groupsResult.error;
        if (studentBookingsResult.error) throw studentBookingsResult.error;
        setGroups(records(groupsResult.data));
        setStudentBookings(records(studentBookingsResult.data));
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
    if (!supabase || !selectedCity?.in_person_enabled || !selectedAddress || selectedAddress.city_id !== cityId || !subjectId || !date) {
      setError(t("اختر مدينة مفعّلة وعنواناً ومادة وموعداً بعد ساعتين على الأقل.", "Choose an enabled city, address, subject, and a time at least two hours ahead."));
      return;
    }
    setSaving(true); setError(""); setTeachers([]); setSelectedTeachers([]); setSearchPerformed(false);
    const result = await supabase.rpc("search_in_person_teachers", {
      p_city_id: cityId, p_subject_id: subjectId, p_address_id: addressId, p_scheduled_at: date.toISOString(),
    });
    setSaving(false);
    if (result.error) {
      setError(errorText(result.error, t("تعذر البحث عن المعلمين.", "Teacher search failed.")));
      return;
    }
    setTeachers(records(result.data) as Teacher[]);
    setSearchPerformed(true);
  };

  const createRequest = async () => {
    const date = parseFutureInPersonDateTime(scheduledAt);
    if (!supabase || !selectedCity?.in_person_enabled || !selectedAddress || selectedAddress.city_id !== cityId || !subjectId || !date || !selectedTeachers.length) {
      setError(t("اختر معلماً واحداً على الأقل قبل إرسال الطلب.", "Select at least one teacher before sending the request."));
      return;
    }
    setSaving(true); setError("");
    const result = await supabase.rpc("create_in_person_request", {
      p_subject_id: subjectId, p_scheduled_at: date.toISOString(), p_city_id: cityId,
      p_address_id: addressId, p_teacher_ids: selectedTeachers, p_idempotency_key: Crypto.randomUUID(),
    });
    setSaving(false);
    if (result.error) {
      setError(errorText(result.error, t("تعذر إنشاء طلب الحضوري.", "Could not create the in-person request.")));
      return;
    }
    setTeachers([]); setSelectedTeachers([]); setSearchPerformed(false);
    await load();
  };

  const runTeacherDecision = async (groupId: string, decision: "accept" | "reject") => {
    if (!supabase) return;
    setSaving(true); setError("");
    const result = await supabase.rpc(decision === "accept" ? "accept_in_person_request" : "reject_in_person_request", { p_request_group_id: groupId });
    setSaving(false);
    if (result.error) setError(errorText(result.error, t("تعذر تحديث الطلب.", "Could not update the request.")));
    else await load();
  };

  const cancelGroup = async (groupId: string) => {
    if (!supabase) return;
    setSaving(true); setError("");
    const result = await supabase.rpc("cancel_in_person_request_group", { p_request_group_id: groupId });
    setSaving(false);
    if (result.error) setError(errorText(result.error, t("تعذر إلغاء الطلب.", "Could not cancel the request.")));
    else await load();
  };

  const revealTeacherCode = async (bookingId: string) => {
    if (!supabase) return;
    const result = await supabase.rpc("get_in_person_attendance_code", { p_booking_id: bookingId });
    if (result.error) setError(errorText(result.error, t("كود الحضور غير متاح الآن.", "Attendance code is not available now.")));
    else setAttendanceCodes((current) => ({ ...current, [bookingId]: String(result.data ?? "") }));
  };

  const confirmStudentCode = async (bookingId: string) => {
    if (!supabase) return;
    const code = studentCodes[bookingId]?.trim() ?? "";
    if (!code) { setError(t("أدخل كود الحضور أولاً.", "Enter the attendance code first.")); return; }
    setSaving(true); setError("");
    const result = await supabase.rpc("confirm_in_person_attendance_code", { p_booking_id: bookingId, p_code: code });
    setSaving(false);
    if (result.error) setError(errorText(result.error, t("تعذر تأكيد الحضور.", "Could not confirm attendance.")));
    else await load();
  };

  const cardStyle = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];
  const textStyle = { color: colors.foreground, writingDirection: direction } as const;
  const mutedStyle = { color: colors.mutedForeground, writingDirection: direction } as const;
  const actionStyle = { backgroundColor: colors.teal };
  const cityLabel = (city: City) => locale.startsWith("ar") ? city.name_ar : city.name_en ?? city.name_ar;
  const [scheduleDate = "", scheduleTime = ""] = scheduledAt.split("T");
  const updateSchedulePart = (part: "date" | "time", value: string) => {
    const [currentDate = "", currentTime = ""] = scheduledAt.split("T");
    setScheduledAt(`${part === "date" ? value : currentDate}T${part === "time" ? value : currentTime}`);
  };

  return (
    <Screen>
      <Header title={t("التدريس الحضوري", "In-person teaching")} eyebrow={t("العناوين والطلبات", "Locations and requests")} onBack={() => router.back()} avatarText={profile?.displayName?.slice(0, 1)} />
      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.teal} /><Text style={mutedStyle}>{t("جارٍ تحميل البيانات...", "Loading data...")}</Text></View> : null}
      {!!error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      {role === "student" ? (
        <>
          <View style={cardStyle}>
            <View style={styles.stepHeading}>
              <View style={[styles.stepIcon, { backgroundColor: colors.tealSoft }]}><Icon name="map-pin" size={18} color={colors.teal} /></View>
              <View style={styles.stepCopy}>
                <Text style={[styles.cardTitle, textStyle]}>{t("مكان الحصة", "Lesson location")}</Text>
                <Text style={mutedStyle}>{t("اختر المدينة ثم استخدم عنوانك المحفوظ", "Choose a city and use your saved address")}</Text>
              </View>
              <Text style={[styles.stepNumber, { color: colors.teal, backgroundColor: colors.tealSoft }]}>01</Text>
            </View>
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
                    setCityId(city.id);
                    const cityAddress = addresses.find((address) => address.city_id === city.id && address.is_primary)
                      ?? addresses.find((address) => address.city_id === city.id);
                    setAddressId(cityAddress?.id ?? "");
                  }}
                  style={({ pressed }) => [styles.cityOption, { borderColor: selected ? colors.teal : colors.border, backgroundColor: selected ? colors.tealSoft : colors.card, opacity: !city.in_person_enabled ? 0.55 : pressed ? 0.78 : 1 }]}
                >
                  <View style={[styles.radio, { borderColor: selected ? colors.teal : colors.border, backgroundColor: selected ? colors.teal : "transparent" }]}>
                    {selected ? <Icon name="check" size={12} color="#fff" /> : null}
                  </View>
                  <View style={styles.cityOptionCopy}>
                    <Text style={[styles.cityName, textStyle, { color: selected ? colors.teal : colors.foreground }]}>{cityLabel(city)}</Text>
                    <Text style={[styles.cityStatus, { color: city.in_person_enabled ? colors.mutedForeground : colors.destructive }]}>{city.in_person_enabled ? t("متاحة", "Available") : t("غير متاحة حالياً", "Unavailable")}</Text>
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
            {addresses.filter((address) => !cityId || address.city_id === cityId).map((address) => {
              const selected = addressId === address.id;
              return <Pressable key={address.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setAddressId(address.id); setCityId(address.city_id); }} style={({ pressed }) => [styles.addressOption, { borderColor: selected ? colors.teal : colors.border, backgroundColor: selected ? colors.tealSoft : colors.card, opacity: pressed ? 0.82 : 1 }]}>
                <View style={styles.addressOptionTop}>
                  <View style={styles.addressOptionTitle}>
                    <View style={[styles.addressIcon, { backgroundColor: selected ? colors.card : colors.muted }]}><Icon name="map-pin" size={15} color={colors.teal} /></View>
                    <Text style={[styles.addressCity, textStyle]}>{cities.find((city) => city.id === address.city_id)?.name_ar ?? t("عنوان محفوظ", "Saved address")}</Text>
                  </View>
                  <View style={[styles.radio, { borderColor: selected ? colors.teal : colors.border, backgroundColor: selected ? colors.teal : "transparent" }]}>{selected ? <Icon name="check" size={12} color="#fff" /> : null}</View>
                </View>
                <Text style={[styles.addressText, textStyle]}>{address.street_address}{address.district ? ` · ${address.district}` : ""}</Text>
                {address.is_primary ? <Text style={[styles.primaryAddressBadge, { color: colors.teal }]}>{t("العنوان الأساسي", "Primary address")}</Text> : null}
              </Pressable>;
            })}
            {!addresses.some((address) => !cityId || address.city_id === cityId) ? <Pressable accessibilityRole="button" onPress={() => router.push("/profile")} style={[styles.emptyAddress, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Icon name="plus-circle" size={20} color={colors.teal} />
              <View style={styles.stepCopy}>
                <Text style={[styles.emptyAddressTitle, textStyle]}>{t("أضف عنواناً لهذه المدينة", "Add an address for this city")}</Text>
                <Text style={mutedStyle}>{t("سيُحفظ في حسابك ويُستخدم تلقائياً في الحجز القادم.", "Save it in your profile and it will be selected automatically next time.")}</Text>
              </View>
              <Icon name={direction === "rtl" ? "chevron-left" : "chevron-right"} size={18} color={colors.teal} />
            </Pressable> : null}
          </View>
          <View style={cardStyle}>
            <View style={styles.stepHeading}>
              <View style={[styles.stepIcon, { backgroundColor: colors.tealSoft }]}><Icon name="book-open" size={18} color={colors.teal} /></View>
              <View style={styles.stepCopy}>
                <Text style={[styles.cardTitle, textStyle]}>{t("المادة والموعد", "Subject and time")}</Text>
                <Text style={mutedStyle}>{t("اختر ما يناسبك لعرض المعلمين المتاحين", "Choose your preferences to find available teachers")}</Text>
              </View>
              <Text style={[styles.stepNumber, { color: colors.teal, backgroundColor: colors.tealSoft }]}>02</Text>
            </View>
            <Text style={[styles.fieldLabel, textStyle]}>{t("المادة", "Subject")}</Text>
            <View style={styles.subjectGrid}>{subjects.map((subject) => {
              const selected = subjectId === subject.id;
              return <Pressable key={subject.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSubjectId(subject.id)} style={({ pressed }) => [styles.subjectOption, { borderColor: selected ? colors.teal : colors.border, backgroundColor: selected ? colors.tealSoft : colors.card, opacity: pressed ? 0.8 : 1 }]}>
                <Icon name={selected ? "check-circle" : "book-open"} size={16} color={selected ? colors.teal : colors.mutedForeground} />
                <Text style={[styles.subjectName, textStyle, { color: selected ? colors.teal : colors.foreground }]}>{subject.name}</Text>
              </Pressable>;
            })}</View>
            <Text style={[styles.fieldLabel, textStyle]}>{t("موعد الحصة", "Lesson date and time")}</Text>
            <View style={styles.scheduleRow}>
              <View style={[styles.scheduleField, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.scheduleLabel, { color: colors.mutedForeground }]}>{t("التاريخ", "Date")}</Text>
                <TextInput testID="in-person-date" value={scheduleDate} onChangeText={(value) => updateSchedulePart("date", value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCapitalize="none" placeholderTextColor={colors.mutedForeground} style={[styles.scheduleInput, { color: colors.foreground, writingDirection: "ltr" }]} />
              </View>
              <View style={[styles.scheduleField, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.scheduleLabel, { color: colors.mutedForeground }]}>{t("الوقت", "Time")}</Text>
                <TextInput testID="in-person-time" value={scheduleTime} onChangeText={(value) => updateSchedulePart("time", value)} placeholder="HH:mm" keyboardType="numbers-and-punctuation" autoCapitalize="none" placeholderTextColor={colors.mutedForeground} style={[styles.scheduleInput, { color: colors.foreground, writingDirection: "ltr" }]} />
              </View>
            </View>
            <Text style={mutedStyle}>{t("بالتوقيت المحلي؛ يجب أن يسبق الموعد الحجز بساعتين على الأقل.", "Local time; schedule at least two hours ahead.")}</Text>
            <Pressable testID="in-person-search-teachers" disabled={saving || !selectedAddress || !selectedCity?.in_person_enabled || !subjects.length} onPress={() => void searchTeachers()} style={({ pressed }) => [styles.primary, actionStyle, (saving || !selectedAddress || !selectedCity?.in_person_enabled || !subjects.length) && styles.disabled, pressed && !saving && styles.pressed]}>
              {saving ? <ActivityIndicator color="#fff" /> : <><Icon name="search" size={16} color="#fff" /><Text style={styles.primaryText}>{t("ابحث عن المعلمين", "Find available teachers")}</Text></>}
            </Pressable>
            {searchPerformed && !teachers.length && selectedCity?.in_person_enabled && !saving ? <Text style={mutedStyle}>{t("لا توجد نتائج مطابقة لهذا الموعد والعنوان والمادة.", "No teachers match this time, address, and subject.")}</Text> : null}
            {teachers.map((teacher) => {
              const selected = selectedTeachers.includes(teacher.teacher_id);
              return <Pressable key={teacher.teacher_id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedTeachers((current) => selected ? current.filter((id) => id !== teacher.teacher_id) : [...current, teacher.teacher_id])} style={({ pressed }) => [styles.teacherOption, { borderColor: selected ? colors.teal : colors.border, backgroundColor: selected ? colors.tealSoft : colors.card, opacity: pressed ? 0.8 : 1 }]}>
                <View style={[styles.teacherAvatar, { backgroundColor: colors.tealSoft }]}><Icon name="user" size={17} color={colors.teal} /></View>
                <View style={styles.stepCopy}>
                  <Text style={[styles.teacherName, textStyle]}>{teacher.full_name}</Text>
                  <Text style={mutedStyle}>{teacher.distance_km} {t("كم", "km")} · {t("نطاق", "radius")} {teacher.service_radius_km} {t("كم", "km")}</Text>
                </View>
                <Text style={[styles.teacherRating, { color: colors.foreground }]}>★ {teacher.avg_rating}</Text>
                {selected ? <Icon name="check-circle" size={18} color={colors.teal} /> : null}
              </Pressable>;
            })}
            {teachers.length ? <Pressable disabled={saving || !selectedTeachers.length} onPress={() => void createRequest()} style={[styles.primary, actionStyle, (!selectedTeachers.length || saving) && styles.disabled]}><Icon name="send" size={15} color="#fff" /><Text style={styles.primaryText}>{t("إرسال الطلب للمعلمين المحددين", "Send request to selected teachers")}</Text></Pressable> : null}
          </View>
          <Text style={[styles.sectionTitle, textStyle]}>{t("طلباتي الحضورية", "My in-person requests")}</Text>
          {!groups.length && !loading ? <Text style={mutedStyle}>{t("لا توجد طلبات حضورية بعد.", "No in-person requests yet.")}</Text> : null}
          {groups.map((group) => <View key={String(group.request_group_id)} style={[cardStyle, focusedBookingId && String(group.booking_id ?? "") === focusedBookingId && { borderColor: colors.teal, borderWidth: 2 }]}>
            <Text style={styles.cardTitle}>{group.subject_name ?? t("حصة حضورية", "In-person lesson")}</Text>
            <Text style={mutedStyle}>{localLabel(group.scheduled_at, locale)} · {inPersonRequestStatusLabel(group.status, locale.startsWith("ar") ? "ar" : "en")}</Text>
            {group.booking_id ? (() => {
              const booking = studentBookings.find((item) => String(item.id) === String(group.booking_id));
              if (!booking) return null;
              const snapshot = getInPersonBookingSnapshot(booking);
              const facts = [
                snapshot.instructionMinutes === null ? null : `${snapshot.instructionMinutes} ${t("دقيقة تدريس", "teaching minutes")}`,
                snapshot.packageMinutes === null ? null : `${snapshot.packageMinutes} ${t("دقيقة من الباقة", "package minutes")}`,
                snapshot.studentValueSar === null ? null : `${snapshot.studentValueSar} ${t("ر.س قيمة الحصة", "SAR lesson value")}`,
              ].filter(Boolean);
              return <Text style={mutedStyle}>{[...facts, inPersonRequestStatusLabel(booking.session_status, locale.startsWith("ar") ? "ar" : "en")].join(" · ")}</Text>;
            })() : null}
            {group.status === "open" ? <Pressable onPress={() => void cancelGroup(String(group.request_group_id))} style={[styles.secondary, { borderColor: colors.destructive }]}><Text style={{ color: colors.destructive }}>{t("إلغاء الطلب", "Cancel request")}</Text></Pressable> : null}
            {group.booking_id && !group.attendance_confirmed_at ? <><TextInput value={studentCodes[String(group.booking_id)] ?? ""} onChangeText={(value) => setStudentCodes((current) => ({ ...current, [String(group.booking_id)]: value }))} placeholder={t("أدخل كود المعلم", "Enter teacher code")} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} /><Pressable onPress={() => void confirmStudentCode(String(group.booking_id))} style={[styles.primary, actionStyle]}><Text style={styles.primaryText}>{t("تأكيد الحضور", "Confirm attendance")}</Text></Pressable></> : null}
            {group.booking_id && group.attendance_confirmed_at ? <Pressable onPress={() => router.push({ pathname: "/live-session", params: { booking: String(group.booking_id) } })} style={[styles.primary, actionStyle]}><Text style={styles.primaryText}>{t("فتح الجلسة", "Open session")}</Text></Pressable> : null}
          </View>)}
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
          <Text style={[styles.sectionTitle, textStyle]}>{t("طلبات الحضوري", "In-person requests")}</Text>
          {groups.map((group) => {
            const snapshot = getInPersonBookingSnapshot(group);
            const rate = snapshot.teacherRateSar === null ? "" : ` · ${snapshot.teacherRateSar} ${t("ر.س للمعلم", "SAR teacher rate")}`;
            return <View key={String(group.request_group_id)} style={cardStyle}><Text style={styles.cardTitle}>{group.student_name} · {group.subject_name}</Text><Text style={mutedStyle}>{group.city_name} · {localLabel(group.scheduled_at, locale)}{rate}</Text><View style={styles.row}><Pressable disabled={saving} onPress={() => void runTeacherDecision(String(group.request_group_id), "accept")} style={[styles.primary, actionStyle]}><Text style={styles.primaryText}>{t("قبول", "Accept")}</Text></Pressable><Pressable disabled={saving} onPress={() => void runTeacherDecision(String(group.request_group_id), "reject")} style={[styles.secondary, { borderColor: colors.destructive }]}><Text style={{ color: colors.destructive }}>{t("رفض", "Decline")}</Text></Pressable></View></View>;
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", padding: 24, gap: 10 },
  error: { padding: 12, textAlign: "right", writingDirection: "rtl" },
  sectionTitle: { fontSize: 18, fontWeight: "800", textAlign: "right", marginTop: 14, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 12, gap: 12, shadowColor: "#10264A", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
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
  stepIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepCopy: { flex: 1, gap: 3 },
  stepNumber: { fontSize: 10, fontFamily: "Inter_700Bold", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, overflow: "hidden" },
  fieldLabel: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_700Bold", marginTop: 3 },
  cityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  cityOption: { minHeight: 58, width: "48%", flexGrow: 1, borderWidth: 1, borderRadius: 15, paddingHorizontal: 11, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 9 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  cityOptionCopy: { flex: 1, gap: 3 },
  cityName: { fontSize: 11, fontFamily: "Inter_700Bold" },
  cityStatus: { fontSize: 9, fontFamily: "Inter_500Medium" },
  addressHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  editAddressButton: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8 },
  editAddressText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  addressOption: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 9 },
  addressOptionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addressOptionTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  addressIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  addressCity: { fontSize: 11, fontFamily: "Inter_700Bold" },
  addressText: { fontSize: 11, lineHeight: 17, fontFamily: "Inter_500Medium", textAlign: "right" },
  primaryAddressBadge: { alignSelf: "flex-start", fontSize: 9, fontFamily: "Inter_700Bold" },
  emptyAddress: { minHeight: 68, borderWidth: 1, borderStyle: "dashed", borderRadius: 15, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  emptyAddressTitle: { fontSize: 11, fontFamily: "Inter_700Bold" },
  subjectGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  subjectOption: { minHeight: 46, width: "48%", flexGrow: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  subjectName: { flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  scheduleRow: { flexDirection: "row", gap: 9 },
  scheduleField: { flex: 1, minHeight: 68, borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8, gap: 3 },
  scheduleLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  scheduleInput: { minHeight: 30, padding: 0, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  teacherOption: { minHeight: 64, borderWidth: 1, borderRadius: 16, padding: 11, flexDirection: "row", alignItems: "center", gap: 10 },
  teacherAvatar: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  teacherName: { fontSize: 12, fontFamily: "Inter_700Bold" },
  teacherRating: { fontSize: 10, fontFamily: "Inter_700Bold" },
});
