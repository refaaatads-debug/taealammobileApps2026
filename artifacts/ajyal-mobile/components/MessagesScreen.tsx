import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from "expo-audio";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { EmptyState, Header, Icon, Screen } from "@/components/AjyalUI";
import { customFetch } from "@workspace/api-client-react";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";
import { useAjyal } from "@/hooks/useAjyal";
import { useInternalCall } from "@/contexts/InternalCallContext";
import { getReadChatMessageIds, markChatMessagesRead, subscribeToChatReadState } from "@/lib/localChatReadState";

type Row = Record<string, any>;
const POSTGREST_IN_BATCH_SIZE = 40;

type Participant = {
  id: string;
  participantId: string;
  name: string;
  roleLabel: string;
  avatar: string;
  bookingId: string;
  subject: string;
  scheduledAt: string;
  bookingStatus: string;
  sessionStatus: string;
  bookingIds: string[];
  latestMessage?: Row;
  unreadCount: number;
};

function instantSessionError(message: string): Error {
  return new Error(message);
}

async function createInstantSession({
  userId,
  participantId,
  participantName,
}: {
  userId: string;
  participantId: string;
  participantName: string;
}) {
  if (!supabase) throw instantSessionError("تعذر الاتصال بالمنصة.");
  const now = new Date().toISOString();

  const { data: activeSessions, error: activeError } = await supabase
    .from("bookings")
    .select("id, session_status")
    .eq("student_id", userId)
    .in("session_status", ["waiting_acceptance", "in_progress"])
    .neq("teacher_id", participantId)
    .limit(1);
  if (activeError) throw activeError;
  if (activeSessions?.length) {
    const active = activeSessions[0];
    throw instantSessionError(
      active.session_status === "in_progress"
        ? "لديك جلسة جارية الآن، لا يمكنك بدء جلسة فورية جديدة."
        : "لديك طلب جلسة فورية في انتظار القبول. أنهه أولاً ثم حاول مرة أخرى.",
    );
  }

  await supabase
    .from("bookings")
    .update({ session_status: "expired", status: "cancelled" })
    .eq("teacher_id", participantId)
    .eq("student_id", userId)
    .eq("session_status", "waiting_acceptance");

  const { data: liveTeacher, error: liveError } = await supabase
    .from("bookings")
    .select("id")
    .eq("teacher_id", participantId)
    .eq("session_status", "in_progress")
    .limit(1)
    .maybeSingle();
  if (liveError) throw liveError;
  if (liveTeacher) throw instantSessionError("المعلم في جلسة جارية الآن. جرّب مرة أخرى بعد انتهائها.");

  const { data: waitingTeacher, error: waitingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("teacher_id", participantId)
    .eq("session_status", "waiting_acceptance")
    .neq("student_id", userId)
    .limit(1);
  if (waitingError) throw waitingError;
  if (waitingTeacher?.length) throw instantSessionError("لدى المعلم طلب جلسة فورية من طالب آخر في الانتظار.");

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("user_subscriptions")
    .select("remaining_minutes")
    .eq("user_id", userId)
    .eq("is_active", true)
    .gte("remaining_minutes", 15)
    .gt("ends_at", now);
  if (subscriptionError) throw subscriptionError;
  if (!subscriptions?.length) {
    throw instantSessionError(`لا يمكن بدء جلسة فورية مع ${participantName}: تحتاج إلى باقة نشطة بها 15 دقيقة على الأقل.`);
  }

  const teacherId = participantId;
  const studentId = userId;
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      teacher_id: teacherId,
      student_id: studentId,
      scheduled_at: now,
      duration_minutes: 45,
      status: "confirmed",
      session_status: "waiting_acceptance",
    })
    .select("id")
    .single();
  if (bookingError || !booking) {
    if (bookingError?.message?.includes("INSUFFICIENT_BALANCE") || bookingError?.code === "P0001") {
      throw instantSessionError("لا يمكن بدء الجلسة الفورية: يجب توفر 15 دقيقة على الأقل في الباقة.");
    }
    throw bookingError ?? instantSessionError("تعذر إنشاء طلب الجلسة الفورية.");
  }

  const { error: notificationError } = await supabase.from("notifications").insert({
    user_id: teacherId,
    title: "طلب جلسة فورية",
    body: "يريد الطالب بدء جلسة فورية معك. افتح الحجوزات للقبول.",
    type: "instant_session",
  });
  await customFetch<{ delivered: boolean }>("/api/push/notifications", {
    method: "POST",
    body: JSON.stringify({
      recipientId: teacherId,
      title: "طلب جلسة فورية",
      body: "يريد الطالب بدء جلسة فورية معك. افتح الحجوزات للقبول.",
      type: "instant_session",
      route: "/bookings",
      bookingId: booking.id,
    }),
  }).catch(() => undefined);
  // The booking is authoritative. A notification delivery failure must not
  // make the user retry and accidentally create a second instant booking.
  void notificationError;
  return booking.id as string;
}

type UploadAsset = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  file?: File;
};

function chatStoragePath(url: string) {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/chat-files\/(.+?)(?:\?|$)/);
  if (match) return decodeURIComponent(match[1]);
  // Production stores the object path itself in chat_messages.file_url.
  return url.startsWith("http://") || url.startsWith("https://") ? null : url;
}

async function resolveChatFileUrl(url: string) {
  if (!url) return null;
  if (!supabase) return /^https?:\/\//i.test(url) ? url : null;
  const path = chatStoragePath(url);
  if (!path) return url;
  const result = await supabase.storage.from("chat-files").createSignedUrl(path, 60 * 60);
  if (result.error || !result.data?.signedUrl) {
    throw result.error ?? new Error("تعذر إنشاء رابط آمن للمرفق");
  }
  return result.data.signedUrl;
}

async function openChatFile(url: string, fileName: string) {
  try {
    const resolvedUrl = await resolveChatFileUrl(url);
    if (!resolvedUrl) throw new Error("المرفق غير متاح");
    if (Platform.OS !== "web") {
      await Linking.openURL(resolvedUrl);
      return;
    }
    const response = await fetch(resolvedUrl);
    if (!response.ok) throw new Error("تعذر تحميل المرفق");
    const rawBlob = await response.blob();
    const isPdf = fileName.toLowerCase().endsWith(".pdf") || rawBlob.type === "application/pdf";
    const blob = isPdf && rawBlob.type !== "application/pdf" ? new Blob([rawBlob], { type: "application/pdf" }) : rawBlob;
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    Alert.alert("تعذر فتح المرفق", "تحقق من الاتصال وحاول مرة أخرى.");
  }
}

function text(row: Row | undefined, ...keys: string[]) {
  if (!row) return "";
  for (const key of keys) {
    if (typeof row[key] === "string" && row[key].trim()) return row[key].trim();
  }
  return "";
}

