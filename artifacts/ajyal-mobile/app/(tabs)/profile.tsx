import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { Header, Icon, Screen, SectionHeading } from "@/components/AjyalUI";
import { useColors } from "@/hooks/useColors";
import { useAjyal } from "@/hooks/useAjyal";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";

type Row = Record<string, unknown>;
type Subject = { id: string; name: string };
type Attachment = { name: string; uri: string; mimeType?: string | null };
const STAGES = ["رياض الأطفال", "الابتدائية", "المتوسطة", "الثانوية", "قدرات", "تحصيلي"];
const STAGE_TRANSLATIONS: Record<string, string> = {
  "رياض الأطفال": "Kindergarten",
  "الابتدائية": "Elementary",
  "المتوسطة": "Middle school",
  "الثانوية": "High school",
  "قدرات": "Qudurat",
  "تحصيلي": "Tahseeli",
};
const MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024;
const CERTIFICATE_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function value(row: Row | null, key: string): string {
  return typeof row?.[key] === "string" ? row[key] as string : "";
}

function message(error: unknown, fallback: string): string {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : fallback;
}

function storagePath(value: string): string | null {
  const match = value.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/support-files\/(.+?)(?:\?|$)/);
  if (match) return decodeURIComponent(match[1]);
  return /^https?:\/\//i.test(value) ? null : value;
}

async function openCertificateAttachment(value: string, fileName: string) {
  try {
    const path = storagePath(value);
    const signedUrl = path && supabase
      ? (await supabase.storage.from("support-files").createSignedUrl(path, 60 * 60)).data?.signedUrl
      : null;
    await Linking.openURL(signedUrl ?? value);
  } catch (error) {
    Alert.alert("تعذر فتح الشهادة", message(error, `تعذر فتح ${fileName}.`));
  }
}

