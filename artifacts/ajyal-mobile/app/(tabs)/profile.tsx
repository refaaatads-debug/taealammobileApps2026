import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import CertificatePdfDocument from "@/components/CertificatePdfDocument";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Header, Icon, Screen } from "@/components/AjyalUI";
import { useColors } from "@/hooks/useColors";
import { useAjyal } from "@/hooks/useAjyal";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import {
  deleteTeacherCertificate,
  getCertificateOpenUrl,
  loadProfileData,
  restoreMissingTeacherCertificateFile,
  saveProfileData,
  uploadTeacherCertificate,
  type ProfileDataClient,
  type ProfileRole,
} from "@/lib/profilePersistence";

type Row = Record<string, unknown>;
type Subject = { id: string; name: string };
type Attachment = { name: string; uri: string; mimeType?: string | null };
type CertificateViewerState = {
  id: string;
  name: string;
  fileName: string;
  kind: "image" | "pdf" | "unsupported";
  url: string | null;
};
type ProfileTestHarness = {
  session: {
    user: { id: string; email: string };
    role: ProfileRole;
  };
  client: ProfileDataClient;
};
const STAGES = ["رياض الأطفال", "الابتدائية", "المتوسطة", "الثانوية", "قدرات", "تحصيلي"];
const STAGE_TRANSLATIONS: Record<string, string> = {
  "رياض الأطفال": "Kindergarten",
  "الابتدائية": "Elementary",
  "المتوسطة": "Middle school",
  "الثانوية": "High school",
  "قدرات": "Qudurat",
  "تحصيلي": "Tahseeli",
};