function batches<T>(items: T[], size = POSTGREST_IN_BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function dateLabel(raw?: string, locale = "ar-SA") {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(locale || "ar-SA", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function bookingDateLabel(raw?: string, locale = "ar-SA") {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(locale || "ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function bookingTimeLabel(raw?: string, locale = "ar-SA") {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(locale || "ar-SA", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function bookingStatusLabel(
  status: string,
  sessionStatus: string,
  t: (arabic: string, english: string) => string,
) {
  if (sessionStatus === "in_progress") return t("جلسة جارية", "In progress");
  if (sessionStatus === "waiting_acceptance") return t("بانتظار القبول", "Waiting for acceptance");
  if (status === "confirmed") return t("مؤكد", "Confirmed");
  if (status === "cancelled") return t("ملغى", "Cancelled");
  if (status === "completed") return t("مكتمل", "Completed");
  return status || t("غير محدد", "Unavailable");
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join("") || "؟").toUpperCase();
}

function attachmentLabel(fileType?: string, fileName?: string) {
  if (fileType?.startsWith("audio/")) return "رسالة صوتية";
  if (fileType?.startsWith("image/")) return "صورة";
  if (fileType === "application/pdf" || fileName?.toLowerCase().endsWith(".pdf")) return "ملف PDF";
  return fileName ? "ملف مرفق" : "";
}

function lastMessagePreview(message?: Row) {
  if (!message) return "ابدأ محادثة جديدة";
  return attachmentLabel(message.file_type, message.file_name) || text(message, "content") || "مرفق";
}

function isUnreadMessage(message: Row, userId: string, readMessageIds: Set<string>) {
  return String(message.sender_id) !== userId && !readMessageIds.has(String(message.id));
}

function isActiveParticipant(item: Participant) {
  const closedStatuses = new Set(["cancelled", "completed", "expired", "ended"]);
  return !closedStatuses.has(item.bookingStatus) && !closedStatuses.has(item.sessionStatus);
}

function toUploadAsset(asset: { uri: string; name?: string | null; mimeType?: string | null; size?: number; file?: File }): UploadAsset {
  return {
    uri: asset.uri,
    name: asset.name || `attachment-${Date.now()}`,
    mimeType: asset.mimeType || "application/octet-stream",
    size: asset.size,
    file: asset.file,
  };
}

async function uploadToChat(asset: UploadAsset, bookingId: string) {
  if (!supabase) throw new Error("لا يوجد اتصال بالمنصة");
  if (asset.size && asset.size > 10 * 1024 * 1024) {
    throw new Error("حجم الملف يجب ألا يتجاوز 10 ميجابايت");
  }
  const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${bookingId}/${Date.now()}-${safeName}`;
  let body: File | Blob | ArrayBuffer = asset.file as File;
  if (!body || Platform.OS !== "web") {
    const response = await fetch(asset.uri);
    // Native Supabase uploads are more reliable with an ArrayBuffer than a
    // Blob returned by the Expo file picker or recorder.
    body = Platform.OS === "web" ? await response.blob() : await response.arrayBuffer();
  }
  const upload = await supabase.storage.from("chat-files").upload(path, body, {
    contentType: asset.mimeType,
    upsert: false,
  });
  if (upload.error) throw upload.error;
  // chat-files is private in production. Persist the path and resolve a
  // short-lived signed URL only when the message is rendered/opened.
  return { url: path, name: asset.name, type: asset.mimeType, path };
}

function useResolvedChatFileUrl(url: string) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => (
    chatStoragePath(url) ? null : url || null
  ));
  useEffect(() => {
    let active = true;
    setResolvedUrl(chatStoragePath(url) ? null : url || null);
    void resolveChatFileUrl(url).then((nextUrl) => {
      if (active) setResolvedUrl(nextUrl);
    }).catch(() => {
      if (active) setResolvedUrl(null);
    });
    return () => {
      active = false;
    };
  }, [url]);
  return resolvedUrl;
}

function VoiceMessage({ url, outgoing }: { url: string; outgoing: boolean }) {
  const colors = useColors();
  const resolvedUrl = useResolvedChatFileUrl(url);
  const player = useAudioPlayer(resolvedUrl, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  if (!resolvedUrl) {
    return (
      <Text style={[styles.fileSubtitle, { color: outgoing ? colors.tint : colors.mutedForeground }]}>
        تعذر تحميل الرسالة الصوتية
      </Text>
    );
  }
  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;
  const duration = status.duration > 0 ? status.duration : 0;
  const bars = [0.4, 0.72, 0.52, 0.9, 0.62, 0.35, 0.78, 0.5, 0.95, 0.64, 0.42, 0.7, 0.54, 0.84, 0.48, 0.68];
  return (
    <View style={styles.voiceMessage}>
      <Pressable
        onPress={() => (status.playing ? player.pause() : player.play())}
        style={[styles.voicePlay, { backgroundColor: outgoing ? colors.tint : colors.tealSoft }]}
        accessibilityLabel={status.playing ? "إيقاف الرسالة الصوتية" : "تشغيل الرسالة الصوتية"}
      >
        <Icon name={status.playing ? "pause" : "play"} size={15} color={outgoing ? colors.primary : colors.teal} />
      </Pressable>
      <View style={styles.voiceTrack}>
        <View style={styles.voiceBars}>
          {bars.map((height, index) => (
            <View
              key={index}
              style={[
                styles.voiceBar,
                {
                  height: 8 + height * 15,
                  backgroundColor: index / bars.length <= progress ? (outgoing ? colors.tint : colors.teal) : colors.border,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.voiceTime, { color: outgoing ? colors.tint : colors.mutedForeground }]}>
          {Math.floor(status.currentTime / 60).toString().padStart(2, "0")}:{Math.floor(status.currentTime % 60).toString().padStart(2, "0")}
          {duration ? ` / ${Math.floor(duration / 60).toString().padStart(2, "0")}:${Math.floor(duration % 60).toString().padStart(2, "0")}` : ""}
        </Text>
      </View>
    </View>
  );
}

function MessageAttachment({ message, outgoing }: { message: Row; outgoing: boolean }) {
  const colors = useColors();
  const url = text(message, "file_url");
  const fileType = text(message, "file_type");
  const fileName = text(message, "file_name") || "المرفق";
  const resolvedUrl = useResolvedChatFileUrl(url);
  if (!url) return null;
  if (fileType.startsWith("audio/")) return <VoiceMessage url={url} outgoing={outgoing} />;
  if (!resolvedUrl) {
    return (
      <Pressable onPress={() => void openChatFile(url, fileName)} style={[styles.fileAttachment, { backgroundColor: outgoing ? colors.primaryForeground : colors.navySoft }]}>
        <Icon name="alert-circle" size={17} color={colors.destructive} />
        <Text style={[styles.fileSubtitle, { color: outgoing ? colors.primary : colors.destructive }]}>تعذر تحميل المرفق — اضغط للمحاولة</Text>
      </Pressable>
    );
  }
  if (fileType.startsWith("image/")) {
    return (
      <Pressable onPress={() => void openChatFile(url, fileName)} style={styles.imageAttachment}>
        <Image source={{ uri: resolvedUrl }} style={styles.attachmentImage} resizeMode="cover" />
        <Text style={[styles.attachmentName, { color: outgoing ? colors.tint : colors.mutedForeground }]} numberOfLines={1}>{fileName}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={() => void openChatFile(url, fileName)} style={[styles.fileAttachment, { backgroundColor: outgoing ? colors.primaryForeground : colors.navySoft }]}>
      <View style={[styles.fileIcon, { backgroundColor: outgoing ? colors.tint : colors.primary }]}>
        <Icon name={fileType === "application/pdf" ? "file-text" : "paperclip"} size={17} color={outgoing ? colors.primary : colors.primaryForeground} />
      </View>
      <View style={styles.fileCopy}>
        <Text style={[styles.fileTitle, { color: outgoing ? colors.primary : colors.foreground }]} numberOfLines={1}>{fileName}</Text>
        <Text style={[styles.fileSubtitle, { color: outgoing ? colors.primary : colors.mutedForeground }]}>اضغط لفتح الملف</Text>
      </View>
    </Pressable>
  );
}

function DepthCard({
  children,
  wrapperStyle,
  surfaceStyle,
  surfaceColor,
  depthColor,
  borderColor,
}: {
  children: React.ReactNode;
  wrapperStyle?: object;
  surfaceStyle?: object;
  surfaceColor: string;
  depthColor: string;
  borderColor: string;
}) {
  return (
    <View style={[styles.depthCardWrap, wrapperStyle]}>
      <View style={[styles.depthCardBackplate, { backgroundColor: depthColor, borderColor }]} />
      <View style={[styles.depthCardSurface, surfaceStyle, { backgroundColor: surfaceColor, borderColor }]}>
        {children}
      </View>
    </View>
  );
}

function ParticipantRow({ item, onPress }: { item: Participant; onPress: () => void }) {
  const colors = useColors();
  const { t, direction, locale, formatNumber } = useAppPreferences();
  const isRTL = direction === "rtl";
  const hasUnread = item.unreadCount > 0;
  return (
    <View style={[styles.depthCardWrap, styles.participantRowWrap]}>
      <View style={[styles.depthCardBackplate, { backgroundColor: hasUnread ? colors.tealSoft : colors.navySoft, borderColor: hasUnread ? colors.teal : colors.border }]} />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.participantRow, { backgroundColor: colors.navySoft, borderColor: hasUnread ? colors.teal : colors.border }, pressed && styles.pressed]}
      >
      <View style={[styles.participantTint, { backgroundColor: hasUnread ? colors.tealSoft : colors.card }]} />
      <View style={[styles.participantAccent, { backgroundColor: hasUnread ? colors.teal : colors.primary }]} />
      <View style={styles.rowArrow}><Icon name={isRTL ? "chevron-left" : "chevron-right"} size={19} color={colors.mutedForeground} /></View>
      <View style={[styles.participantCopy, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
        <Text style={[styles.participantName, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]} numberOfLines={1}>{item.name}</Text>
        <View style={styles.bookingSchedule}>
          <Text style={[styles.bookingScheduleLine, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]} numberOfLines={1}>
            <Text style={{ color: colors.mutedForeground }}>تاريخ الحجز</Text>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}> · {bookingDateLabel(item.scheduledAt, locale)}</Text>
          </Text>
          <Text style={[styles.bookingScheduleLine, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]} numberOfLines={1}>
            <Text style={{ color: colors.mutedForeground }}>وقت الحجز</Text>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}> · {bookingTimeLabel(item.scheduledAt, locale)}</Text>
          </Text>
        </View>
        <View style={[styles.participantMetaLine, { borderTopColor: colors.border }]}>
          <Text style={[styles.roleText, { color: colors.teal, writingDirection: direction }]} numberOfLines={1}>
            {item.roleLabel === "معلم" ? t("معلم", "Teacher") : t("طالب", "Student")} · {item.subject || t("مادة غير محددة", "Subject unavailable")}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: hasUnread ? colors.tealSoft : colors.muted }]}>
            <View style={[styles.statusPillDot, { backgroundColor: hasUnread ? colors.teal : colors.mutedForeground }]} />
            <Text style={[styles.statusPillText, { color: hasUnread ? colors.teal : colors.mutedForeground }]} numberOfLines={1}>
              {item.bookingIds.length > 1
                ? `${formatNumber(item.bookingIds.length)} ${t("حجوزات", "bookings")}`
                : bookingStatusLabel(item.bookingStatus, item.sessionStatus, t)}
            </Text>
          </View>
        </View>
        <View style={styles.participantBottom}>
          <Text style={[styles.participantPreview, { color: hasUnread ? colors.foreground : colors.mutedForeground, fontFamily: hasUnread ? "Inter_600SemiBold" : "Inter_400Regular", writingDirection: direction, textAlign: isRTL ? "right" : "left" }]} numberOfLines={1}>{t(lastMessagePreview(item.latestMessage), { "رسالة صوتية": "Voice message", "صورة": "Image", "ملف PDF": "PDF file", "ملف مرفق": "Attachment", "ابدأ محادثة جديدة": "Start a new conversation", "مرفق": "Attachment" }[lastMessagePreview(item.latestMessage)] ?? lastMessagePreview(item.latestMessage))}</Text>
          {hasUnread ? <View style={[styles.unreadBadge, { backgroundColor: colors.teal }]}><Text style={styles.unreadText}>{item.unreadCount > 9 ? "9+" : formatNumber(item.unreadCount)}</Text></View> : null}
        </View>
      </View>
      <View style={[styles.participantAvatar, { backgroundColor: colors.card, borderColor: hasUnread ? colors.tealSoft : colors.card }]}>
        <Text style={[styles.avatarInitials, { color: hasUnread ? colors.teal : colors.primary }]}>{item.avatar}</Text>
        {hasUnread ? <View style={[styles.avatarUnreadDot, { backgroundColor: colors.accent, borderColor: colors.card }]} /> : null}
      </View>
      </Pressable>
    </View>
  );
}

function Composer({
  draft,
  onChange,
  onSend,
  onPickImage,
  onPickPdf,
  onRecord,
  menuOpen,
  recording,
  busy,
  disabled,
}: {
  draft: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onPickImage: () => void;
  onPickPdf: () => void;
  onRecord: () => void;
  menuOpen: boolean;
  recording: boolean;
  busy: boolean;
  disabled: boolean;
}) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const isRTL = direction === "rtl";
  return (
    <View style={styles.composerWrap}>
      {menuOpen && !recording ? (
        <View style={[styles.attachmentMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={onPickImage} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
            <View style={[styles.menuIcon, { backgroundColor: colors.tealSoft }]}><Icon name="image" size={17} color={colors.teal} /></View>
            <Text style={[styles.menuText, { color: colors.foreground, writingDirection: direction }]}>{t("صورة JPG أو PNG", "JPG or PNG image")}</Text>
          </Pressable>
          <Pressable onPress={onPickPdf} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
            <View style={[styles.menuIcon, { backgroundColor: colors.navySoft }]}><Icon name="file-text" size={17} color={colors.primary} /></View>
            <Text style={[styles.menuText, { color: colors.foreground, writingDirection: direction }]}>{t("ملف PDF", "PDF file")}</Text>
          </Pressable>
        </View>
      ) : null}
      {recording ? (
        <View style={[styles.recordingBar, { backgroundColor: colors.goldSoft, borderColor: colors.accent }]}>
          <View style={[styles.recordDot, { backgroundColor: colors.destructive }]} />
          <Text style={[styles.recordingText, { color: colors.foreground, writingDirection: direction }]}>{t("جارٍ تسجيل الرسالة الصوتية…", "Recording voice message…")}</Text>
          <Pressable onPress={onRecord} style={[styles.stopRecord, { backgroundColor: colors.destructive }]}><Icon name="square" size={13} color={colors.primaryForeground} /></Pressable>
        </View>
      ) : (
        <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={onSend} disabled={disabled || busy || !draft.trim()} style={({ pressed }) => [styles.sendButton, { backgroundColor: disabled || busy || !draft.trim() ? colors.muted : colors.primary }, pressed && styles.pressed]}>
            {busy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Icon name="send" size={16} color={disabled || !draft.trim() ? colors.mutedForeground : colors.primaryForeground} />}
          </Pressable>
          <TextInput value={draft} onChangeText={onChange} editable={!disabled && !busy} placeholder={disabled ? t("لا توجد محادثة متاحة", "No conversation available") : t("اكتب رسالتك…", "Write a message…")} placeholderTextColor={colors.mutedForeground} multiline textAlign={isRTL ? "right" : "left"} style={[styles.composerInput, { color: colors.foreground, writingDirection: direction }]} />
          <Pressable onPress={onRecord} disabled={disabled || busy} style={({ pressed }) => [styles.composerAction, pressed && styles.pressed]}>
            <Icon name="mic" size={19} color={disabled || busy ? colors.mutedForeground : colors.teal} />
          </Pressable>
          <Pressable onPress={onPickImage} disabled={disabled || busy} style={({ pressed }) => [styles.composerAction, pressed && styles.pressed]}>
            <Icon name="paperclip" size={19} color={disabled || busy ? colors.mutedForeground : colors.teal} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function PhoneCallModal({
  visible,
  participant,
  teacherId,
  bookingId,
  onClose,
}: {
  visible: boolean;
  participant: Participant;
  teacherId: string;
  bookingId: string | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const [phone, setPhone] = useState("");
  const [balance, setBalance] = useState(0);
  const [pricePerMinute, setPricePerMinute] = useState(0.3);
  const [minutes, setMinutes] = useState(5);
  const [loading, setLoading] = useState(false);
  const [calling, setCalling] = useState(false);
  const [status, setStatus] = useState<"idle" | "initiated" | "failed">("idle");

  useEffect(() => {
    if (!visible || !supabase) return;
    setLoading(true);
    setCalling(false);
    setStatus("idle");
    setMinutes(5);
    void Promise.all([
      supabase.from("profiles").select("phone").eq("user_id", participant.participantId).maybeSingle(),
      supabase.from("wallets").select("balance").eq("user_id", teacherId).maybeSingle(),
      supabase.from("site_settings").select("value").eq("key", "call_price_per_minute").maybeSingle(),
    ]).then(([profileResult, walletResult, priceResult]) => {
      setPhone(typeof profileResult.data?.phone === "string" ? profileResult.data.phone : "");
      setBalance(Number(walletResult.data?.balance || 0));
      const configuredPrice = Number.parseFloat(String(priceResult.data?.value ?? ""));
      if (Number.isFinite(configuredPrice) && configuredPrice >= 0) setPricePerMinute(configuredPrice);
    }).finally(() => setLoading(false));
  }, [participant.id, teacherId, visible]);

  const requiredCost = Math.ceil(minutes) * pricePerMinute;
  const insufficient = balance < requiredCost;

  const handleCall = async () => {
    if (!supabase || !phone.trim() || !bookingId || insufficient || calling) return;
    setCalling(true);
    try {
      const { data, error } = await supabase.functions.invoke("make-phone-call", {
        body: {
          studentPhone: phone.trim(),
          estimatedMinutes: minutes,
          bookingId,
          studentId: participant.participantId,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || t("تعذر بدء المكالمة الهاتفية.", "Could not start the phone call."));
      setBalance(Number(data.newBalance ?? balance - requiredCost));
      setStatus("initiated");
      Alert.alert(t("تم بدء المكالمة", "Call started"), t("تم إرسال الاتصال إلى رقم الطالب.", "The call was sent to the student's phone."));
    } catch (error) {
      setStatus("failed");
      Alert.alert(t("تعذر بدء المكالمة", "Could not start the call"), error instanceof Error ? error.message : t("تحقق من الرصيد ورقم الطالب.", "Check the balance and student phone number."));
    } finally {
      setCalling(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.phoneModalBackdrop, { backgroundColor: `${colors.tint}E8` }]}>
        <View style={[styles.phoneModalCard, { backgroundColor: colors.card }]}>
          <View style={styles.phoneModalHeader}>
            <View style={[styles.phoneModalIcon, { backgroundColor: colors.navySoft }]}><Icon name="phone-call" size={22} color={colors.primary} /></View>
            <View style={styles.phoneModalCopy}>
              <Text style={[styles.phoneModalTitle, { color: colors.foreground, writingDirection: direction }]}>{t("مكالمة هاتفية مدفوعة", "Paid phone call")}</Text>
              <Text style={[styles.phoneModalSubtitle, { color: colors.mutedForeground, writingDirection: direction }]}>{participant.name}</Text>
            </View>
            <Pressable onPress={onClose} disabled={calling} style={styles.phoneModalClose}><Icon name="x" size={19} color={colors.mutedForeground} /></Pressable>
          </View>

          {loading ? (
            <View style={styles.phoneModalLoading}><ActivityIndicator color={colors.teal} /><Text style={[styles.phoneModalBody, { color: colors.mutedForeground }]}>{t("جارٍ تحميل الرصيد ورقم الطالب…", "Loading balance and student phone…")}</Text></View>
          ) : status === "initiated" ? (
            <View style={styles.phoneModalResult}>
              <Icon name="check-circle" size={34} color={colors.teal} />
              <Text style={[styles.phoneModalTitle, { color: colors.foreground, writingDirection: direction }]}>{t("تم إرسال الاتصال", "Call request sent")}</Text>
              <Text style={[styles.phoneModalBody, { color: colors.mutedForeground, writingDirection: direction }]}>{t("المكالمة الآن في حالة انتظار الاتصال بالطالب.", "The call is now waiting to connect to the student.")}</Text>
              <Pressable onPress={onClose} style={[styles.phoneModalPrimary, { backgroundColor: colors.primary }]}><Text style={[styles.phoneModalPrimaryText, { color: colors.primaryForeground }]}>{t("إغلاق", "Close")}</Text></Pressable>
            </View>
          ) : (
            <>
              <View style={[styles.phoneBalanceRow, { backgroundColor: colors.tealSoft, borderColor: colors.border }]}>
                <Text style={[styles.phoneModalBody, { color: colors.foreground, writingDirection: direction }]}>{t("رصيدك", "Your balance")}</Text>
                <Text style={[styles.phoneBalanceValue, { color: insufficient ? colors.destructive : colors.teal }]}>{balance.toFixed(2)} ريال</Text>
              </View>
              <View style={[styles.phoneInfoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Icon name="shield" size={16} color={colors.teal} />
                <Text style={[styles.phoneModalBody, { color: colors.mutedForeground, writingDirection: direction }]}>{phone ? t("رقم الطالب محفوظ وسيتم الاتصال به تلقائيًا.", "The student's phone is saved and will be called automatically.") : t("لا يوجد رقم هاتف محفوظ لهذا الطالب.", "No phone number is saved for this student.")}</Text>
              </View>
              <View style={styles.phoneFieldRow}>
                <Text style={[styles.phoneLabel, { color: colors.foreground, writingDirection: direction }]}>{t("المدة المقدرة بالدقائق", "Estimated minutes")}</Text>
                <TextInput
                  value={String(minutes)}
                  onChangeText={(value) => setMinutes(Math.min(60, Math.max(1, Number(value.replace(/[^0-9]/g, "")) || 1)))}
                  keyboardType="number-pad"
                  style={[styles.phoneMinutesInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                />
              </View>
              <View style={[styles.phoneCostRow, { borderColor: colors.border }]}>
                <Text style={[styles.phoneModalBody, { color: colors.mutedForeground }]}>{t("التكلفة المحجوزة", "Reserved cost")}</Text>
                <Text style={[styles.phoneBalanceValue, { color: insufficient ? colors.destructive : colors.foreground }]}>{requiredCost.toFixed(2)} ريال</Text>
              </View>
              {insufficient ? <Text style={[styles.phoneError, { color: colors.destructive, writingDirection: direction }]}>{t("الرصيد غير كافٍ لهذه المدة.", "Your balance is not enough for this duration.")}</Text> : null}
              <View style={styles.phoneModalActions}>
                <Pressable onPress={onClose} disabled={calling} style={[styles.phoneModalSecondary, { borderColor: colors.border }]}><Text style={[styles.phoneModalSecondaryText, { color: colors.foreground }]}>{t("إلغاء", "Cancel")}</Text></Pressable>
                <Pressable onPress={() => void handleCall()} disabled={calling || !phone.trim() || insufficient} style={[styles.phoneModalPrimary, { backgroundColor: calling || !phone.trim() || insufficient ? colors.muted : colors.primary }]}>
                  {calling ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Icon name="phone" size={16} color={colors.primaryForeground} />}
                  <Text style={[styles.phoneModalPrimaryText, { color: colors.primaryForeground }]}>{t("تأكيد الاتصال", "Confirm call")}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ConversationView({
  participant,
  messages,
  bookingId,
  userId,
  onBack,
  onReload,
  onInstantSession,
  instantSessionBusy,
  canStartInstantSession,
  onInternalCall,
  callBusy,
  canCall,
}: {
  participant: Participant;
  messages: Row[];
  bookingId: string | null;
  userId: string;
  onBack: () => void;
  onReload: () => Promise<void>;
  onInstantSession: () => void;
  instantSessionBusy: boolean;
  canStartInstantSession: boolean;
  onInternalCall: () => void;
  callBusy: "internal" | "phone" | null;
  canCall: boolean;
}) {
  const colors = useColors();
  const { t, direction, locale } = useAppPreferences();
  const isRTL = direction === "rtl";
  const listRef = useRef<FlatList<Row>>(null);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const webRecorderRef = useRef<MediaRecorder | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const webChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 40);
    return () => clearTimeout(timer);
  }, [messages.length]);

  useEffect(() => {
    if (!supabase || !participant.bookingIds.length) return;
    void (async () => {
      const incomingMessageIds = messages
        .filter((message) => String(message.sender_id) !== userId)
        .map((message) => String(message.id));
      await markChatMessagesRead(userId, incomingMessageIds);
    })();
  }, [messages, participant.id, userId]);

  const insertMessage = async (payload: { content: string; kind?: "text" | "file" | "voice"; asset?: { url: string; name: string; type: string; path?: string } }) => {
    if (!supabase || !bookingId) return;
    const result = await supabase.from("chat_messages").insert({
      booking_id: bookingId,
      sender_id: userId,
      content: payload.content || attachmentLabel(payload.asset?.type, payload.asset?.name) || "مرفق",
      ...(payload.asset ? { file_url: payload.asset.url, file_name: payload.asset.name, file_type: payload.asset.type } : {}),
    }).select().single();
    if (result.error) throw result.error;
    await customFetch<{ delivered: boolean }>("/api/push/messages", {
      method: "POST",
      body: JSON.stringify({
        bookingId,
        recipientId: participant.participantId,
        kind: payload.kind ?? "text",
      }),
    }).catch(() => undefined);
    await onReload();
  };

  const send = async () => {
    if (!draft.trim() || busy || !bookingId) return;
    setBusy(true);
    try {
      await insertMessage({ content: draft.trim(), kind: "text" });
      setDraft("");
    } catch {
      Alert.alert(t("تعذر إرسال الرسالة", "Could not send message"), t("تحقق من الاتصال وحاول مرة أخرى.", "Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  const uploadAndSend = async (asset: UploadAsset) => {
    if (busy || !bookingId) return;
    setBusy(true);
    setMenuOpen(false);
    try {
      const uploaded = await uploadToChat(asset, bookingId);
      try {
        await insertMessage({
          content: "",
          kind: uploaded.type.startsWith("audio/") ? "voice" : "file",
          asset: uploaded,
        });
      } catch (error) {
        // Do not leave inaccessible orphaned objects when the database insert
        // is rejected by RLS or a schema mismatch.
        await supabase?.storage.from("chat-files").remove([uploaded.path]).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : error instanceof Error ? error.message : "";
      Alert.alert(t("تعذر رفع المرفق", "Could not upload attachment"), message || t("تحقق من الاتصال ونوع الملف.", "Check your connection and file type."));
    } finally {
      setBusy(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      await uploadAndSend(toUploadAsset({
        uri: result.assets[0].uri,
        name: result.assets[0].fileName,
        mimeType: result.assets[0].mimeType,
        size: result.assets[0].fileSize,
        file: result.assets[0].file,
      }));
    }
  };

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (!result.canceled && result.assets[0]) {
      await uploadAndSend(toUploadAsset({
        uri: result.assets[0].uri,
        name: result.assets[0].name,
        mimeType: result.assets[0].mimeType || "application/pdf",
        size: result.assets[0].size,
        file: result.assets[0].file,
      }));
    }
  };

  const toggleMenu = () => setMenuOpen((open) => !open);

  const record = async () => {
    if (Platform.OS === "web") {
      if (recording) {
        webRecorderRef.current?.stop();
        return;
      }
      if (busy || !bookingId) return;
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        Alert.alert(t("التسجيل غير مدعوم", "Recording is not supported"), t("لا يدعم هذا المتصفح تسجيل الرسائل الصوتية.", "This browser does not support voice recording."));
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : MediaRecorder.isTypeSupported("audio/mp4")
              ? "audio/mp4"
              : "";
        const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        webStreamRef.current = stream;
        webChunksRef.current = [];
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) webChunksRef.current.push(event.data);
        };
        mediaRecorder.onstop = () => {
          const blobType = webChunksRef.current[0]?.type || mediaRecorder.mimeType || mimeType || "audio/webm";
          const blob = new Blob(webChunksRef.current, { type: blobType });
          stream.getTracks().forEach((track) => track.stop());
          webStreamRef.current = null;
          webRecorderRef.current = null;
          webChunksRef.current = [];
          setRecording(false);
          if (blob.size < 200) {
        Alert.alert(t("التسجيل قصير جداً", "Recording is too short"), t("سجّل رسالة أطول ثم حاول مرة أخرى.", "Record a longer message and try again."));
            return;
          }
          const extension = blobType.includes("mp4") ? "m4a" : "webm";
          const name = `voice-${Date.now()}.${extension}`;
          const uri = URL.createObjectURL(blob);
          const file = typeof File === "undefined" ? undefined : new File([blob], name, { type: blobType });
          void uploadAndSend({ uri, name, mimeType: blobType, size: blob.size, file }).finally(() => URL.revokeObjectURL(uri));
        };
        mediaRecorder.start(250);
        webRecorderRef.current = mediaRecorder;
        setMenuOpen(false);
        setRecording(true);
      } catch {
        webStreamRef.current?.getTracks().forEach((track) => track.stop());
        webStreamRef.current = null;
        Alert.alert(t("تعذر بدء التسجيل", "Could not start recording"), t("اسمح للمتصفح باستخدام الميكروفون ثم حاول مرة أخرى.", "Allow microphone access and try again."));
      }
      return;
    }

    if (recording) {
      setBusy(true);
      try {
        await recorder.stop();
        setRecording(false);
        if (recorder.uri) {
          await uploadAndSend({ uri: recorder.uri, name: `voice-${Date.now()}.m4a`, mimeType: "audio/m4a" });
        }
      } catch {
        Alert.alert(t("تعذر حفظ التسجيل", "Could not save recording"), t("حاول تسجيل الرسالة مرة أخرى.", "Record the message again."));
        setRecording(false);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (busy || !bookingId) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t("إذن الميكروفون مطلوب", "Microphone permission required"), t("اسمح للتطبيق باستخدام الميكروفون لإرسال رسالة صوتية.", "Allow microphone access to send a voice message."));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setMenuOpen(false);
      setRecording(true);
    } catch {
      Alert.alert(t("تعذر بدء التسجيل", "Could not start recording"), t("تحقق من إذن الميكروفون ثم حاول مرة أخرى.", "Check microphone permission and try again."));
    }
  };

  return (
    <Screen scroll={false} contentStyle={styles.conversationScreen}>
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardRoot} keyboardVerticalOffset={0}>
        <Header onBack={onBack} eyebrow={t("محادثة آمنة داخل المنصة", "Secure platform chat")} title={participant.name} avatarText={participant.avatar} onAvatar={() => router.push("/profile")} />
        <View style={[styles.conversationMeta, { backgroundColor: colors.tealSoft, borderColor: colors.border }]}>
          <View style={[styles.onlineDot, { backgroundColor: colors.teal }]} />
          <Text style={[styles.conversationMetaText, { color: colors.teal, writingDirection: direction }]} numberOfLines={2}>
            {participant.roleLabel === "معلم" ? t("معلم", "Teacher") : t("طالب", "Student")} · {participant.subject || t("مادة غير محددة", "Subject unavailable")} · {dateLabel(participant.scheduledAt, locale)} · {bookingStatusLabel(participant.bookingStatus, participant.sessionStatus, t)}
          </Text>
        </View>
        {canCall ? (
          <View style={styles.callActions}>
            <Pressable
              testID="conversation-internal-call"
              disabled={Boolean(callBusy)}
              onPress={onInternalCall}
              style={({ pressed }) => [styles.callAction, { backgroundColor: colors.tealSoft, borderColor: colors.teal }, pressed && styles.pressed]}
            >
              {callBusy === "internal" ? <ActivityIndicator size="small" color={colors.teal} /> : <Icon name="phone" size={16} color={colors.teal} />}
              <Text style={[styles.callActionText, { color: colors.teal }]}>{callBusy === "internal" ? t("جارٍ الاتصال…", "Calling…") : t("اتصال داخلي", "Internal call")}</Text>
            </Pressable>
            <Pressable
              testID="conversation-phone-call"
              disabled={Boolean(callBusy)}
              onPress={() => setPhoneModalOpen(true)}
              style={({ pressed }) => [styles.callAction, { backgroundColor: colors.navySoft, borderColor: colors.primary }, pressed && styles.pressed]}
            >
              {callBusy === "phone" ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="phone-call" size={16} color={colors.primary} />}
              <Text style={[styles.callActionText, { color: colors.primary }]}>{callBusy === "phone" ? t("جارٍ الطلب…", "Requesting…") : t("اتصال هاتفي", "Phone call")}</Text>
            </Pressable>
          </View>
        ) : null}
        {canStartInstantSession ? (
          <Pressable
            testID="start-instant-session"
            disabled={instantSessionBusy}
            onPress={onInstantSession}
            style={({ pressed }) => [styles.instantSessionButton, { backgroundColor: colors.tealSoft, borderColor: colors.teal }, pressed && styles.pressed]}
          >
            {instantSessionBusy ? <ActivityIndicator size="small" color={colors.teal} /> : <Icon name="video" size={16} color={colors.teal} />}
            <Text style={[styles.instantSessionButtonText, { color: colors.teal }]}>{instantSessionBusy ? t("جارٍ التحقق…", "Checking…") : t("بدء جلسة فورية", "Start instant session")}</Text>
          </Pressable>
        ) : null}
        <FlatList
          ref={listRef}
          style={styles.messageListFrame}
          data={messages}
          keyExtractor={(item, index) => String(item.id || `${item.created_at}-${index}`)}
          renderItem={({ item }) => {
            const outgoing = String(item.sender_id) === userId;
            return (
              <View style={[styles.messageRow, { alignItems: outgoing ? "flex-end" : "flex-start" }]}>
                <View style={[styles.messageBubble, { backgroundColor: outgoing ? colors.primary : colors.card, borderColor: outgoing ? colors.primary : colors.border }]}>
                  <Text style={[styles.messageSender, { color: outgoing ? colors.tint : colors.teal }]}>
                    {outgoing ? t("أنت", "You") : participant.name}
                  </Text>
                  <MessageAttachment message={item} outgoing={outgoing} />
                  {text(item, "content") && !attachmentLabel(item.file_type, item.file_name) ? <Text style={[styles.messageText, { color: outgoing ? colors.primaryForeground : colors.foreground }]}>{text(item, "content")}</Text> : null}
                  <Text style={[styles.messageDate, { color: outgoing ? colors.tint : colors.mutedForeground }]}>{dateLabel(item.created_at, locale)}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyConversation}>
              <View style={[styles.emptyConversationIcon, { backgroundColor: colors.tealSoft }]}><Icon name="message-circle" size={24} color={colors.teal} /></View>
              <Text style={[styles.emptyConversationTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("ابدأ المحادثة مع", "Start a conversation with")} {participant.name}</Text>
              <Text style={[styles.emptyConversationBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("يمكنك إرسال نص أو صورة أو PDF أو رسالة صوتية.", "You can send text, images, PDFs, or voice messages.")}</Text>
            </View>
          }
          contentContainerStyle={[styles.messageList, messages.length === 0 && styles.messageListEmpty]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
        <Composer
          draft={draft}
          onChange={setDraft}
          onSend={() => void send()}
          onPickImage={() => { if (menuOpen) void pickImage(); else toggleMenu(); }}
          onPickPdf={() => void pickPdf()}
          onRecord={() => void record()}
          menuOpen={menuOpen}
          recording={recording}
          busy={busy}
          disabled={!bookingId}
        />
        <PhoneCallModal
          visible={phoneModalOpen}
          participant={participant}
          teacherId={userId}
          bookingId={bookingId}
          onClose={() => setPhoneModalOpen(false)}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

export default function MessagesScreen() {
  const colors = useColors();
  const { t, direction, formatNumber } = useAppPreferences();
  const isRTL = direction === "rtl";
  const { user } = useAuth();
  const { role } = useAjyal();
  const { startOutgoingCall } = useInternalCall();
  const params = useLocalSearchParams<{ booking?: string; student?: string; participant?: string }>();
  const [bookings, setBookings] = useState<Row[]>([]);
  const [messages, setMessages] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [instantSessionBusy, setInstantSessionBusy] = useState(false);
  const [callBusy, setCallBusy] = useState<"internal" | "phone" | null>(null);
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [messageFilter, setMessageFilter] = useState<"all" | "unread" | "active">("all");
  const loadRequestRef = useRef(0);

  const load = useCallback(async (options: { showLoading?: boolean } = {}) => {
    const requestId = ++loadRequestRef.current;
    const showLoading = options.showLoading ?? true;
    if (!supabase || !user) {
      setBookings([]);
      setMessages([]);
      setProfiles([]);
      setLoading(false);
      setError(false);
      return;
    }
    const client = supabase;
    if (showLoading) setLoading(true);
    setError(false);
    try {
      // Render the conversation list as soon as bookings arrive. The old
      // implementation waited for every message and every profile before
      // rendering anything, so one slow PostgREST request made the whole page
      // look stuck.
      const bookingTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("MESSAGES_BOOKINGS_TIMEOUT")), 8_000);
      });
      const bookingResult = await Promise.race([
        client
          .from("bookings")
          .select("id, student_id, teacher_id, subject_id, status, session_status, scheduled_at, created_at")
          .or(`student_id.eq.${user.id},teacher_id.eq.${user.id}`)
          .order("scheduled_at", { ascending: false }),
        bookingTimeout,
      ]);
      if (bookingResult.error) throw bookingResult.error;
      const bookingRows = (bookingResult.data ?? []) as Row[];
      if (requestId !== loadRequestRef.current) return;
      setBookings(bookingRows);
      if (showLoading) setLoading(false);

      const ids = bookingRows.map((row) => String(row.id));
      const participantIds = [
        ...new Set(
          bookingRows.map((row) =>
            String(row.student_id) === user.id ? String(row.teacher_id) : String(row.student_id),
          ),
        ),
      ];
      const enrichment = await Promise.allSettled([
        Promise.all(
          batches(ids).map((bookingIdBatch) =>
            client
              .from("chat_messages")
              .select("id,booking_id,sender_id,content,file_url,file_name,file_type,created_at")
              .in("booking_id", bookingIdBatch)
              .order("created_at", { ascending: true }),
          ),
        ),
        Promise.all(
          batches(participantIds).map((participantIdBatch) =>
            client.from("profiles").select("*").in("user_id", participantIdBatch),
          ),
        ),
      ]);
      if (requestId !== loadRequestRef.current) return;

      const messagesResult = enrichment[0];
      if (messagesResult.status === "fulfilled") {
        const messageError = messagesResult.value.find((result) => result.error)?.error;
        if (messageError) console.warn("[messages] message history failed:", messageError.message);
        else setMessages(messagesResult.value.flatMap((result) => result.data ?? []) as Row[]);
      } else {
        console.warn("[messages] message history failed:", messagesResult.reason);
      }

      const profilesResult = enrichment[1];
      if (profilesResult.status === "fulfilled") {
        const profileError = profilesResult.value.find((result) => result.error)?.error;
        if (profileError) console.warn("[messages] profile lookup failed:", profileError.message);
        else setProfiles(profilesResult.value.flatMap((result) => result.data ?? []) as Row[]);
      } else {
        console.warn("[messages] profile lookup failed:", profilesResult.reason);
      }
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) return;
      console.warn(
        "[messages] load failed:",
        loadError instanceof Error ? loadError.message : loadError,
      );
      setError(true);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (!user?.id) {
      setReadMessageIds(new Set());
      return undefined;
    }
    let mounted = true;
    const refreshReadState = async () => {
      const next = await getReadChatMessageIds(user.id);
      if (mounted) setReadMessageIds(next);
    };
    void refreshReadState();
    const unsubscribe = subscribeToChatReadState((changedUserId) => {
      if (changedUserId === user.id) void refreshReadState();
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [user?.id]);

  useEffect(() => {
    const client = supabase;
    if (!client || !user || !bookings.length) return;
    const bookingIds = new Set(bookings.map((booking) => String(booking.id)));
    const bookingIdList = [...bookingIds];
    const channel = client
      .channel(`mobile-chat-${user.id}-${bookingIdList.join(",")}-${Date.now()}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "chat_messages",
        filter: `booking_id=in.(${bookingIdList.join(",")})`,
      }, () => {
        void load({ showLoading: false });
      })
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [user?.id, bookings.map((booking) => String(booking.id)).join(","), load]);

  useEffect(() => {
    const requestedParticipant = typeof params.participant === "string" ? params.participant : typeof params.student === "string" ? params.student : null;
    if (requestedParticipant) {
      const matching = participants.find((item) => item.participantId === requestedParticipant);
      if (matching) setSelectedId(matching.id);
      return;
    }
    if (typeof params.booking === "string") {
      const booking = bookings.find((row) => String(row.id) === params.booking);
      if (booking && user) {
        const participantId = String(booking.student_id) === user.id ? String(booking.teacher_id) : String(booking.student_id);
        const matching = participants.find((item) => item.participantId === participantId);
        if (matching) setSelectedId(matching.id);
      }
    }
  }, [params.booking, params.participant, params.student, bookings, profiles, user?.id]);

  const participants = useMemo<Participant[]>(() => {
    if (!user) return [];
    const byId = new Map<string, Participant>();
    for (const booking of bookings) {
      const participantId = String(booking.student_id) === user.id ? String(booking.teacher_id) : String(booking.student_id);
      const profile = profiles.find((row) => String(row.user_id) === participantId);
      const name = text(profile, "full_name", "display_name", "name") || t("مستخدم أجيال المعرفة", "Ajyal Knowledge user");
      const bookingId = String(booking.id);
      const existing = byId.get(participantId);
      if (existing) {
        existing.bookingIds.push(bookingId);
        // Bookings are normally sorted newest first, but keep the selection
        // correct if the source order changes.
        if (new Date(text(booking, "scheduled_at", "created_at")).getTime() > new Date(existing.scheduledAt).getTime()) {
          existing.bookingId = bookingId;
          existing.subject = text(booking, "subject");
          existing.scheduledAt = text(booking, "scheduled_at", "created_at");
          existing.bookingStatus = text(booking, "status");
          existing.sessionStatus = text(booking, "session_status");
        }
      } else {
        byId.set(participantId, {
          id: participantId,
          participantId,
          name,
          roleLabel: String(booking.student_id) === user.id ? "معلم" : "طالب",
          avatar: initials(name),
          bookingId,
          subject: text(booking, "subject"),
          scheduledAt: text(booking, "scheduled_at", "created_at"),
          bookingStatus: text(booking, "status"),
          sessionStatus: text(booking, "session_status"),
          bookingIds: [bookingId],
          unreadCount: 0,
        });
      }
    }
    for (const message of messages) {
      const booking = bookings.find((row) => String(row.id) === String(message.booking_id));
      if (!booking) continue;
      const participantId = String(booking.student_id) === user.id ? String(booking.teacher_id) : String(booking.student_id);
      const item = byId.get(participantId);
      if (!item) continue;
      if (!item.latestMessage || new Date(message.created_at).getTime() > new Date(item.latestMessage.created_at).getTime()) item.latestMessage = message;
      if (isUnreadMessage(message, user.id, readMessageIds)) item.unreadCount += 1;
    }
    return [...byId.values()].sort((a, b) => new Date(b.latestMessage?.created_at || 0).getTime() - new Date(a.latestMessage?.created_at || 0).getTime());
  }, [bookings, messages, profiles, readMessageIds, user]);

  const selected = participants.find((item) => item.id === selectedId) || null;
  const selectedMessages = selected
    ? messages
      .filter((message) => selected.bookingIds.includes(String(message.booking_id)))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : [];
  const selectedBookingId = selected?.bookingId || null;
  const visibleParticipants = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return participants.filter((item) => {
      const searchable = [
        item.name,
        item.subject,
        item.roleLabel,
        lastMessagePreview(item.latestMessage),
        item.bookingId,
      ].join(" ").toLocaleLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      const matchesFilter = messageFilter === "all"
        || (messageFilter === "unread" && item.unreadCount > 0)
        || (messageFilter === "active" && isActiveParticipant(item));
      return matchesSearch && matchesFilter;
    });
  }, [messageFilter, participants, searchQuery]);

  const startSelectedInstantSession = async () => {
    if (!selected || !user || role !== "student" || instantSessionBusy) return;
    setInstantSessionBusy(true);
    try {
      await createInstantSession({
        userId: user.id,
        participantId: selected.participantId,
        participantName: selected.name,
      });
      Alert.alert("تم إرسال طلب الجلسة", "تم إرسال الطلب للطرف الآخر. ستظهر الجلسة بعد القبول.");
      await load();
    } catch (error: unknown) {
      Alert.alert("تعذر بدء الجلسة الفورية", error instanceof Error ? error.message : "تحقق من الرصيد والاتصال ثم حاول مرة أخرى.");
    } finally {
      setInstantSessionBusy(false);
    }
  };

  const startSelectedInternalCall = async () => {
    if (!selected || role !== "teacher" || callBusy) return;
    setCallBusy("internal");
    try {
      await startOutgoingCall(selected.participantId, selectedBookingId || undefined);
      Alert.alert("تم بدء الاتصال الداخلي", `يرن الآن عند ${selected.name}.`);
    } catch (error) {
      Alert.alert("تعذر بدء الاتصال الداخلي", error instanceof Error ? error.message : "تحقق من اتصال الطالب ثم حاول مرة أخرى.");
    } finally {
      setCallBusy(null);
    }
  };

  if (selected && user) {
    return (
        <ConversationView
          key={selected.id}
        participant={selected}
        messages={selectedMessages}
        bookingId={selectedBookingId}
        userId={user.id}
        onBack={() => setSelectedId(null)}
        onReload={() => load({ showLoading: false })}
        onInstantSession={() => void startSelectedInstantSession()}
        instantSessionBusy={instantSessionBusy}
        canStartInstantSession={role === "student"}
        onInternalCall={() => void startSelectedInternalCall()}
        callBusy={callBusy}
        canCall={role === "teacher" && selected.roleLabel === "طالب"}
      />
    );
  }

  return (
    <Screen>
      <Header title={t("الرسائل", "Messages")} eyebrow={t("تواصل داخل أجيال المعرفة", "Connect inside Ajyal Knowledge")} avatarText={user?.email?.slice(0, 1)} onAvatar={() => router.push("/profile")} />
      <DepthCard wrapperStyle={styles.introCardWrap} surfaceStyle={styles.introCard} surfaceColor={colors.navySoft} depthColor={colors.tealSoft} borderColor={colors.border}>
        <View style={[styles.introIcon, { backgroundColor: colors.primary }]}><Icon name="message-circle" size={23} color={colors.primaryForeground} /></View>
        <View style={[styles.introCopy, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
          <Text style={[styles.introEyebrow, { color: colors.teal, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("مساحة تعلم متصلة", "Connected learning space")}</Text>
          <Text style={[styles.introTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("رسائلك التعليمية", "Your learning messages")}</Text>
          <Text style={[styles.introBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("تواصل مع المعلمين والطلاب بالنصوص والمرفقات والصوت والمكالمات والجلسات.", "Connect through text, attachments, voice notes, calls, and sessions.")}</Text>
          <View style={[styles.featureRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {[
              { icon: "message-square" as const, label: t("نص", "Text") },
              { icon: "paperclip" as const, label: t("مرفقات", "Files") },
              { icon: "phone" as const, label: t("مكالمات", "Calls") },
            ].map((feature) => (
              <View key={feature.label} style={[styles.featurePill, { backgroundColor: colors.card }]}>
                <Icon name={feature.icon} size={12} color={colors.teal} />
                <Text style={[styles.featurePillText, { color: colors.foreground, writingDirection: direction }]}>{feature.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </DepthCard>

      <DepthCard wrapperStyle={styles.searchPanelWrap} surfaceStyle={styles.searchPanel} surfaceColor={colors.card} depthColor={colors.navySoft} borderColor={colors.border}>
        <View style={[styles.searchInputWrap, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Icon name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("ابحث باسم المعلم أو الطالب أو الرسالة", "Search by participant or message")}
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            clearButtonMode="never"
            style={[styles.searchInput, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8} style={styles.searchClear}>
              <Icon name="x" size={15} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <View style={[styles.filterRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={[styles.filterLabel, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Icon name="sliders" size={14} color={colors.teal} />
            <Text style={[styles.filterLabelText, { color: colors.mutedForeground, writingDirection: direction }]}>{t("عرض", "View")}</Text>
          </View>
          {[
            { value: "all" as const, label: t("الكل", "All") },
            { value: "unread" as const, label: t("غير مقروءة", "Unread") },
            { value: "active" as const, label: t("نشطة", "Active") },
          ].map((filter) => {
            const selectedFilter = messageFilter === filter.value;
            return (
              <Pressable
                key={filter.value}
                onPress={() => setMessageFilter(filter.value)}
                style={({ pressed }) => [
                  styles.filterChip,
                  { backgroundColor: selectedFilter ? colors.tealSoft : colors.background, borderColor: selectedFilter ? colors.teal : colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.filterChipText, { color: selectedFilter ? colors.teal : colors.mutedForeground, writingDirection: direction }]}>{filter.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </DepthCard>

      <View style={[styles.sectionHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={[styles.sectionTitleWrap, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={[styles.sectionMark, { backgroundColor: colors.accent }]} />
          <Text style={[styles.sectionTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("المحادثات", "Conversations")}</Text>
        </View>
        <View style={[styles.sectionActions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={[styles.sectionCount, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "left" : "right" }]}>{formatNumber(visibleParticipants.length)} / {formatNumber(participants.length)}</Text>
          <Pressable onPress={() => void load({ showLoading: false })} disabled={loading} hitSlop={8} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}>
            <Icon name="refresh-cw" size={15} color={loading ? colors.muted : colors.teal} />
          </Pressable>
        </View>
      </View>
      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.teal} /><Text style={[styles.loadingText, { color: colors.mutedForeground, writingDirection: direction }]}>{t("جارٍ تحميل محادثاتك…", "Loading your conversations…")}</Text></View>
        : error ? <EmptyState icon="alert-circle" title={t("تعذر تحميل الرسائل", "Could not load messages")} body={t("تحقق من الاتصال ثم حاول مرة أخرى.", "Check your connection and try again.")} action={t("إعادة المحاولة", "Try again")} onAction={() => void load()} />
          : !participants.length ? <EmptyState icon="message-circle" title={t("لا توجد محادثات بعد", "No conversations yet")} body={t("ستظهر هنا محادثة كل معلم أو طالب عند وجود حجز مرتبط.", "A conversation will appear here when there is a related booking.")} />
            : !visibleParticipants.length ? <EmptyState icon="search" title={t("لا توجد نتائج مطابقة", "No matching conversations")} body={t("جرّب تغيير كلمة البحث أو الفلتر.", "Try a different search term or filter.")} action={t("مسح البحث", "Clear search")} onAction={() => { setSearchQuery(""); setMessageFilter("all"); }} />
              : visibleParticipants.map((participant) => <ParticipantRow key={participant.id} item={participant} onPress={() => setSelectedId(participant.id)} />)}
      <DepthCard wrapperStyle={styles.safetyNoteWrap} surfaceStyle={styles.safetyNote} surfaceColor={colors.card} depthColor={colors.tealSoft} borderColor={colors.border}>
        <Icon name="shield" size={15} color={colors.teal} />
        <Text style={[styles.safetyText, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? "right" : "left" }]}>{t("محادثاتك محمية داخل المنصة، ويمكنك مشاركة النصوص والصور وملفات PDF والرسائل الصوتية بأمان.", "Your conversations stay protected in the platform. Share text, images, PDFs, and voice notes safely.")}</Text>
      </DepthCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  conversationScreen: { flex: 1, paddingHorizontal: 14 },
  keyboardRoot: { flex: 1, minHeight: 0 },
  depthCardWrap: { position: "relative", overflow: "visible" },
  depthCardBackplate: { position: "absolute", left: 2, right: -2, top: 4, bottom: -4, borderWidth: 1, borderRadius: 18, opacity: 0.95 },
  depthCardSurface: { position: "relative", borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  introCardWrap: { marginBottom: 14 },
  introCard: { minHeight: 154, padding: 16, flexDirection: "row", alignItems: "center" },
  introIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", marginLeft: 13, shadowColor: "#173E8C", shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  introCopy: { flex: 1, alignItems: "flex-end" },
  introEyebrow: { width: "100%", textAlign: "right", writingDirection: "rtl", fontSize: 10, fontFamily: "Inter_500Medium" },
  introTitle: { width: "100%", textAlign: "right", writingDirection: "rtl", fontSize: 19, lineHeight: 26, fontFamily: "Inter_700Bold", marginTop: 5 },
  introBody: { width: "100%", textAlign: "right", writingDirection: "rtl", fontSize: 10, lineHeight: 16, fontFamily: "Inter_400Regular", marginTop: 5 },
  featureRow: { alignItems: "center", gap: 5, marginTop: 10 },
  featurePill: { minHeight: 25, borderRadius: 10, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  featurePillText: { fontSize: 9, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  searchPanelWrap: { marginBottom: 16 },
  searchPanel: { padding: 12 },
  searchInputWrap: { minHeight: 46, borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, alignItems: "center", gap: 8 },
  searchInput: { flex: 1, minHeight: 42, paddingHorizontal: 2, paddingVertical: 7, fontSize: 11, fontFamily: "Inter_400Regular" },
  searchClear: { width: 25, height: 30, alignItems: "center", justifyContent: "center" },
  filterRow: { alignItems: "center", gap: 6, marginTop: 9 },
  filterLabel: { alignItems: "center", gap: 4, marginRight: 2 },
  filterLabelText: { fontSize: 10, fontFamily: "Inter_500Medium", writingDirection: "rtl" },
  filterChip: { minHeight: 30, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  filterChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitleWrap: { alignItems: "center", gap: 7 },
  sectionMark: { width: 5, height: 19, borderRadius: 3 },
  sectionTitle: { flex: 1, minWidth: 0, fontSize: 16, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  sectionCount: { fontSize: 11, fontFamily: "Inter_400Regular", writingDirection: "rtl" },
  sectionActions: { alignItems: "center", gap: 8 },
  refreshButton: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  participantRowWrap: { marginBottom: 10 },
  participantRow: { minHeight: 166, borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: "row", alignItems: "center", position: "relative", overflow: "hidden" },
  participantTint: { position: "absolute", width: 150, height: 150, borderRadius: 75, top: -74, right: -52, opacity: 0.55 },
  participantAccent: { position: "absolute", width: 4, borderRadius: 2, top: 14, bottom: 14, right: 0, opacity: 0.85 },
  participantAvatar: { width: 51, height: 51, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", marginLeft: 11, position: "relative", shadowColor: "#173E8C", shadowOpacity: 0.12, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  avatarInitials: { fontSize: 15, fontFamily: "Inter_700Bold" },
  avatarUnreadDot: { position: "absolute", width: 10, height: 10, borderRadius: 5, right: -2, top: -2, borderWidth: 2 },
  participantCopy: { flex: 1, minWidth: 0 },
  participantName: { flex: 1, textAlign: "right", writingDirection: "rtl", fontSize: 14, fontFamily: "Inter_700Bold" },
  bookingSchedule: { width: "100%", marginTop: 7, gap: 3 },
  bookingScheduleLine: { width: "100%", fontSize: 10, lineHeight: 16, fontFamily: "Inter_500Medium" },
  participantBottom: { width: "100%", flexDirection: "row", alignItems: "center", marginTop: 7, gap: 7 },
  participantPreview: { flex: 1, textAlign: "right", writingDirection: "rtl", fontSize: 11 },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  unreadText: { color: "#FFFFFF", fontSize: 9, fontFamily: "Inter_700Bold" },
  participantMetaLine: { width: "100%", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7, paddingTop: 6, borderTopWidth: 1 },
  roleText: { flex: 1, textAlign: "right", writingDirection: "rtl", fontSize: 9, fontFamily: "Inter_500Medium" },
  statusPill: { minHeight: 20, borderRadius: 8, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 94 },
  statusPillDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontSize: 8, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  rowArrow: { width: 24, alignItems: "flex-start" },
  loading: { minHeight: 180, justifyContent: "center", alignItems: "center", gap: 10 },
  loadingText: { fontSize: 11, fontFamily: "Inter_400Regular", writingDirection: "rtl" },
  safetyNoteWrap: { marginTop: 8 },
  safetyNote: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7, padding: 12 },
  safetyText: { flex: 1, textAlign: "right", writingDirection: "rtl", fontSize: 10, lineHeight: 16, fontFamily: "Inter_400Regular" },
  conversationMeta: { minHeight: 34, borderWidth: 1, borderRadius: 12, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 7, paddingHorizontal: 11, marginBottom: 9 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  conversationMetaText: { fontSize: 10, fontFamily: "Inter_500Medium", writingDirection: "rtl" },
  callActions: { flexDirection: "row", gap: 7, marginBottom: 9 },
  callAction: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingHorizontal: 7 },
  callActionText: { fontSize: 10, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  phoneModalBackdrop: { flex: 1, justifyContent: "flex-end" },
  phoneModalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 30 },
  phoneModalHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  phoneModalIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  phoneModalCopy: { flex: 1, alignItems: "flex-end" },
  phoneModalTitle: { fontSize: 16, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  phoneModalSubtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3, writingDirection: "rtl" },
  phoneModalClose: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  phoneModalLoading: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: 10 },
  phoneModalResult: { minHeight: 240, alignItems: "center", justifyContent: "center", gap: 10 },
  phoneModalBody: { fontSize: 11, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl" },
  phoneBalanceRow: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  phoneBalanceValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  phoneInfoBox: { minHeight: 54, borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  phoneFieldRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  phoneLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  phoneMinutesInput: { width: 78, height: 42, borderWidth: 1, borderRadius: 12, textAlign: "center", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  phoneCostRow: { minHeight: 45, borderTopWidth: 1, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  phoneError: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "right", marginBottom: 10 },
  phoneModalActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  phoneModalPrimary: { flex: 1, minHeight: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  phoneModalPrimaryText: { fontSize: 12, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  phoneModalSecondary: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  phoneModalSecondaryText: { fontSize: 12, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  instantSessionButton: { minHeight: 42, borderWidth: 1, borderRadius: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, marginBottom: 9 },
  instantSessionButtonText: { fontSize: 11, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  messageListFrame: { flex: 1, minHeight: 0 },
  messageList: { flexGrow: 1, justifyContent: "flex-end", paddingTop: 10, paddingBottom: 12, paddingHorizontal: 2 },
  messageListEmpty: { justifyContent: "center" },
  messageRow: { width: "100%", marginBottom: 9 },
  messageBubble: { maxWidth: "86%", minWidth: 78, borderWidth: 1, borderRadius: 17, padding: 11 },
  messageSender: { textAlign: "right", writingDirection: "rtl", fontSize: 9, lineHeight: 13, fontFamily: "Inter_700Bold", marginBottom: 4 },
  messageText: { textAlign: "right", writingDirection: "rtl", fontSize: 12, lineHeight: 20, fontFamily: "Inter_500Medium" },
  messageDate: { textAlign: "right", writingDirection: "rtl", fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 6 },
  emptyConversation: { alignItems: "center", justifyContent: "center", paddingVertical: 46 },
  emptyConversationIcon: { width: 56, height: 56, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  emptyConversationTitle: { textAlign: "center", writingDirection: "rtl", fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 12 },
  emptyConversationBody: { textAlign: "center", writingDirection: "rtl", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 6 },
  composerWrap: { paddingTop: 8, paddingBottom: 4 },
  composer: { minHeight: 57, borderWidth: 1, borderRadius: 18, padding: 7, flexDirection: "row", alignItems: "flex-end", gap: 4, width: "100%" },
  composerInput: { flex: 1, minHeight: 39, maxHeight: 90, paddingHorizontal: 8, paddingVertical: 8, fontSize: 12, fontFamily: "Inter_400Regular", writingDirection: "rtl" },
  composerAction: { width: 35, height: 39, alignItems: "center", justifyContent: "center" },
  sendButton: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  attachmentMenu: { borderWidth: 1, borderRadius: 16, padding: 6, marginBottom: 7, flexDirection: "row", gap: 4 },
  menuItem: { flex: 1, minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 4 },
  menuIcon: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  menuText: { fontSize: 9, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  recordingBar: { minHeight: 57, borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  recordDot: { width: 9, height: 9, borderRadius: 5 },
  recordingText: { flex: 1, textAlign: "right", writingDirection: "rtl", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  stopRecord: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  imageAttachment: { maxWidth: 230 },
  attachmentImage: { width: 210, height: 145, borderRadius: 12 },
  attachmentName: { textAlign: "right", writingDirection: "rtl", fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 5 },
  fileAttachment: { minWidth: 190, maxWidth: 240, borderRadius: 12, padding: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  fileIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  fileCopy: { flex: 1, minWidth: 0 },
  fileTitle: { textAlign: "right", writingDirection: "rtl", fontSize: 10, fontFamily: "Inter_700Bold" },
  fileSubtitle: { textAlign: "right", writingDirection: "rtl", fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 3 },
  voiceMessage: { minWidth: 205, flexDirection: "row", alignItems: "center", gap: 9 },
  voicePlay: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  voiceTrack: { flex: 1 },
  voiceBars: { height: 28, flexDirection: "row", alignItems: "center", gap: 3 },
  voiceBar: { width: 4, borderRadius: 3 },
  voiceTime: { textAlign: "right", fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 },
  pressed: { opacity: 0.72 },
});