export default function ProfileScreen() {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const isRTL = direction === "rtl";
  const { user } = useAuth();
  const { role, profile, retryProfile, logout } = useAjyal();
  const teacher = role === "teacher";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [teacherProfileId, setTeacherProfileId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [studentStage, setStudentStage] = useState("");
  const [notifyBefore, setNotifyBefore] = useState(true);
  const [notifyAfter, setNotifyAfter] = useState(true);
  const [notifyExpiry, setNotifyExpiry] = useState(true);
  const [personalDetailsOpen, setPersonalDetailsOpen] = useState(false);
  const [teacherDetailsOpen, setTeacherDetailsOpen] = useState(false);
  const [bankDetailsOpen, setBankDetailsOpen] = useState(false);
  const [qualificationsOpen, setQualificationsOpen] = useState(false);
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
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    const base = await supabase.from("profiles").select("full_name,phone,teaching_stage,notify_before_session,notify_after_session,notify_subscription_expiry").eq("user_id", user.id).single();
    if (base.error) {
      setLoading(false);
       Alert.alert(t("تعذر تحميل الملف الشخصي", "Could not load your profile"), message(base.error, t("حاول مرة أخرى.", "Please try again.")));
      return;
    }
    const baseRow = base.data as Row;
    setFullName(value(baseRow, "full_name"));
    setPhone(value(baseRow, "phone"));
    setStudentStage(value(baseRow, "teaching_stage"));
    setNotifyBefore(typeof baseRow.notify_before_session === "boolean" ? baseRow.notify_before_session : true);
    setNotifyAfter(typeof baseRow.notify_after_session === "boolean" ? baseRow.notify_after_session : true);
    setNotifyExpiry(typeof baseRow.notify_subscription_expiry === "boolean" ? baseRow.notify_subscription_expiry : true);

    if (teacher) {
      const [teacherResult, subjectResult, certificateResult] = await Promise.all([
        supabase.from("teacher_profiles").select("*").eq("user_id", user.id).single(),
        supabase.from("subjects").select("id,name").order("name"),
        supabase.from("teacher_certificates").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }),
      ]);
       if (teacherResult.error) Alert.alert(t("تعذر تحميل بيانات المعلم", "Could not load teacher details"), message(teacherResult.error, t("حاول مرة أخرى.", "Please try again.")));
      const row = teacherResult.data as Row | null;
      const id = value(row, "id");
      setTeacherProfileId(id || null);
      setBio(value(row, "bio"));
      setYearsExperience(row?.years_experience == null ? "" : String(row.years_experience));
      setNationality(value(row, "nationality"));
      setAvailableFrom(value(row, "available_from"));
      setAvailableTo(value(row, "available_to"));
      setBankName(value(row, "bank_name"));
      setIban(value(row, "iban"));
      setAccountHolder(value(row, "account_holder_name"));
      setTeachingStages(Array.isArray(row?.teaching_stages) ? row.teaching_stages.filter((item): item is string => typeof item === "string") : []);
      setSubjects((subjectResult.data ?? []) as Subject[]);
      setCertificates((certificateResult.data ?? []) as Row[]);
      if (id) {
        const relation = await supabase.from("teacher_subjects").select("subject_id").eq("teacher_id", id);
        const first = relation.data?.[0] as Row | undefined;
        setSelectedSubject(typeof first?.subject_id === "string" ? first.subject_id : null);
      }
    }
    setLoading(false);
  }, [teacher, user, t]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!supabase || !user || saving) return;
    if (!fullName.trim()) {
       Alert.alert(t("الاسم مطلوب", "Name required"), t("أدخل الاسم الكامل قبل الحفظ.", "Enter your full name before saving."));
      return;
    }
    setSaving(true);
    try {
      const base = await supabase.from("profiles").update({
        full_name: fullName.trim(),
        phone: phone.trim(),
        notify_before_session: notifyBefore,
        notify_after_session: notifyAfter,
        notify_subscription_expiry: notifyExpiry,
        ...(role === "student" ? { teaching_stage: studentStage || null } : {}),
      }).eq("user_id", user.id);
      if (base.error) throw base.error;
      if (teacher) {
         if (!teacherProfileId) throw new Error(t("لم يتم العثور على ملف المعلم. تواصل مع الدعم.", "Teacher profile not found. Contact support."));
        const teacherUpdate = await supabase.from("teacher_profiles").update({
          bio,
          years_experience: Number(yearsExperience) || 0,
          nationality: nationality || null,
          available_from: availableFrom || null,
          available_to: availableTo || null,
          bank_name: bankName || null,
          iban: iban || null,
          account_holder_name: accountHolder || null,
          teaching_stages: teachingStages,
        }).eq("id", teacherProfileId).select("id");
        if (teacherUpdate.error) throw teacherUpdate.error;
        const deleted = await supabase.from("teacher_subjects").delete().eq("teacher_id", teacherProfileId);
        if (deleted.error) throw deleted.error;
        if (selectedSubject) {
          const inserted = await supabase.from("teacher_subjects").insert({ teacher_id: teacherProfileId, subject_id: selectedSubject });
          if (inserted.error) throw inserted.error;
        }
      }
      await retryProfile();
       Alert.alert(t("تم الحفظ", "Saved"), t("تم تحديث بيانات حسابك بنجاح.", "Your account details were updated successfully."));
    } catch (error) {
       Alert.alert(t("تعذر حفظ البيانات", "Could not save details"), message(error, t("حاول مرة أخرى.", "Please try again.")));
    } finally {
      setSaving(false);
    }
  };

  const pickCertificate = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setCertificateFile({ name: asset.name, uri: asset.uri, mimeType: asset.mimeType });
    }
  };

  const uploadCertificate = async () => {
    if (!supabase || !user || uploading || !certificateName.trim() || !certificateFile) {
       Alert.alert(t("بيانات غير مكتملة", "Incomplete details"), t("أدخل اسم الشهادة واختر ملفاً.", "Enter the certificate name and choose a file."));
      return;
    }
    setUploading(true);
    try {
      const extension = certificateFile.name.includes(".") ? certificateFile.name.split(".").pop() : "bin";
      const path = `certificates/${user.id}/${Date.now()}.${extension}`;
      const bytes = await (await fetch(certificateFile.uri)).arrayBuffer();
      if (bytes.byteLength > MAX_CERTIFICATE_BYTES) {
         throw new Error(t("حجم ملف الشهادة يجب ألا يتجاوز 10 ميغابايت.", "The certificate file must be 10 MB or smaller."));
      }
      if (certificateFile.mimeType && !CERTIFICATE_MIME_TYPES.has(certificateFile.mimeType)) {
         throw new Error(t("يسمح برفع ملفات PDF أو صور JPG وPNG وWebP فقط.", "Only PDF, JPG, PNG, and WebP files are supported."));
      }
      const uploaded = await supabase.storage.from("support-files").upload(path, bytes, { contentType: certificateFile.mimeType ?? undefined });
      if (uploaded.error) throw uploaded.error;
      const inserted = await supabase.from("teacher_certificates").insert({
        teacher_id: user.id,
        name: certificateName.trim(),
        file_url: path,
        file_name: certificateFile.name,
      });
      if (inserted.error) throw inserted.error;
      setCertificateName("");
      setCertificateFile(null);
      const refreshed = await supabase.from("teacher_certificates").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false });
      setCertificates((refreshed.data ?? []) as Row[]);
       Alert.alert(t("تم رفع الشهادة", "Certificate uploaded"), t("أضيفت الشهادة إلى ملف المعلم.", "The certificate was added to your teacher profile."));
    } catch (error) {
       Alert.alert(t("تعذر رفع الشهادة", "Could not upload certificate"), message(error, t("حاول مرة أخرى.", "Please try again.")));
    } finally {
      setUploading(false);
    }
  };

  const deleteCertificate = async (id: string) => {
    if (!supabase) return;
    const deleted = await supabase.from("teacher_certificates").delete().eq("id", id);
     if (deleted.error) Alert.alert(t("تعذر حذف الشهادة", "Could not delete certificate"), message(deleted.error, t("حاول مرة أخرى.", "Please try again.")));
    else setCertificates((current) => current.filter((item) => String(item.id) !== id));
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
     try { await logout(); } catch (error) { Alert.alert(t("تعذر تسجيل الخروج", "Could not sign out"), message(error, t("حاول مرة أخرى.", "Please try again."))); }
    finally { setLoggingOut(false); }
  };

  return (
    <Screen>
       <Header avatarText={profile?.displayName?.slice(0, 1)} eyebrow={t("مساحتك الشخصية", "Your personal space")} title={t("حسابي", "Profile")} onBell={() => router.push("/notifications")} />
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}><Text style={[styles.initial, { color: colors.accentForeground }]}>{profile?.displayName?.slice(0, 1) ?? "؟"}</Text></View>
         <View style={[styles.heroCopy, { alignItems: isRTL ? "flex-end" : "flex-start", marginLeft: isRTL ? 13 : 0, marginRight: isRTL ? 0 : 13 }]}><Text style={[styles.heroName, { color: colors.primaryForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{profile?.displayName ?? "—"}</Text><Text style={[styles.heroMeta, { color: colors.tint, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{profile?.roleLabel === "طالب" ? t("طالب", "Student") : profile?.roleLabel === "معلم" ? t("معلم", "Teacher") : profile?.roleLabel}</Text><Text style={[styles.heroMeta, { color: colors.tint, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{profile?.email}</Text></View>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.teal} /></View> : (
        <>
            <Pressable
              testID="personal-details-toggle"
              accessibilityRole="button"
              accessibilityState={{ expanded: personalDetailsOpen }}
              onPress={() => setPersonalDetailsOpen((open) => !open)}
              style={({ pressed }) => [styles.collapsibleHeading, pressed && styles.pressed]}
            >
              <View style={styles.sectionTitleWrap}>
                <View style={[styles.sectionMark, { backgroundColor: colors.accent }]} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("البيانات الشخصية", "Personal details")}</Text>
              </View>
              <Icon name={personalDetailsOpen ? "chevron-up" : "chevron-down"} size={19} color={colors.teal} />
            </Pressable>
            {personalDetailsOpen ? <FormCard>
              <Field label={t("الاسم الكامل", "Full name")} value={fullName} onChangeText={setFullName} placeholder={t("الاسم كما يظهر في المنصة", "Name as shown on the platform")} />
              <Field label={t("رقم الجوال", "Phone number")} value={phone} onChangeText={setPhone} placeholder="05xxxxxxxx" keyboardType="phone-pad" />
              <Field label={t("البريد الإلكتروني", "Email")} value={profile?.email ?? ""} editable={false} />
              {role === "student" ? <ChoiceGroup label={t("المرحلة الدراسية", "School stage")} options={STAGES} selected={studentStage ? [studentStage] : []} onToggle={(stage) => setStudentStage(studentStage === stage ? "" : stage)} single /> : null}
            </FormCard> : null}

          {teacher ? <>
            <Pressable
              testID="teacher-details-toggle"
              accessibilityRole="button"
              accessibilityState={{ expanded: teacherDetailsOpen }}
              onPress={() => setTeacherDetailsOpen((open) => !open)}
              style={({ pressed }) => [styles.collapsibleHeading, pressed && styles.pressed]}
            >
              <View style={styles.sectionTitleWrap}>
                <View style={[styles.sectionMark, { backgroundColor: colors.accent }]} />
                <Text style={[styles.sectionTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("بيانات المعلم", "Teacher details")}</Text>
              </View>
              <Icon name={teacherDetailsOpen ? "chevron-up" : "chevron-down"} size={19} color={colors.teal} />
            </Pressable>
            {teacherDetailsOpen ? <FormCard>
               <Field label={t("نبذة عنك وخبراتك", "About you and your experience")} value={bio} onChangeText={setBio} multiline placeholder={t("اكتب نبذة عن خبرتك التعليمية", "Tell students about your teaching experience")} />
               <Field label={t("سنوات الخبرة", "Years of experience")} value={yearsExperience} onChangeText={setYearsExperience} keyboardType="number-pad" />
               <Field label={t("الجنسية", "Nationality")} value={nationality} onChangeText={setNationality} />
               <View style={styles.pair}><View style={styles.half}><Field label={t("متاح إلى", "Available until")} value={availableTo} onChangeText={setAvailableTo} placeholder="20:00" /></View><View style={styles.half}><Field label={t("متاح من", "Available from")} value={availableFrom} onChangeText={setAvailableFrom} placeholder="08:00" /></View></View>
               <ChoiceGroup label={t("التخصص (اختر تخصصاً واحداً)", "Subject (choose one)")} options={subjects.map((item) => item.name)} selected={subjects.filter((item) => item.id === selectedSubject).map((item) => item.name)} onToggle={(name) => { const chosen = subjects.find((item) => item.name === name); setSelectedSubject(chosen?.id === selectedSubject ? null : chosen?.id ?? null); }} single />
               <ChoiceGroup label={t("المراحل التي تدرّسها", "Stages you teach")} options={STAGES} selected={teachingStages} onToggle={(stage) => setTeachingStages((current) => current.includes(stage) ? current.filter((item) => item !== stage) : [...current, stage])} />
            </FormCard> : null}

            <Pressable
              testID="bank-details-toggle"
              accessibilityRole="button"
              accessibilityState={{ expanded: bankDetailsOpen }}
              onPress={() => setBankDetailsOpen((open) => !open)}
              style={({ pressed }) => [styles.collapsibleHeading, pressed && styles.pressed]}
            >
              <View style={styles.sectionTitleWrap}>
                <View style={[styles.sectionMark, { backgroundColor: colors.accent }]} />
                <Text style={[styles.sectionTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("البيانات البنكية", "Bank details")}</Text>
              </View>
              <Icon name={bankDetailsOpen ? "chevron-up" : "chevron-down"} size={19} color={colors.teal} />
            </Pressable>
            {bankDetailsOpen ? <FormCard>
               <Field label={t("اسم البنك", "Bank name")} value={bankName} onChangeText={setBankName} />
               <Field label={t("رقم الآيبان (IBAN)", "IBAN")} value={iban} onChangeText={setIban} placeholder="SA00 0000 0000 0000 0000 0000" />
               <Field label={t("اسم صاحب الحساب", "Account holder")} value={accountHolder} onChangeText={setAccountHolder} />
               <Text style={[styles.note, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("تُستخدم هذه البيانات فقط عند معالجة الإدارة لطلبات السحب.", "These details are only used when administration processes withdrawal requests.")}</Text>
            </FormCard> : null}

            <Pressable
              testID="qualifications-toggle"
              accessibilityRole="button"
              accessibilityState={{ expanded: qualificationsOpen }}
              onPress={() => setQualificationsOpen((open) => !open)}
              style={({ pressed }) => [styles.collapsibleHeading, pressed && styles.pressed]}
            >
              <View style={styles.sectionTitleWrap}>
                <View style={[styles.sectionMark, { backgroundColor: colors.accent }]} />
                <Text style={[styles.sectionTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("المؤهلات والشهادات", "Qualifications and certificates")}</Text>
              </View>
              <Icon name={qualificationsOpen ? "chevron-up" : "chevron-down"} size={19} color={colors.teal} />
            </Pressable>
            {qualificationsOpen ? <FormCard>
               <Field label={t("اسم الشهادة", "Certificate name")} value={certificateName} onChangeText={setCertificateName} placeholder={t("مثال: بكالوريوس تربية", "Example: Bachelor of Education")} />
               <Pressable testID="pick-certificate" onPress={() => void pickCertificate()} style={[styles.outlineButton, { borderColor: colors.border }]}><Icon name="paperclip" size={16} color={colors.teal} /><Text style={[styles.outlineText, { color: colors.foreground }]}>{certificateFile?.name ?? t("اختيار ملف الشهادة", "Choose certificate file")}</Text></Pressable>
               <Pressable testID="upload-certificate" disabled={uploading} onPress={() => void uploadCertificate()} style={[styles.action, { backgroundColor: uploading ? colors.muted : colors.teal }]}>{uploading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{t("رفع الشهادة", "Upload certificate")}</Text>}</Pressable>
              {certificates.map((certificate) => <View key={String(certificate.id)} style={[styles.certificate, { borderColor: colors.border }]}>
                <Pressable onPress={() => void deleteCertificate(String(certificate.id))}><Icon name="trash-2" size={17} color={colors.destructive} /></Pressable>
                 <Pressable style={[styles.certificateCopy, { alignItems: isRTL ? "flex-end" : "flex-start" }]} onPress={() => typeof certificate.file_url === "string" && void openCertificateAttachment(certificate.file_url, typeof certificate.file_name === "string" ? certificate.file_name : t("الشهادة", "certificate"))}><Text style={[styles.certificateName, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{String(certificate.name ?? t("شهادة", "Certificate"))}</Text><Text style={[styles.note, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{String(certificate.file_name ?? "")}</Text></Pressable>
              </View>)}
            </FormCard> : null}
          </> : null}

           <SectionHeading title={t("الإعدادات والإشعارات", "Settings and notifications")} />
          <FormCard>
             <ToggleRow label={t("تنبيه قبل موعد الجلسة", "Notify before a session")} value={notifyBefore} onValueChange={setNotifyBefore} />
             <ToggleRow label={t("تنبيه بعد انتهاء الجلسة", "Notify after a session")} value={notifyAfter} onValueChange={setNotifyAfter} />
             <ToggleRow label={t("تنبيه قرب انتهاء الاشتراك", "Notify when your plan is expiring")} value={notifyExpiry} onValueChange={setNotifyExpiry} />
          </FormCard>
           <Pressable testID="save-profile" disabled={saving} onPress={() => void save()} style={[styles.action, { backgroundColor: saving ? colors.muted : colors.primary }]}>{saving ? <ActivityIndicator color={colors.primaryForeground} /> : <><Icon name="save" size={16} color={colors.primaryForeground} /><Text style={[styles.actionText, { color: colors.primaryForeground }]}>{t("حفظ التغييرات", "Save changes")}</Text></>}</Pressable>

           <SectionHeading title={t("المساعدة والدعم", "Help and support")} />
          <FormCard>
             <LinkRow icon="help-circle" label={t("مركز المساعدة", "Help center")} onPress={() => router.push("/support")} />
             <LinkRow icon="message-circle" label={t("تواصل مع الفريق", "Contact the team")} onPress={() => router.push("/support")} />
             <LinkRow icon="shield" label={t("سياسة الخصوصية", "Privacy policy")} onPress={() => router.push("/privacy")} />
             <LinkRow icon="file-text" label={t("شروط الاستخدام", "Terms of use")} onPress={() => router.push("/terms")} />
             <LinkRow icon="log-out" label={loggingOut ? t("جارٍ تسجيل الخروج...", "Signing out...") : t("تسجيل الخروج", "Sign out")} destructive onPress={() => void handleLogout()} />
          </FormCard>
        </>
      )}
    </Screen>
  );
}

function FormCard({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>;
}

function Field({ label, multiline, ...props }: React.ComponentProps<typeof TextInput> & { label: string; multiline?: boolean }) {
  const colors = useColors();
  const { direction } = useAppPreferences();
  return <View style={styles.field}><Text style={[styles.label, { color: colors.foreground, writingDirection: direction, textAlign: direction === "rtl" ? "right" : "left" }]}>{label}</Text><TextInput {...props} multiline={multiline} textAlign={direction === "rtl" ? "right" : "left"} placeholderTextColor={colors.mutedForeground} style={[styles.input, multiline && styles.multiline, !props.editable && props.editable === false && { backgroundColor: colors.muted }, { color: colors.foreground, borderColor: colors.border, writingDirection: direction }]} /></View>;
}

function ChoiceGroup({ label, options, selected, onToggle }: { label: string; options: string[]; selected: string[]; onToggle: (value: string) => void; single?: boolean }) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  return <View style={styles.field}><Text style={[styles.label, { color: colors.foreground, writingDirection: direction, textAlign: direction === "rtl" ? "right" : "left" }]}>{label}</Text><View style={[styles.chips, { justifyContent: direction === "rtl" ? "flex-end" : "flex-start" }]}>{options.map((option) => { const active = selected.includes(option); return <Pressable key={option} onPress={() => onToggle(option)} style={[styles.chip, { backgroundColor: active ? colors.tealSoft : colors.background, borderColor: active ? colors.teal : colors.border }]}><Text style={[styles.chipText, { color: active ? colors.teal : colors.foreground, writingDirection: direction }]}>{t(option, STAGE_TRANSLATIONS[option] ?? option)}</Text></Pressable>; })}</View></View>;
}

function ToggleRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  const colors = useColors();
  const { direction } = useAppPreferences();
  return <View style={[styles.toggle, { flexDirection: direction === "rtl" ? "row" : "row-reverse" }]}><Switch value={value} onValueChange={onValueChange} trackColor={{ false: colors.muted, true: colors.teal }} thumbColor={colors.card} /><Text style={[styles.toggleText, { color: colors.foreground, textAlign: direction === "rtl" ? "right" : "left", writingDirection: direction }]}>{label}</Text><Icon name="bell" size={17} color={colors.teal} /></View>;
}

function LinkRow({ icon, label, onPress, destructive = false }: { icon: "help-circle" | "message-circle" | "shield" | "file-text" | "log-out"; label: string; onPress: () => void; destructive?: boolean }) {
  const colors = useColors();
  const { direction } = useAppPreferences();
  return <Pressable onPress={onPress} style={[styles.linkRow, { flexDirection: direction === "rtl" ? "row" : "row-reverse" }]}><Icon name={direction === "rtl" ? "arrow-left" : "arrow-right"} size={15} color={colors.mutedForeground} /><Text style={[styles.linkText, { color: destructive ? colors.destructive : colors.foreground, textAlign: direction === "rtl" ? "right" : "left", writingDirection: direction }]}>{label}</Text><Icon name={icon} size={18} color={destructive ? colors.destructive : colors.teal} /></Pressable>;
}

const styles = StyleSheet.create({
  hero: { minHeight: 132, borderRadius: 22, padding: 17, flexDirection: "row", alignItems: "center", marginBottom: 16 },
  avatar: { width: 62, height: 62, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  initial: { fontSize: 25, fontFamily: "Inter_700Bold" },
  heroCopy: { flex: 1, alignItems: "flex-end", marginLeft: 13 },
  heroName: { fontSize: 18, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  heroMeta: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 4, writingDirection: "rtl" },
  center: { minHeight: 180, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 19, padding: 14, marginBottom: 17 },
  collapsibleHeading: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 7, marginTop: 1 },
  sectionTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionMark: { width: 5, height: 19, borderRadius: 3 },
  sectionTitle: { fontSize: 18, letterSpacing: -0.2, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  pressed: { opacity: 0.72 },
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
  certificate: { minHeight: 59, borderTopWidth: 1, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 12 },
  certificateCopy: { flex: 1, alignItems: "flex-end" },
  certificateName: { fontSize: 11, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  toggle: { minHeight: 57, flexDirection: "row", alignItems: "center", gap: 10 },
  toggleText: { flex: 1, textAlign: "right", fontSize: 11, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  linkRow: { minHeight: 55, flexDirection: "row", alignItems: "center", gap: 10 },
  linkText: { flex: 1, textAlign: "right", fontSize: 11, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
});