function certificateContentKind(fileName: string): CertificateViewerState["kind"] {
  const normalized = fileName.split(/[?#]/, 1)[0].toLowerCase();
  if (/\.pdf$/i.test(normalized)) return "pdf";
  if (/\.(png|jpe?g|webp|gif)$/i.test(normalized)) return "image";
  return "unsupported";
}

function message(error: unknown, fallback: string): string {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : fallback;
}

function InlineRetryNotice({
  testID,
  retryTestID,
  message: errorMessage,
  retryLabel,
  direction,
  disabled,
  onRetry,
}: {
  testID: string;
  retryTestID: string;
  message: string;
  retryLabel: string;
  direction: "rtl" | "ltr";
  disabled?: boolean;
  onRetry: () => void;
}) {
  const colors = useColors();
  const isRTL = direction === "rtl";
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.errorNotice,
        {
          backgroundColor: colors.card,
          borderColor: colors.destructive,
          flexDirection: isRTL ? "row-reverse" : "row",
        },
      ]}
    >
      <Text style={[styles.errorMessage, { color: colors.destructive, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>
        {errorMessage}
      </Text>
      <Pressable
        testID={retryTestID}
        accessibilityRole="button"
        disabled={disabled}
        onPress={onRetry}
        style={[styles.errorRetry, { backgroundColor: colors.destructive, opacity: disabled ? 0.6 : 1 }]}
      >
        <Text style={[styles.errorRetryText, { color: colors.primaryForeground }]}>{retryLabel}</Text>
      </Pressable>
    </View>
  );
}

export default function ProfileScreen({ testHarness }: { testHarness?: ProfileTestHarness } = {}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, direction } = useAppPreferences();
  const isRTL = direction === "rtl";
  const auth = useAuth();
  const ajyal = useAjyal();
  const user = testHarness?.session.user ?? auth.user;
  const role = testHarness?.session.role ?? ajyal.role;
  const profile = testHarness
    ? {
        displayName: testHarness.session.user.email,
        email: testHarness.session.user.email,
        roleLabel: testHarness.session.role === "teacher" ? "معلم" : "طالب",
        teacherApproved: true,
      }
    : ajyal.profile;
  const retryProfile = testHarness ? async () => {} : ajyal.retryProfile;
  const logout = testHarness ? async () => {} : ajyal.logout;
  const profileClient = testHarness?.client ?? supabase;
  const teacher = role === "teacher";
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileRefreshError, setProfileRefreshError] = useState<string | null>(null);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [teacherProfileId, setTeacherProfileId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [studentStage, setStudentStage] = useState("");
  const [notifyBefore, setNotifyBefore] = useState(true);
  const [notifyAfter, setNotifyAfter] = useState(true);
  const [notifyExpiry, setNotifyExpiry] = useState(true);
  const [bio, setBio] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [nationality, setNationality] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableTo, setAvailableTo] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [teachingStages, setTeachingStages] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [certificates, setCertificates] = useState<Row[]>([]);
  const [certificateName, setCertificateName] = useState("");
  const [certificateFile, setCertificateFile] = useState<Attachment | null>(null);
  const [certificateUploadTimestamp, setCertificateUploadTimestamp] = useState<number | null>(null);
  const [certificateUploadError, setCertificateUploadError] = useState<string | null>(null);
  const [certificateOpenError, setCertificateOpenError] = useState<{ id: string; message: string; canRestore?: boolean } | null>(null);
  const [openingCertificateId, setOpeningCertificateId] = useState<string | null>(null);
  const [restoringCertificateId, setRestoringCertificateId] = useState<string | null>(null);
  const [certificateViewer, setCertificateViewer] = useState<CertificateViewerState | null>(null);
  const [certificatePdfLoading, setCertificatePdfLoading] = useState(false);
  const [certificatePdfError, setCertificatePdfError] = useState(false);
  const [certificatePdfAttempt, setCertificatePdfAttempt] = useState(0);
  const [certificateDeleteError, setCertificateDeleteError] = useState<{ id: string; message: string } | null>(null);
  const [deletingCertificateId, setDeletingCertificateId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setDataLoaded(false);
    setLoadError(false);
    if (!profileClient || !user || (role !== "student" && role !== "teacher")) {
      setLoading(false);
      setLoadError(true);
      return;
    }
    setLoading(true);
    try {
      const data = await loadProfileData(
        profileClient as unknown as ProfileDataClient,
        user.id,
        role as ProfileRole,
      );
      setFullName(data.fullName);
      setPhone(data.phone);
      setStudentStage(data.studentStage);
      setNotifyBefore(data.notifyBefore);
      setNotifyAfter(data.notifyAfter);
      setNotifyExpiry(data.notifyExpiry);
      setTeacherProfileId(data.teacherProfileId);
      setBio(data.bio);
      setYearsExperience(data.yearsExperience);
      setNationality(data.nationality);
      setAvailableFrom(data.availableFrom);
      setAvailableTo(data.availableTo);
      setBankName(data.bankName);
      setIban(data.iban);
      setAccountHolder(data.accountHolder);
      setTeachingStages(data.teachingStages);
      setSelectedSubject(data.selectedSubject);
      setSubjects(data.subjects);
      setCertificates(data.certificates);
      setDataLoaded(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [profileClient, role, user, t]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!profileClient || !user || saving || !dataLoaded || (role !== "student" && role !== "teacher")) return;
    if (!fullName.trim()) {
       Alert.alert(t("الاسم مطلوب", "Name required"), t("أدخل الاسم الكامل قبل الحفظ.", "Enter your full name before saving."));
      return;
    }
    setProfileSaveError(null);
    setProfileRefreshError(null);
    setSaving(true);
    try {
      await saveProfileData(
        profileClient as unknown as ProfileDataClient,
        user.id,
        role as ProfileRole,
        teacherProfileId,
        {
          fullName,
          phone,
          studentStage,
          notifyBefore,
          notifyAfter,
          notifyExpiry,
          bio,
          yearsExperience,
          nationality,
          availableFrom,
          availableTo,
          bankName,
          iban,
          accountHolder,
          teachingStages,
          selectedSubject,
        },
      );
      try {
        await retryProfile();
        Alert.alert(t("تم الحفظ", "Saved"), t("تم تحديث بيانات حسابك بنجاح.", "Your account details were updated successfully."));
      } catch (error) {
        setProfileRefreshError(message(error, t("تم حفظ التعديلات، لكن تعذر تحديث بيانات الحساب المعروضة.", "Your changes were saved, but the account summary could not be refreshed.")));
      }
    } catch (error) {
      setProfileSaveError(message(error, t("تعذر حفظ البيانات. احتفظنا بالتعديلات؛ أعد المحاولة.", "Could not save details. Your edits are still here; please retry.")));
    } finally {
      setSaving(false);
    }
  };

  const retryProfileRefresh = async () => {
    if (refreshingProfile) return;
    setRefreshingProfile(true);
    try {
      await retryProfile();
      setProfileRefreshError(null);
    } catch (error) {
      setProfileRefreshError(message(error, t("تعذر تحديث بيانات الحساب المعروضة.", "The account summary could not be refreshed.")));
    } finally {
      setRefreshingProfile(false);
    }
  };

  const pickCertificate = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setCertificateFile({ name: asset.name, uri: asset.uri, mimeType: asset.mimeType });
        setCertificateUploadTimestamp(null);
        setCertificateUploadError(null);
      }
    } catch (error) {
      setCertificateUploadError(message(error, t("تعذر اختيار الملف. حاول مرة أخرى.", "Could not choose the file. Please try again.")));
    }
  };

  const uploadCertificate = async () => {
    if (!profileClient || !user || uploading || !certificateName.trim() || !certificateFile) {
       Alert.alert(t("بيانات غير مكتملة", "Incomplete details"), t("أدخل اسم الشهادة واختر ملفاً.", "Enter the certificate name and choose a file."));
      return;
    }
    setCertificateUploadError(null);
    setUploading(true);
    const uploadTimestamp = certificateUploadTimestamp ?? Date.now();
    if (certificateUploadTimestamp === null) setCertificateUploadTimestamp(uploadTimestamp);
    try {
      const bytes = await (await fetch(certificateFile.uri)).arrayBuffer();
      const refreshed = await uploadTeacherCertificate(
        profileClient as unknown as ProfileDataClient,
        user.id,
        certificateName,
        certificateFile.name,
        certificateFile.mimeType,
        bytes,
        uploadTimestamp,
      );
      setCertificateName("");
      setCertificateFile(null);
      setCertificateUploadTimestamp(null);
      setCertificates(refreshed);
      Alert.alert(t("تم رفع الشهادة", "Certificate uploaded"), t("أضيفت الشهادة إلى ملف المعلم.", "The certificate was added to your teacher profile."));
    } catch (error) {
      setCertificateUploadError(message(error, t("تعذر رفع الشهادة. احتفظنا بالاسم والملف؛ أعد المحاولة.", "Could not upload the certificate. The name and file are still here; please retry.")));
    } finally {
      setUploading(false);
    }
  };

  const deleteCertificate = async (id: string, fileUrl?: string) => {
    if (!profileClient || deletingCertificateId) return;
    setCertificateDeleteError(null);
    setDeletingCertificateId(id);
    try {
      await deleteTeacherCertificate(profileClient as unknown as ProfileDataClient, id, fileUrl);
      setCertificates((current) => current.filter((item) => String(item.id) !== id));
    } catch (error) {
      setCertificateDeleteError({
        id,
        message: message(error, t("تعذر حذف الشهادة. احتفظنا بباقي التعديلات؛ أعد المحاولة.", "Could not delete the certificate. Your other edits are still here; please retry.")),
      });
    } finally {
      setDeletingCertificateId(null);
    }
  };

  const restoreCertificate = async (id: string, fileUrl: string, fileName: string, displayName: string) => {
    if (restoringCertificateId) return;
    setRestoringCertificateId(id);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        // Use the broad Android image filter; some device file providers do not
        // launch when given a list of individual MIME types.
        type: "image/*",
      });
      if (picked.canceled || !picked.assets[0]) return;

      const asset = picked.assets[0];
      if (!profileClient || !user) {
        throw new Error(t("تعذر التحقق من جلسة الحساب. أغلق هذه الشاشة وأعد فتحها قبل استعادة الشهادة.", "Could not verify your account session. Reopen this screen before restoring the certificate."));
      }
      const bytes = await (await fetch(asset.uri)).arrayBuffer();
      await restoreMissingTeacherCertificateFile(
        profileClient as unknown as ProfileDataClient,
        user.id,
        fileUrl,
        asset.name,
        asset.mimeType,
        bytes,
      );
      const url = await getCertificateOpenUrl(profileClient as unknown as ProfileDataClient, fileUrl);
      setCertificateOpenError(null);
      setCertificateViewer({ id, name: displayName, fileName, kind: "image", url });
    } catch (error) {
      setCertificateOpenError({
        id,
        message: message(error, t("تعذرت استعادة ملف الشهادة. اختر صورة JPG أو PNG أو WebP لا يتجاوز حجمها 10 ميغابايت.", "Could not restore the certificate. Choose a JPG, PNG, or WebP image up to 10 MB.")),
        canRestore: true,
      });
    } finally {
      setRestoringCertificateId(null);
    }
  };

  const openCertificate = async (id: string, fileUrl: string, fileName: string, displayName: string) => {
    if (openingCertificateId) return;
    setCertificateOpenError(null);
    setOpeningCertificateId(id);
    try {
      const kind = certificateContentKind(fileName || fileUrl);
      const url = kind === "image" || kind === "pdf"
        ? await getCertificateOpenUrl(profileClient as unknown as ProfileDataClient | null, fileUrl)
        : null;
      if (kind === "pdf") {
        setCertificatePdfLoading(true);
        setCertificatePdfError(false);
        setCertificatePdfAttempt(0);
      }
      setCertificateViewer({ id, name: displayName, fileName, kind, url });
    } catch (error) {
      const detail = message(error, t("تعذر فتح الشهادة. أعد المحاولة.", "Could not open the certificate. Please try again."));
      const canRestore = /object not found|file not found|no such object/i.test(detail);
      setCertificateOpenError({
        id,
        message: canRestore
          ? t("ملف الشهادة غير موجود في التخزين. اختر الصورة الأصلية لإعادتها إلى السجل.", "The certificate image is missing from storage. Choose the original image to restore it.")
          : detail,
        canRestore,
      });
    } finally {
      setOpeningCertificateId(null);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
     try { await logout(); } catch (error) { Alert.alert(t("تعذر تسجيل الخروج", "Could not sign out"), message(error, t("حاول مرة أخرى.", "Please try again."))); }
    finally { setLoggingOut(false); }
  };

  return (
    <>
    <Screen>
       <Header avatarText={profile?.displayName?.slice(0, 1)} eyebrow={t("مساحتك الشخصية", "Your personal space")} title={t("حسابي", "Profile")} onBell={() => router.push("/notifications")} />
        <View style={[styles.hero, { backgroundColor: colors.primary, flexDirection: isRTL ? "row" : "row-reverse", shadowColor: colors.primary }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Icon name={role === "student" ? "book-open" : "briefcase"} size={28} color={colors.accentForeground} />
          </View>
          <View style={[styles.heroCopy, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
            <Text style={[styles.heroEyebrow, { color: colors.primaryForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("ملف الحساب", "Account profile")}</Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.heroName, { color: colors.primaryForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{profile?.displayName ?? "—"}</Text>
            <View style={[styles.heroMetaRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={[styles.rolePill, { backgroundColor: colors.teal }]}>
                <Text style={[styles.rolePillText, { color: colors.primaryForeground, writingDirection: direction }]}>{profile?.roleLabel === "طالب" ? t("طالب", "Student") : profile?.roleLabel === "معلم" ? t("معلم", "Teacher") : profile?.roleLabel}</Text>
              </View>
              <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.heroMeta, { color: colors.primaryForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{profile?.email}</Text>
            </View>
            {teacher ? (
              <View
                testID="teacher-identity-card"
                style={[styles.heroStatus, { backgroundColor: profile?.teacherApproved === true ? colors.tealSoft : colors.goldSoft }]}
              >
                <Icon name={profile?.teacherApproved === true ? "check-circle" : "clock"} size={13} color={profile?.teacherApproved === true ? colors.teal : colors.accentForeground} />
                <Text style={[styles.heroStatusText, { color: profile?.teacherApproved === true ? colors.teal : colors.accentForeground, writingDirection: direction }]}>
                  {profile?.teacherApproved === true ? t("حساب معتمد", "Verified account") : t("قيد المراجعة", "Under review")}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={[styles.intro, { flexDirection: isRTL ? "row" : "row-reverse" }]}>
          <View style={[styles.introCopy, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
            <Text style={[styles.introTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("تفاصيل الحساب", "Account details")}</Text>
            <Text style={[styles.introDescription, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>
              {teacher ? t("بياناتك المهنية والشخصية في مكان واحد.", "Your professional and personal details in one place.") : t("بياناتك الدراسية وتفضيلاتك، بكل وضوح.", "Your study details and preferences, clearly organized.")}
            </Text>
          </View>
          <View style={[styles.introTag, { backgroundColor: colors.muted }]}>
            <Text style={[styles.introTagText, { color: colors.mutedForeground, writingDirection: direction }]}>
              {teacher ? t("٤ أقسام مهنية", "4 professional sections") : t("ملفك الدراسي", "Your study profile")}
            </Text>
          </View>
        </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.teal} /></View> : loadError ? (
        <View testID="profile-load-error" style={styles.center}>
          <Text style={[styles.introDescription, { color: colors.mutedForeground, textAlign: "center" }]}>
            {t("تعذر تحميل بيانات الحساب. لم نعرض نموذجاً فارغاً حتى لا تُستبدل بياناتك السابقة.", "Your account details could not be loaded. The empty form is hidden to protect saved data.")}
          </Text>
          <Pressable testID="reload-profile" onPress={() => void load()} style={[styles.action, { backgroundColor: colors.primary }]}>
            <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{t("إعادة المحاولة", "Try again")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
            <ProfileSection number="٠١" title={t("بياناتك الشخصية", "Your personal details")} hint={t("معلومات التواصل المرتبطة بحسابك", "Contact information linked to your account")} icon="user">
              <FormCard>
              <Field testID="profile-full-name" label={t("الاسم الكامل", "Full name")} value={fullName} onChangeText={setFullName} placeholder={t("الاسم كما يظهر في المنصة", "Name as shown on the platform")} />
              <Field testID="profile-phone" label={t("رقم الجوال", "Phone number")} value={phone} onChangeText={setPhone} placeholder="05xxxxxxxx" keyboardType="phone-pad" />
              <Field label={t("البريد الإلكتروني", "Email")} value={profile?.email ?? ""} editable={false} />
              </FormCard>
            </ProfileSection>

          {teacher ? <>
            <ProfileSection number="٠٢" title={t("ملفك التعليمي", "Your teaching profile")} hint={t("عرّف الطلاب بخبرتك ومواعيدك", "Introduce students to your experience and availability")} icon="book-open">
              <FormCard>
               <Field testID="teacher-bio" label={t("نبذة عنك وخبراتك", "About you and your experience")} value={bio} onChangeText={setBio} multiline placeholder={t("اكتب نبذة عن خبرتك التعليمية", "Tell students about your teaching experience")} />
               <Field testID="teacher-years-experience" label={t("سنوات الخبرة", "Years of experience")} value={yearsExperience} onChangeText={setYearsExperience} keyboardType="number-pad" />
               <Field testID="teacher-nationality" label={t("الجنسية", "Nationality")} value={nationality} onChangeText={setNationality} />
               <View style={styles.pair}><View style={styles.half}><Field testID="teacher-available-to" label={t("متاح إلى", "Available until")} value={availableTo} onChangeText={setAvailableTo} placeholder="20:00" /></View><View style={styles.half}><Field testID="teacher-available-from" label={t("متاح من", "Available from")} value={availableFrom} onChangeText={setAvailableFrom} placeholder="08:00" /></View></View>
               <ChoiceGroup testID="teacher-subject" label={t("التخصص (اختر تخصصاً واحداً)", "Subject (choose one)")} options={subjects.map((item) => item.name)} selected={subjects.filter((item) => item.id === selectedSubject).map((item) => item.name)} onToggle={(name) => { const chosen = subjects.find((item) => item.name === name); setSelectedSubject(chosen?.id === selectedSubject ? null : chosen?.id ?? null); }} single />
               <ChoiceGroup testID="teacher-stage" label={t("المراحل التي تدرّسها", "Stages you teach")} options={STAGES} selected={teachingStages} onToggle={(stage) => setTeachingStages((current) => current.includes(stage) ? current.filter((item) => item !== stage) : [...current, stage])} />
              </FormCard>
            </ProfileSection>

            <ProfileSection number="٠٣" title={t("البيانات البنكية", "Bank details")} hint={t("لتسهيل معالجة طلبات السحب", "For withdrawal processing")} icon="credit-card">
              <FormCard>
               <Field testID="teacher-bank-name" label={t("اسم البنك", "Bank name")} value={bankName} onChangeText={setBankName} />
               <Field testID="teacher-iban" label={t("رقم الآيبان (IBAN)", "IBAN")} value={iban} onChangeText={setIban} placeholder="SA00 0000 0000 0000 0000 0000" />
               <Field testID="teacher-account-holder" label={t("اسم صاحب الحساب", "Account holder")} value={accountHolder} onChangeText={setAccountHolder} />
               <Text style={[styles.note, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("تُستخدم هذه البيانات فقط عند معالجة الإدارة لطلبات السحب.", "These details are only used when administration processes withdrawal requests.")}</Text>
              </FormCard>
            </ProfileSection>

            <ProfileSection number="٠٤" title={t("المؤهلات والشهادات", "Qualifications and certificates")} hint={t("أضف مستنداتك المهنية واحتفظ بها هنا", "Add and keep your professional documents here")} icon="file-text">
              <FormCard>
               <Field testID="certificate-name" label={t("اسم الشهادة", "Certificate name")} value={certificateName} onChangeText={setCertificateName} placeholder={t("مثال: بكالوريوس تربية", "Example: Bachelor of Education")} />
               <Pressable testID="pick-certificate" onPress={() => void pickCertificate()} style={[styles.outlineButton, { borderColor: colors.border }]}><Icon name="paperclip" size={16} color={colors.teal} /><Text style={[styles.outlineText, { color: colors.foreground }]}>{certificateFile?.name ?? t("اختيار ملف الشهادة", "Choose certificate file")}</Text></Pressable>
               <Pressable testID="upload-certificate" disabled={uploading} onPress={() => void uploadCertificate()} style={[styles.action, { backgroundColor: uploading ? colors.muted : colors.teal }]}>{uploading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{t("رفع الشهادة", "Upload certificate")}</Text>}</Pressable>
               {certificateUploadError ? <InlineRetryNotice testID="certificate-upload-error" retryTestID="retry-certificate-upload" message={certificateUploadError} retryLabel={t("إعادة المحاولة", "Retry")} direction={direction} disabled={uploading} onRetry={() => void uploadCertificate()} /> : null}
               {certificates.map((certificate) => {
                 const id = String(certificate.id);
                 const fileUrl = typeof certificate.file_url === "string" && certificate.file_url ? certificate.file_url : undefined;
                  const displayName = String(certificate.name ?? t("شهادة", "Certificate"));
                 return <View key={id}>
                    <View style={[styles.certificate, { borderColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                      <View style={[styles.certificateCopy, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                        <Text style={[styles.certificateName, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{displayName}</Text>
                        <Text style={[styles.note, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{String(certificate.file_name ?? "")}</Text>
                      </View>
                      {fileUrl ? (
                        <Pressable
                          testID={`view-certificate-${id}`}
                          accessibilityRole="button"
                          accessibilityLabel={t(`عرض الشهادة ${displayName}`, `View certificate ${displayName}`)}
                          disabled={openingCertificateId !== null || restoringCertificateId !== null || deletingCertificateId !== null}
                          onPress={() => void openCertificate(id, fileUrl, String(certificate.file_name ?? fileUrl), displayName)}
                          style={[styles.certificateView, { backgroundColor: colors.tealSoft, borderColor: colors.border }]}
                        >
                          {openingCertificateId === id
                            ? <ActivityIndicator size="small" color={colors.teal} />
                            : <Icon name="eye" size={15} color={colors.teal} />}
                          <Text style={[styles.certificateViewText, { color: colors.teal, writingDirection: direction }]}>{openingCertificateId === id ? t("جارٍ الفتح…", "Opening…") : t("عرض", "View")}</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        testID={`delete-certificate-${id}`}
                        accessibilityRole="button"
                        accessibilityLabel={t(`حذف الشهادة ${displayName}`, `Delete certificate ${displayName}`)}
                        hitSlop={8}
                        disabled={deletingCertificateId !== null || restoringCertificateId === id}
                        onPress={() => void deleteCertificate(id, fileUrl)}
                      >
                        {deletingCertificateId === id ? <ActivityIndicator color={colors.destructive} /> : <Icon name="trash-2" size={17} color={colors.destructive} />}
                      </Pressable>
                   </View>
                     {certificateOpenError?.id === id ? (
                       <InlineRetryNotice
                         testID={`certificate-open-error-${id}`}
                         retryTestID={certificateOpenError.canRestore ? `restore-certificate-${id}` : `retry-open-certificate-${id}`}
                         message={certificateOpenError.message}
                         retryLabel={certificateOpenError.canRestore ? t("اختيار الصورة الأصلية", "Choose original image") : t("إعادة المحاولة", "Retry")}
                         direction={direction}
                         disabled={openingCertificateId !== null || restoringCertificateId !== null || deletingCertificateId !== null}
                         onRetry={() => fileUrl && (certificateOpenError.canRestore
                           ? void restoreCertificate(id, fileUrl, String(certificate.file_name ?? fileUrl), displayName)
                           : void openCertificate(id, fileUrl, String(certificate.file_name ?? fileUrl), displayName))}
                       />
                     ) : null}
                   {certificateDeleteError?.id === id ? <InlineRetryNotice testID={`certificate-delete-error-${id}`} retryTestID={`retry-delete-certificate-${id}`} message={certificateDeleteError.message} retryLabel={t("إعادة المحاولة", "Retry")} direction={direction} disabled={deletingCertificateId !== null} onRetry={() => void deleteCertificate(id, fileUrl)} /> : null}
                 </View>;
               })}
              </FormCard>
            </ProfileSection>
          </> : (
            <ProfileSection number="٠٢" title={t("المرحلة الدراسية", "School stage")} hint={t("اختر مرحلتك لعرض ما يناسب رحلتك التعليمية", "Choose your stage to personalize your learning journey")} icon="book-open">
              <StagePicker testID="student-stage" value={studentStage} options={STAGES} onChange={setStudentStage} />
            </ProfileSection>
          )}

          <ProfileSection number={teacher ? "٠٥" : "٠٣"} title={t("الإعدادات والإشعارات", "Settings and notifications")} hint={t("اختر التنبيهات التي تناسبك", "Choose the notifications that work for you")} icon="calendar">
            <FormCard>
              <ToggleRow testID="notify-before-session" icon="calendar" label={t("تنبيه قبل موعد الجلسة", "Notify before a session")} value={notifyBefore} onValueChange={setNotifyBefore} />
              <ToggleRow testID="notify-after-session" icon="check-circle" label={t("تنبيه بعد انتهاء الجلسة", "Notify after a session")} value={notifyAfter} onValueChange={setNotifyAfter} />
              <ToggleRow testID="notify-subscription-expiry" icon="credit-card" label={t("تنبيه قرب انتهاء الاشتراك", "Notify when your plan is expiring")} value={notifyExpiry} onValueChange={setNotifyExpiry} />
            </FormCard>
          </ProfileSection>
          <Pressable testID="save-profile" disabled={saving || !dataLoaded} onPress={() => void save()} style={[styles.action, { backgroundColor: saving || !dataLoaded ? colors.muted : colors.primary }]}>{saving ? <ActivityIndicator color={colors.primaryForeground} /> : <><Icon name="save" size={16} color={colors.primaryForeground} /><Text style={[styles.actionText, { color: colors.primaryForeground }]}>{t("حفظ التغييرات", "Save changes")}</Text></>}</Pressable>
          {profileSaveError ? <InlineRetryNotice testID="profile-save-error" retryTestID="retry-profile-save" message={profileSaveError} retryLabel={t("إعادة محاولة الحفظ", "Retry save")} direction={direction} disabled={saving} onRetry={() => void save()} /> : null}
          {profileRefreshError ? <InlineRetryNotice testID="profile-refresh-error" retryTestID="retry-profile-refresh" message={profileRefreshError} retryLabel={t("إعادة تحديث الحساب", "Retry refresh")} direction={direction} disabled={refreshingProfile} onRetry={() => void retryProfileRefresh()} /> : null}

          <ProfileSection kicker={t("نحن هنا لمساعدتك", "We are here to help")} title={t("المساعدة والدعم", "Help and support")} hint={t("روابط مهمة لإدارة تجربتك على أجيال المعرفة", "Important links for your Ajyal experience")} icon="help-circle">
            <FormCard>
              <LinkRow icon="help-circle" label={t("مركز المساعدة", "Help center")} onPress={() => router.push("/help-center")} />
             <LinkRow icon="message-circle" label={t("تواصل مع الفريق", "Contact the team")} onPress={() => router.push("/support")} />
             <LinkRow icon="shield" label={t("سياسة الخصوصية", "Privacy policy")} onPress={() => router.push("/privacy")} />
             <LinkRow icon="file-text" label={t("شروط الاستخدام", "Terms of use")} onPress={() => router.push("/terms")} />
             <LinkRow icon="log-out" label={loggingOut ? t("جارٍ تسجيل الخروج...", "Signing out...") : t("تسجيل الخروج", "Sign out")} destructive onPress={() => void handleLogout()} />
            </FormCard>
          </ProfileSection>
        </>
      )}
    </Screen>
    <Modal
      visible={certificateViewer !== null}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={() => setCertificateViewer(null)}
      testID="certificate-viewer"
    >
      <View
        testID="certificate-viewer-content"
        style={[
          styles.viewerRoot,
          {
            backgroundColor: colors.background,
            paddingTop: Math.max(insets.top, 12) + 8,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={[styles.viewerHeader, { borderBottomColor: colors.border, flexDirection: isRTL ? "row" : "row-reverse" }]}>
          <Pressable
            testID="close-certificate-viewer"
            accessibilityRole="button"
            accessibilityLabel={t("إغلاق عارض الشهادة", "Close certificate viewer")}
            onPress={() => setCertificateViewer(null)}
            hitSlop={8}
            style={styles.viewerClose}
          >
            <Icon name="x" size={21} color={colors.foreground} />
          </Pressable>
          <View style={[styles.viewerHeading, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
            <Text numberOfLines={1} style={[styles.viewerTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>
              {certificateViewer?.name}
            </Text>
            <Text numberOfLines={1} style={[styles.viewerFileName, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>
              {certificateViewer?.fileName}
            </Text>
          </View>
        </View>
        {certificateViewer?.kind === "image" && certificateViewer.url ? (
          <Image
            testID="certificate-image-preview"
            accessibilityLabel={certificateViewer.name}
            source={{ uri: certificateViewer.url }}
            resizeMode="contain"
            style={styles.viewerImage}
          />
        ) : certificateViewer?.kind === "pdf" && certificateViewer.url ? (
          <View testID="certificate-pdf-preview" style={styles.viewerPdfContainer}>
            <CertificatePdfDocument
              uri={certificateViewer.url}
              retryKey={certificatePdfAttempt}
              onLoadComplete={() => {
                setCertificatePdfLoading(false);
                setCertificatePdfError(false);
              }}
              onError={() => {
                setCertificatePdfLoading(false);
                setCertificatePdfError(true);
              }}
            />
            {certificatePdfLoading ? (
              <View pointerEvents="none" style={styles.viewerPdfLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.viewerNoticeBody, { color: colors.mutedForeground, writingDirection: direction }]}>
                  {t("جارٍ تحميل الشهادة...", "Loading certificate...")}
                </Text>
              </View>
            ) : null}
            {certificatePdfError ? (
              <View style={[styles.viewerPdfError, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.viewerNoticeBody, { color: colors.destructive, writingDirection: direction }]}>
                  {t("تعذر تحميل ملف PDF. تحقق من الاتصال ثم أعد المحاولة.", "Could not load the PDF. Check your connection and try again.")}
                </Text>
                <Pressable
                  testID="retry-certificate-pdf"
                  accessibilityRole="button"
                  onPress={() => {
                    setCertificatePdfError(false);
                    setCertificatePdfLoading(true);
                    setCertificatePdfAttempt((attempt) => attempt + 1);
                  }}
                  style={[styles.viewerPdfRetry, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.viewerPdfRetryText, { color: colors.primaryForeground }]}>
                    {t("إعادة المحاولة", "Retry")}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <View
            testID="certificate-viewer-unsupported-notice"
            style={styles.viewerNotice}
          >
            <View style={[styles.viewerNoticeIcon, { backgroundColor: colors.navySoft }]}>
              <Icon name="alert-circle" size={30} color={colors.primary} />
            </View>
            <Text style={[styles.viewerNoticeTitle, { color: colors.foreground, writingDirection: direction }]}>
              {t("المعاينة غير متاحة لهذا الملف", "Preview is unavailable for this file")}
            </Text>
            <Text style={[styles.viewerNoticeBody, { color: colors.mutedForeground, writingDirection: direction }]}>
              {t("لا نفتح الشهادة في متصفح أو تطبيق خارجي.", "Certificates are not opened in an external browser or app.")}
            </Text>
          </View>
        )}
      </View>
    </Modal>
    </>
  );
}

type ProfileSectionIcon = "user" | "book-open" | "credit-card" | "file-text" | "calendar" | "help-circle";

function ProfileSection({ number, kicker, title, hint, icon, children }: { number?: string; kicker?: string; title: string; hint: string; icon: ProfileSectionIcon; children: React.ReactNode }) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const isRTL = direction === "rtl";
  return (
    <View style={[styles.profileSection, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 8, shadowColor: colors.primary }]}>
      <View style={[styles.profileSectionHeader, { flexDirection: isRTL ? "row-reverse" : "row", borderBottomColor: colors.border }]}>
        <View style={[styles.profileSectionIcon, { backgroundColor: colors.accent }]}>
          <Icon name={icon} size={18} color={colors.teal} />
        </View>
        <View style={[styles.profileSectionCopy, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
          <Text style={[styles.profileSectionKicker, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>
            {number ? t(`القسم ${number}`, `Section ${number}`) : kicker}
          </Text>
          <Text accessibilityRole="header" style={[styles.profileSectionTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{title}</Text>
          <Text style={[styles.profileSectionHint, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{hint}</Text>
        </View>
      </View>
      <View style={styles.profileSectionBody}>{children}</View>
    </View>
  );
}

function FormCard({ children }: { children: React.ReactNode }) {
  return <View>{children}</View>;
}

function StagePicker({ testID, value, options, onChange }: { testID: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const isRTL = direction === "rtl";
  const selectedLabel = value ? t(value, STAGE_TRANSLATIONS[value] ?? value) : t("لم تحدد المرحلة بعد", "No stage selected yet");

  return (
    <View>
      <View style={[styles.stageLabelRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Text style={[styles.stageLabel, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("المرحلة الحالية", "Current stage")}</Text>
        <Text style={[styles.stageHint, { color: colors.mutedForeground, writingDirection: direction }]}>{t("اختيار واحد", "Choose one")}</Text>
      </View>
      <View style={[styles.stageGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <Pressable
              key={option}
              testID={`${testID}-${option}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t(option, STAGE_TRANSLATIONS[option] ?? option)}
              onPress={() => onChange(selected ? "" : option)}
              style={[styles.stageOption, { backgroundColor: selected ? colors.tealSoft : colors.background, borderColor: selected ? colors.teal : colors.border }]}
            >
              <Text style={[styles.stageOptionText, { color: selected ? colors.teal : colors.foreground, writingDirection: direction }]}>{t(option, STAGE_TRANSLATIONS[option] ?? option)}</Text>
              {selected ? <Icon name="check" size={14} color={colors.teal} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.stageNote, { backgroundColor: colors.muted, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Icon name="book-open" size={15} color={colors.teal} />
        <Text testID={`${testID}-selected-label`} style={[styles.stageNoteText, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("اختيارك الحالي", "Current selection")}: {selectedLabel}</Text>
      </View>
    </View>
  );
}

function Field({ label, multiline, ...props }: React.ComponentProps<typeof TextInput> & { label: string; multiline?: boolean }) {
  const colors = useColors();
  const { direction } = useAppPreferences();
  return <View style={styles.field}><Text style={[styles.label, { color: colors.foreground, writingDirection: direction, textAlign: direction === "rtl" ? "right" : "left" }]}>{label}</Text><TextInput {...props} multiline={multiline} textAlign={direction === "rtl" ? "right" : "left"} placeholderTextColor={colors.mutedForeground} style={[styles.input, multiline && styles.multiline, !props.editable && props.editable === false && { backgroundColor: colors.muted }, { color: colors.foreground, borderColor: colors.border, writingDirection: direction }]} /></View>;
}

function ChoiceGroup({ testID, label, options, selected, onToggle, single }: { testID: string; label: string; options: string[]; selected: string[]; onToggle: (value: string) => void; single?: boolean }) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  return <View style={styles.field}><Text style={[styles.label, { color: colors.foreground, writingDirection: direction, textAlign: direction === "rtl" ? "right" : "left" }]}>{label}</Text><View style={[styles.chips, { justifyContent: direction === "rtl" ? "flex-end" : "flex-start" }]}>{options.map((option) => { const active = selected.includes(option); return <Pressable key={option} testID={`${testID}-${option}`} accessibilityRole={single ? "radio" : "checkbox"} accessibilityState={{ checked: active }} onPress={() => onToggle(option)} style={[styles.chip, { backgroundColor: active ? colors.tealSoft : colors.background, borderColor: active ? colors.teal : colors.border }]}><Text style={[styles.chipText, { color: active ? colors.teal : colors.foreground, writingDirection: direction }]}>{t(option, STAGE_TRANSLATIONS[option] ?? option)}</Text></Pressable>; })}</View></View>;
}

function ToggleRow({ testID, icon, label, value, onValueChange }: { testID?: string; icon: "calendar" | "check-circle" | "credit-card"; label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  const colors = useColors();
  const { direction } = useAppPreferences();
  const iconColor = icon === "credit-card" ? colors.accentForeground : icon === "check-circle" ? colors.primary : colors.teal;
  const iconBackground = icon === "credit-card" ? colors.goldSoft : icon === "check-circle" ? colors.navySoft : colors.tealSoft;
  return <View style={[styles.toggle, { borderBottomColor: colors.border, flexDirection: direction === "rtl" ? "row" : "row-reverse" }]}><Switch testID={testID} value={value} onValueChange={onValueChange} trackColor={{ false: colors.muted, true: colors.teal }} thumbColor={colors.card} /><Text style={[styles.toggleText, { color: colors.foreground, textAlign: direction === "rtl" ? "right" : "left", writingDirection: direction }]}>{label}</Text><View style={[styles.toggleIcon, { backgroundColor: iconBackground }]}><Icon name={icon} size={16} color={iconColor} /></View></View>;
}

function LinkRow({ icon, label, onPress, destructive = false }: { icon: "help-circle" | "message-circle" | "shield" | "file-text" | "log-out"; label: string; onPress: () => void; destructive?: boolean }) {
  const colors = useColors();
  const { direction } = useAppPreferences();
  const iconColor = destructive ? colors.destructive : icon === "help-circle" ? colors.primary : icon === "message-circle" ? colors.teal : colors.accentForeground;
  const iconBackground = destructive ? `${colors.destructive}18` : icon === "help-circle" ? colors.navySoft : icon === "message-circle" ? colors.tealSoft : colors.goldSoft;
  return <Pressable onPress={onPress} style={[styles.linkRow, { borderBottomColor: colors.border, flexDirection: direction === "rtl" ? "row" : "row-reverse" }]}><Icon name={direction === "rtl" ? "arrow-left" : "arrow-right"} size={15} color={colors.mutedForeground} /><Text style={[styles.linkText, { color: destructive ? colors.destructive : colors.foreground, textAlign: direction === "rtl" ? "right" : "left", writingDirection: direction }]}>{label}</Text><View style={[styles.linkIcon, { backgroundColor: iconBackground }]}><Icon name={icon} size={17} color={iconColor} /></View></Pressable>;
}

const styles = StyleSheet.create({
  hero: { minHeight: 142, borderRadius: 24, padding: 17, alignItems: "center", marginBottom: 16, shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  avatar: { width: 62, height: 62, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, marginHorizontal: 13 },
  heroEyebrow: { fontSize: 9, fontFamily: "Inter_600SemiBold", writingDirection: "rtl", marginBottom: 4, opacity: 0.82 },
  heroName: { maxWidth: "100%", fontSize: 20, lineHeight: 26, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  heroMetaRow: { width: "100%", alignItems: "center", gap: 7, marginTop: 7 },
  rolePill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  rolePillText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  heroMeta: { flex: 1, fontSize: 10, lineHeight: 14, fontFamily: "Inter_500Medium", writingDirection: "rtl" },
  heroStatus: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, marginTop: 7 },
  heroStatusText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  intro: { alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8, marginBottom: 14 },
  introCopy: { flex: 1, minWidth: 0 },
  introTitle: { fontSize: 17, lineHeight: 23, fontFamily: "Inter_700Bold" },
  introDescription: { fontSize: 10, lineHeight: 16, fontFamily: "Inter_400Regular", marginTop: 3 },
  introTag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  introTagText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  center: { minHeight: 180, alignItems: "center", justifyContent: "center" },
  profileSection: { borderWidth: 1, overflow: "hidden", marginBottom: 13, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  profileSectionHeader: { minHeight: 76, alignItems: "center", gap: 11, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  profileSectionIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  profileSectionCopy: { flex: 1, minWidth: 0 },
  profileSectionKicker: { fontSize: 9, fontFamily: "Inter_500Medium", marginBottom: 2 },
  profileSectionTitle: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_700Bold" },
  profileSectionHint: { fontSize: 9, lineHeight: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  profileSectionBody: { paddingHorizontal: 14, paddingTop: 15, paddingBottom: 1 },
  stageLabelRow: { alignItems: "center", justifyContent: "space-between", marginBottom: 9 },
  stageLabel: { fontSize: 10, fontFamily: "Inter_700Bold" },
  stageHint: { fontSize: 9, fontFamily: "Inter_400Regular" },
  stageGrid: { flexWrap: "wrap", gap: 8 },
  stageOption: { flexGrow: 1, flexBasis: "46%", minWidth: 120, minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  stageOptionText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  stageNote: { minHeight: 38, alignItems: "center", gap: 7, borderRadius: 11, paddingHorizontal: 10, marginTop: 10 },
  stageNoteText: { flex: 1, fontSize: 9, lineHeight: 15, fontFamily: "Inter_400Regular" },
  field: { marginBottom: 13 },
  label: { fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl", marginBottom: 7 },
  input: { minHeight: 45, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, fontSize: 12, fontFamily: "Inter_400Regular", writingDirection: "rtl" },
  multiline: { minHeight: 95, paddingTop: 11, textAlignVertical: "top" },
  pair: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, justifyContent: "flex-end" },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  chipText: { fontSize: 10, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  note: { fontSize: 9, lineHeight: 16, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl" },
  outlineButton: { minHeight: 43, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 10 },
  outlineText: { fontSize: 11, fontFamily: "Inter_600SemiBold", maxWidth: "85%" },
  action: { minHeight: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 18 },
  actionText: { fontSize: 12, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  errorNotice: { minHeight: 52, borderWidth: 1, borderRadius: 12, alignItems: "center", gap: 9, padding: 10, marginTop: 9, marginBottom: 12 },
  errorMessage: { flex: 1, fontSize: 10, lineHeight: 16, fontFamily: "Inter_500Medium" },
  errorRetry: { minHeight: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  errorRetryText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  certificate: { minHeight: 59, borderTopWidth: 1, alignItems: "center", gap: 10, marginTop: 12, paddingTop: 12 },
  certificateCopy: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  certificateName: { fontSize: 11, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  certificateView: { minHeight: 38, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  certificateViewText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  viewerRoot: { flex: 1, paddingHorizontal: 14 },
  viewerHeader: { minHeight: 58, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 10 },
  viewerClose: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  viewerHeading: { flex: 1, minWidth: 0 },
  viewerTitle: { width: "100%", fontSize: 15, fontFamily: "Inter_700Bold" },
  viewerFileName: { width: "100%", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 3 },
  viewerImage: { flex: 1, width: "100%", marginVertical: 12 },
  viewerPdfContainer: { flex: 1, width: "100%", marginVertical: 12, position: "relative" },
  viewerPdfLoading: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.82)" },
  viewerPdfError: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 14, padding: 20 },
  viewerPdfRetry: { minHeight: 40, borderRadius: 11, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 14 },
  viewerPdfRetryText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  viewerNotice: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  viewerNoticeIcon: { width: 62, height: 62, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  viewerNoticeTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  viewerNoticeBody: { maxWidth: 320, fontSize: 13, lineHeight: 20, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8 },
  toggle: { minHeight: 57, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  toggleText: { flex: 1, textAlign: "right", fontSize: 11, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  toggleIcon: { width: 35, height: 35, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  linkRow: { minHeight: 57, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  linkText: { flex: 1, textAlign: "right", fontSize: 11, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  linkIcon: { width: 35, height: 35, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});