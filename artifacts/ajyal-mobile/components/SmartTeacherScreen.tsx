import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { fetch as expoFetch } from "expo/fetch";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from "expo-audio";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase, supabasePublishableKey, supabaseUrl } from "@/lib/supabase";
import { useAjyal } from "@/hooks/useAjyal";
import { useAiTutorAccess } from "@/hooks/useAiTutorAccess";
import { EmptyState, Header, Icon, Screen } from "@/components/AjyalUI";

type Tab = "text" | "voice";
type Message = { role: "user" | "assistant"; content: string; audio?: string | null };
type HomeworkStep = { title?: string; explanation?: string };
type Solution = {
  subject?: string;
  question?: string;
  steps?: HomeworkStep[];
  rule?: string;
  final_answer?: string;
  tip?: string;
  error?: string;
};
type TranscriptionResponse = { text?: unknown; error?: unknown; message?: unknown };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (item.role === "user" || item.role === "assistant") && typeof item.content === "string";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "");
    if (message) return message;
  }
  return fallback;
}

async function edgeFunctionErrorMessage(
  result: { data: unknown; error: unknown },
  fallback: string,
): Promise<string> {
  const data = result.data;
  if (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string") {
    return String((data as { error: string }).error);
  }

  const error = result.error as {
    message?: unknown;
    context?: {
      status?: number;
      clone?: () => { text: () => Promise<string> };
    };
  } | null;
  const response = error?.context;
  if (response?.clone) {
    try {
      const body = await response.clone().text();
      if (body) {
        try {
          const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
          if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error;
          if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message;
        } catch {
          if (body.trim()) return body.trim();
        }
      }
    } catch {
      // Keep the SDK's message when the response body is unavailable.
    }
  }
  if (response?.status === 401 || response?.status === 403) {
    return "انتهت صلاحية الدخول أو لا يملك الحساب صلاحية استخدام مساعد الواجب.";
  }
  if (response?.status === 413) {
    return "الصورة كبيرة على خدمة الحل. اختر صورة أصغر أو أوضح.";
  }
  if (response?.status === 429) {
    return "الخدمة مشغولة حالياً. انتظر قليلاً ثم حاول مرة أخرى.";
  }
  if (response?.status && response.status >= 500) {
    return "تعذر تشغيل مساعد الواجب من الخادم حالياً. حاول مرة أخرى بعد قليل.";
  }
  return errorMessage(result.error, fallback);
}

function audioUploadDescriptor(uri: string) {
  const extension = uri.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]?.toLowerCase() || "m4a";
  const mimeType = extension === "webm"
    ? "audio/webm"
    : extension === "3gp"
      ? "audio/3gpp"
      : extension === "wav"
        ? "audio/wav"
        : "audio/mp4";
  return {
    name: `ai-tutor-question.${extension}`,
    type: mimeType,
  };
}

export default function SmartTeacherScreen({ mode = "full" }: { mode?: "full" | "homework" } = {}) {
  const colors = useColors();
  const { user } = useAuth();
  const { role, roleResolved } = useAjyal();
  const insets = useSafeAreaInsets();
  const isHomeworkMode = mode === "homework";
  // The visual homework assistant is part of the same paid AI tutor entitlement.
  // Keep this gate shared so the UI cannot accidentally expose a second policy.
  const requiresAiTutorPlan = true;
  const { loading: accessLoading, hasAccess: hasAiTutorAccess, error: accessError, retry: retryAccess } = useAiTutorAccess(requiresAiTutorPlan);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer(null);

  const [tab, setTab] = useState<Tab>("text");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [extraQuestion, setExtraQuestion] = useState("");
  const [solution, setSolution] = useState<Solution | null>(null);
  const [homeworkLoading, setHomeworkLoading] = useState(false);
  const [homeworkError, setHomeworkError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!supabase || !user || !roleResolved || role !== "student" || !requiresAiTutorPlan || accessLoading || !hasAiTutorAccess) {
      return () => { active = false; };
    }

    void Promise.all([
      supabase
        .from("ai_conversations")
        .select("id, messages")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("site_settings")
        .select("value")
        .eq("key", "ai_tutor_enabled")
        .maybeSingle(),
    ]).then(([conversationResult, flagResult]) => {
      if (!active) return;
      if (conversationResult.error) {
        setError("تعذر تحميل محادثتك السابقة من المنصة.");
      } else if (conversationResult.data) {
        setConversationId(String(conversationResult.data.id));
        const savedMessages = Array.isArray(conversationResult.data.messages)
          ? conversationResult.data.messages.filter(isMessage)
          : [];
        setMessages(savedMessages);
      }
      if (!flagResult.error && flagResult.data?.value !== undefined) {
        setAiEnabled(String(flagResult.data.value).toLowerCase() !== "false");
      }
    }).catch(() => {
      if (active) setError("تعذر تحميل مساعد التعلم من المنصة.");
    });

    return () => { active = false; };
  }, [accessLoading, hasAiTutorAccess, role, roleResolved, user?.id]);

  const saveConversation = async (nextMessages: Message[], currentId: string | null) => {
    if (!supabase || !user) return currentId;
    const subject = nextMessages.find((message) => message.role === "user")?.content.slice(0, 80) || "محادثة المدرس المساعد";
    const payload = { messages: nextMessages, subject, updated_at: new Date().toISOString() };
    if (currentId) {
      const { error: updateError } = await supabase
        .from("ai_conversations")
        .update(payload)
        .eq("id", currentId)
        .eq("user_id", user.id);
      if (updateError) throw updateError;
      return currentId;
    }
    const { data, error: insertError } = await supabase
      .from("ai_conversations")
      .insert({ user_id: user.id, ...payload })
      .select("id")
      .single();
    if (insertError) throw insertError;
    return data?.id ? String(data.id) : null;
  };

  const playAudio = (base64: string | null | undefined) => {
    if (!base64) return;
    void setAudioModeAsync({ playsInSilentMode: true });
    player.replace(`data:audio/mpeg;base64,${base64}`);
    player.play();
  };

  const askTeacher = async (text: string, audioInput = false) => {
    if (!supabase || role !== "student" || !hasAiTutorAccess || !text.trim() || sending || !aiEnabled) return;
    const content = text.trim();
    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setDraft("");
    setError(null);
    setSending(true);
    try {
      const result = await supabase.functions.invoke("ai-tutor-chat", {
        body: {
          messages: nextMessages.map((message) => ({ role: message.role, content: message.content })),
          speak: true,
        },
      });
      const response = result.data as { text?: unknown; audio?: unknown; error?: unknown } | null;
      if (result.error || typeof response?.text !== "string" || !response.text.trim()) {
        throw new Error(await edgeFunctionErrorMessage(result, "تعذر الحصول على رد المدرس المساعد"));
      }
      const completedMessages = [
        ...nextMessages,
        { role: "assistant" as const, content: response.text, audio: typeof response.audio === "string" ? response.audio : null },
      ];
      setMessages(completedMessages);
      playAudio(typeof response.audio === "string" ? response.audio : null);
      const savedId = await saveConversation(completedMessages, conversationId);
      if (savedId && savedId !== conversationId) setConversationId(savedId);
    } catch (sendError) {
      setError(errorMessage(sendError, audioInput ? "تعذر معالجة السؤال الصوتي." : "تعذر الحصول على رد المدرس المساعد."));
    } finally {
      setSending(false);
    }
  };

  const transcribeAndAsk = async (uri: string) => {
    if (!supabase || role !== "student" || !hasAiTutorAccess) return;
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken || !supabasePublishableKey) {
        throw new Error("انتهت صلاحية الدخول. سجّل الدخول مرة أخرى.");
      }

      const formData = new FormData();
      const descriptor = audioUploadDescriptor(uri);
      // React Native's multipart adapter understands the URI descriptor.
      // Using expo-file-system File here breaks on the current native runtime
      // before the request is sent (`validatePath is not a function`).
      formData.append("audio", { uri, ...descriptor } as unknown as Blob);

      // Do not set Content-Type manually: expo/fetch adds the multipart boundary.
      // Passing { uri, name, type } to functions.invoke loses the file on native.
      const response = await expoFetch(`${supabaseUrl}/functions/v1/ai-support-transcribe`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: supabasePublishableKey,
        },
        body: formData,
      });
      const rawBody = await response.text();
      let data: TranscriptionResponse | null = null;
      try {
        data = rawBody ? JSON.parse(rawBody) as TranscriptionResponse : null;
      } catch {
        // Preserve the raw server response below when it is not JSON.
      }
      if (!response.ok || typeof data?.text !== "string" || !data.text.trim()) {
        const serverMessage = typeof data?.error === "string"
          ? data.error
          : typeof data?.message === "string"
            ? data.message
            : rawBody.trim();
        if (serverMessage) throw new Error(serverMessage);
        throw new Error(
          response.status === 401 || response.status === 403
            ? "انتهت صلاحية الدخول أو لا يملك الحساب صلاحية استخدام المساعد الصوتي."
            : response.status === 413
              ? "التسجيل الصوتي كبير على خدمة المساعد."
              : "تعذر فهم التسجيل الصوتي.",
        );
      }
      await askTeacher(data.text, true);
    } catch (recordError) {
      setError(errorMessage(recordError, "تعذر معالجة السؤال الصوتي."));
    }
  };

  const toggleRecording = async () => {
    if (role !== "student" || !hasAiTutorAccess) return;
    if (recording) {
      try {
        await recorder.stop();
        setRecording(false);
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (recorder.uri) await transcribeAndAsk(recorder.uri);
      } catch (recordError) {
        setRecording(false);
        setError(errorMessage(recordError, "تعذر حفظ التسجيل الصوتي."));
      }
      return;
    }
    if (sending || !aiEnabled) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("إذن الميكروفون مطلوب", "اسمح للتطبيق باستخدام الميكروفون لطرح سؤالك صوتياً.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setError(null);
      setRecording(true);
    } catch (recordError) {
      setError(errorMessage(recordError, "تعذر بدء التسجيل الصوتي."));
    }
  };

  const readImage = async (asset: ImagePicker.ImagePickerAsset | undefined) => {
    if (!asset?.uri) return;
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      setHomeworkError("حجم الصورة كبير. الحد الأقصى 8MB.");
      return;
    }
    if (!asset.base64) {
      setHomeworkError("تعذر قراءة الصورة. اختر صورة أخرى.");
      return;
    }
    const mimeType = asset.mimeType || "image/jpeg";
    setImageUri(asset.uri);
    setImageBase64(`data:${mimeType};base64,${asset.base64}`);
    setSolution(null);
    setHomeworkError(null);
  };

  const pickImage = async (camera: boolean) => {
    setHomeworkError(null);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("إذن الكاميرا مطلوب", "اسمح للتطبيق باستخدام الكاميرا لتصوير الواجب.");
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("إذن الصور مطلوب", "اسمح للتطبيق بالوصول إلى الصور لاختيار الواجب.");
          return;
        }
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, base64: true });
      if (!result.canceled) await readImage(result.assets[0]);
    } catch (pickError) {
      setHomeworkError(errorMessage(pickError, "تعذر فتح الصور أو الكاميرا."));
    }
  };

  const solveHomework = async () => {
    if (!supabase || role !== "student" || (requiresAiTutorPlan && !hasAiTutorAccess) || !imageBase64 || homeworkLoading) return;
    setHomeworkLoading(true);
    setSolution(null);
    setHomeworkError(null);
    try {
      const result = await supabase.functions.invoke("solve-homework", {
        body: { imageBase64, extraQuestion },
      });
      const data = result.data as (Solution & { reason_code?: string }) | null;
      if (data?.reason_code && data.error) {
        setHomeworkError(data.error);
        return;
      }
      if (result.error) {
        throw new Error(await edgeFunctionErrorMessage(result, "تعذر حل الواجب. جرّب صورة أوضح."));
      }
      if (!data) throw new Error("تعذر تحليل الصورة.");
      setSolution(data);
    } catch (solveError) {
      setHomeworkError(errorMessage(solveError, "تعذر حل الواجب. جرّب صورة أوضح."));
    } finally {
      setHomeworkLoading(false);
    }
  };

  const resetHomework = () => {
    setImageUri(null);
    setImageBase64(null);
    setExtraQuestion("");
    setSolution(null);
    setHomeworkError(null);
  };

  const welcomeMessage = useMemo(
    () => messages.length === 0 && !sending,
    [messages.length, sending],
  );

  const avatarText = user?.email?.slice(0, 1).toUpperCase() || "؟";
  const isTextChat = !isHomeworkMode && tab === "text";

  if (!roleResolved || accessLoading) {
    return (
      <Screen>
        <Header onBack={() => router.back()} eyebrow="خدمة المنصة التعليمية" title="مساعد التعلّم الذكي" avatarText={avatarText} onAvatar={() => router.push("/profile")} />
        <View style={styles.accessState}>
          <ActivityIndicator color={colors.teal} />
          <Text style={[styles.accessStateText, { color: colors.mutedForeground }]}>جارٍ التحقق من أهلية الباقة…</Text>
        </View>
      </Screen>
    );
  }

  if (role !== "student") {
    return (
      <Screen>
        <Header onBack={() => router.back()} eyebrow="خدمة المنصة التعليمية" title="مساعد التعلّم الذكي" avatarText={avatarText} onAvatar={() => router.push("/profile")} />
        <EmptyState icon="lock" title="المساعد متاح للطلاب فقط" body="لا تظهر أدوات مساعد التعلم في حساب المعلم." />
      </Screen>
    );
  }

  if (requiresAiTutorPlan && accessError) {
    return (
      <Screen>
        <Header onBack={() => router.back()} eyebrow="خدمة المنصة التعليمية" title="مساعد التعلّم الذكي" avatarText={avatarText} onAvatar={() => router.push("/profile")} />
        <EmptyState icon="alert-circle" title="تعذر التحقق من الباقة" body={accessError} action="إعادة المحاولة" onAction={retryAccess} />
      </Screen>
    );
  }

  if (requiresAiTutorPlan && !hasAiTutorAccess) {
    return (
      <Screen>
        <Header onBack={() => router.back()} eyebrow="خدمة المنصة التعليمية" title="مساعد التعلّم الذكي" avatarText={avatarText} onAvatar={() => router.push("/profile")} />
        <EmptyState icon="award" title="المساعد غير مشمول في باقتك" body="يتوفر مساعد التعلم الصوتي للطالب المشترك في باقة تتضمن ميزة المدرس الذكي وبها رصيد فعال." action="عرض الباقات" onAction={() => router.push("/subscriptions")} />
      </Screen>
    );
  }

  return (
    <Screen
      scroll={!isTextChat}
      contentStyle={isTextChat ? [styles.textScreenContent, { paddingBottom: Math.max(insets.bottom, 8) }] : undefined}
    >
      <Header
        onBack={() => router.back()}
        eyebrow={isHomeworkMode ? "أداة عملية للتعلّم" : "مساعدة فورية أثناء التعلم"}
        title={isHomeworkMode ? "مساعد الواجبات البصري" : "مساعد التعلّم الذكي"}
        avatarText={avatarText}
        onAvatar={() => router.push("/profile")}
      />

      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.navySoft }]}>
          <Icon name="zap" size={25} color={colors.primary} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={[styles.heroEyebrow, { color: colors.tint }]}>خدمة المنصة التعليمية</Text>
          <Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>{isHomeworkMode ? "حل واجبك بصورة واضحة" : "تعلّم بصوتك ونصك"}</Text>
          <Text style={[styles.heroBody, { color: colors.tint }]}>{isHomeworkMode ? "صوّر السؤال أو ارفعه، ثم احصل على خطوات الحل والقاعدة والنصيحة." : "اسأل مدرسك الذكي أو تحدث معه بالعربية بصوت طبيعي."}</Text>
        </View>
      </View>

      {!aiEnabled ? (
        <EmptyState icon="slash" title="المساعد غير متاح حالياً" body="سيعود مساعد التعلم عند تفعيله من إعدادات المنصة." />
      ) : (
        <>
          {!isHomeworkMode ? (
            <>
          <View style={[styles.tabs, { backgroundColor: colors.muted }]}>
            <Pressable
              testID="ai-tab-voice"
              onPress={() => setTab("voice")}
              style={[styles.tab, tab === "voice" && { backgroundColor: colors.card }]}
            >
              <Icon name="mic" size={15} color={tab === "voice" ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.tabText, { color: tab === "voice" ? colors.primary : colors.mutedForeground }]}>صوتي</Text>
            </Pressable>
            <Pressable
              testID="ai-tab-text"
              onPress={() => setTab("text")}
              style={[styles.tab, tab === "text" && { backgroundColor: colors.card }]}
            >
              <Icon name="message-circle" size={15} color={tab === "text" ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.tabText, { color: tab === "text" ? colors.primary : colors.mutedForeground }]}>نص + نطق</Text>
            </Pressable>
          </View>

          {tab === "text" ? (
            <KeyboardAvoidingView style={[styles.panel, isTextChat && styles.textPanel]} behavior="padding" keyboardVerticalOffset={0}>
              <View style={[styles.panelHeader, { borderColor: colors.border }]}>
                <View style={[styles.panelHeaderIcon, { backgroundColor: colors.navySoft }]}>
                  <Icon name="message-circle" size={18} color={colors.primary} />
                </View>
                <View style={styles.panelHeaderCopy}>
                  <Text style={[styles.panelTitle, { color: colors.foreground }]}>محادثة نصية مع المدرس المساعد</Text>
                  <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>سأشرح لك بالعربية وأنطق الإجابة بصوت طبيعي.</Text>
                </View>
              </View>

              <ScrollView
                style={styles.messageScroller}
                contentContainerStyle={styles.messageList}
                showsVerticalScrollIndicator={false}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
              >
                {welcomeMessage ? (
                  <View style={[styles.welcome, { backgroundColor: colors.muted }]}>
                    <Icon name="zap" size={27} color={colors.primary} />
                    <Text style={[styles.welcomeText, { color: colors.mutedForeground }]}>ابدأ بطرح سؤال… سأشرح لك بالعربية وأنطق الإجابة بصوت.</Text>
                  </View>
                ) : null}

                {messages.map((message, index) => (
                  <View
                    key={`${message.role}-${index}`}
                    style={[
                      styles.message,
                      {
                        alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                        backgroundColor: message.role === "user" ? colors.primary : colors.muted,
                      },
                    ]}
                  >
                    <Text style={[styles.messageRole, { color: message.role === "user" ? colors.tint : colors.teal }]}>
                      {message.role === "user" ? "أنت" : "المدرس المساعد AI"}
                    </Text>
                    <Text style={[styles.messageText, { color: message.role === "user" ? colors.primaryForeground : colors.foreground }]}>{message.content}</Text>
                    {message.role === "assistant" && message.audio ? (
                      <Pressable testID={`play-ai-audio-${index}`} onPress={() => playAudio(message.audio)} style={styles.audioButton}>
                        <Icon name="volume-2" size={14} color={colors.teal} />
                        <Text style={[styles.audioButtonText, { color: colors.teal }]}>تشغيل الصوت</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}

                {sending ? (
                  <View style={[styles.thinking, { backgroundColor: colors.muted }]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.thinkingText, { color: colors.mutedForeground }]}>يفكر…</Text>
                  </View>
                ) : null}
              </ScrollView>

              <View style={[styles.composerDock, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
                <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Pressable
                    testID="send-ai-question"
                    disabled={sending || !draft.trim()}
                    onPress={() => void askTeacher(draft)}
                    style={[styles.send, { backgroundColor: sending || !draft.trim() ? colors.muted : colors.primary }]}
                  >
                    <Icon name="send" size={16} color={sending || !draft.trim() ? colors.mutedForeground : colors.primaryForeground} />
                  </Pressable>
                  <TextInput
                    testID="ai-question-input"
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={sending ? "جارٍ التفكير…" : "اكتب سؤالك هنا…"}
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    textAlign="right"
                    style={[styles.input, { color: colors.foreground }]}
                  />
                </View>
              </View>
            </KeyboardAvoidingView>
          ) : (
            <View style={[styles.voicePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.voiceOrb, { backgroundColor: recording ? colors.teal : colors.muted }]}>
                {recording ? <View style={[styles.recordingDot, { backgroundColor: colors.destructive }]} /> : <Icon name="mic" size={43} color={colors.mutedForeground} />}
              </View>
              <Text style={[styles.voiceTitle, { color: colors.foreground }]}>
                {recording ? "أنا أستمع إليك…" : sending ? "جاري تجهيز الإجابة…" : "محادثة صوتية بالعربية"}
              </Text>
              <Text style={[styles.voiceBody, { color: colors.mutedForeground }]}>
                {recording ? "تحدث بوضوح ثم اضغط لإرسال سؤالك." : "اضغط على الميكروفون وتحدث مع مدرسك الذكي بصوتك."}
              </Text>
              <Pressable
                testID="toggle-ai-recording"
                onPress={() => void toggleRecording()}
                disabled={sending && !recording}
                style={[styles.voiceButton, { backgroundColor: recording ? colors.destructive : colors.primary }]}
              >
                {sending && !recording ? <ActivityIndicator color={colors.primaryForeground} /> : <Icon name={recording ? "mic-off" : "mic"} size={18} color={colors.primaryForeground} />}
                <Text style={[styles.voiceButtonText, { color: colors.primaryForeground }]}>{recording ? "إنهاء وإرسال السؤال" : "ابدأ المحادثة بالعربية"}</Text>
              </Pressable>
              <Text style={[styles.voiceHint, { color: colors.mutedForeground }]}>جرّب: «اشرح لي هذه المسألة» أو «لخّص لي هذا الدرس»</Text>
            </View>
          )}
            </>
          ) : null}

          {isHomeworkMode ? <View style={[styles.homeworkSection, { borderTopColor: colors.border }]}>
            <View style={styles.sectionTitleLine}>
              <View style={[styles.sectionMark, { backgroundColor: colors.accentForeground }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>مساعد الواجبات البصري</Text>
            </View>

            {!imageUri ? (
              <View style={styles.pickGrid}>
                <Pressable testID="homework-camera" onPress={() => void pickImage(true)} style={[styles.pickButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Icon name="camera" size={26} color={colors.primary} />
                  <Text style={[styles.pickTitle, { color: colors.foreground }]}>التقط صورة</Text>
                  <Text style={[styles.pickSubtitle, { color: colors.mutedForeground }]}>من الكاميرا مباشرة</Text>
                </Pressable>
                <Pressable testID="homework-library" onPress={() => void pickImage(false)} style={[styles.pickButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Icon name="upload" size={26} color={colors.primary} />
                  <Text style={[styles.pickTitle, { color: colors.foreground }]}>ارفع صورة</Text>
                  <Text style={[styles.pickSubtitle, { color: colors.mutedForeground }]}>من معرض الجهاز</Text>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.imageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.imageFrame, { backgroundColor: colors.foreground }]}>
                  <Image source={{ uri: imageUri }} style={styles.homeworkImage} resizeMode="contain" />
                  <Pressable testID="remove-homework-image" onPress={resetHomework} style={[styles.removeImage, { backgroundColor: colors.destructive }]}>
                    <Icon name="x" size={16} color={colors.destructiveForeground} />
                  </Pressable>
                </View>
                <TextInput
                  testID="homework-note-input"
                  value={extraQuestion}
                  onChangeText={setExtraQuestion}
                  placeholder="(اختياري) أضف ملاحظة أو سؤالاً عن الصورة…"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  style={[styles.homeworkInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                />
                <View style={styles.homeworkActions}>
                  <Pressable testID="solve-homework" onPress={() => void solveHomework()} disabled={homeworkLoading} style={[styles.solveButton, { backgroundColor: colors.primary }]}>
                    {homeworkLoading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Icon name="zap" size={16} color={colors.primaryForeground} />}
                    <Text style={[styles.solveButtonText, { color: colors.primaryForeground }]}>{homeworkLoading ? "جاري الحل…" : "احصل على الحل"}</Text>
                  </Pressable>
                  {solution ? <Pressable testID="reset-homework" onPress={resetHomework} disabled={homeworkLoading} style={[styles.retryButton, { borderColor: colors.border }]}><Icon name="refresh-cw" size={16} color={colors.primary} /></Pressable> : null}
                </View>
              </View>
            )}

            {homeworkError ? <Text style={[styles.error, { color: colors.destructive }]}>{homeworkError}</Text> : null}
            {solution?.error ? <Text style={[styles.error, { color: colors.destructive }]}>{solution.error}</Text> : null}
            {solution && !solution.error ? (
              <View style={styles.solution}>
                {solution.subject ? <View style={[styles.subjectPill, { backgroundColor: colors.navySoft }]}><Icon name="book-open" size={14} color={colors.primary} /><Text style={[styles.subjectText, { color: colors.primary }]}>{solution.subject}</Text></View> : null}
                {solution.question ? <View style={[styles.solutionCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.solutionLabel, { color: colors.mutedForeground }]}>السؤال:</Text><Text style={[styles.solutionQuestion, { color: colors.foreground }]}>{solution.question}</Text></View> : null}
                {solution.steps?.length ? (
                  <View style={[styles.solutionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.solutionHeading, { color: colors.foreground }]}>خطوات الحل</Text>
                    {solution.steps.map((step, index) => (
                      <View key={`${step.title}-${index}`} style={styles.stepRow}>
                        <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}><Text style={[styles.stepNumberText, { color: colors.primaryForeground }]}>{index + 1}</Text></View>
                        <View style={styles.stepCopy}><Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title || `الخطوة ${index + 1}`}</Text><Text style={[styles.stepExplanation, { color: colors.mutedForeground }]}>{step.explanation}</Text></View>
                      </View>
                    ))}
                  </View>
                ) : null}
                {solution.rule ? <View style={[styles.callout, { backgroundColor: colors.tealSoft, borderColor: colors.teal }]}><Text style={[styles.calloutLabel, { color: colors.teal }]}>القاعدة المستخدمة</Text><Text style={[styles.calloutText, { color: colors.foreground }]}>{solution.rule}</Text></View> : null}
                {solution.final_answer ? <View style={[styles.callout, { backgroundColor: colors.navySoft, borderColor: colors.primary }]}><Text style={[styles.calloutLabel, { color: colors.primary }]}>الإجابة النهائية</Text><Text style={[styles.finalAnswer, { color: colors.foreground }]}>{solution.final_answer}</Text></View> : null}
                {solution.tip ? <View style={[styles.callout, { backgroundColor: colors.goldSoft, borderColor: colors.accentForeground }]}><Text style={[styles.calloutLabel, { color: colors.accentForeground }]}>نصيحة للمذاكرة</Text><Text style={[styles.calloutText, { color: colors.foreground }]}>{solution.tip}</Text></View> : null}
              </View>
            ) : null}
          </View> : null}
        </>
      )}

      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 148, borderRadius: 23, padding: 17, flexDirection: "row", alignItems: "center", marginBottom: 15 },
  textScreenContent: { paddingHorizontal: 18 },
  heroIcon: { width: 58, height: 58, borderRadius: 19, alignItems: "center", justifyContent: "center", marginLeft: 4 },
  heroCopy: { flex: 1, alignItems: "flex-end", marginLeft: 14 },
  heroEyebrow: { width: "100%", fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl" },
  heroTitle: { width: "100%", fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl", marginTop: 6 },
  heroBody: { width: "100%", fontSize: 11, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 6 },
  homeworkCard: { borderRadius: 19, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", marginBottom: 14 },
  homeworkIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", marginLeft: 11 },
  homeworkCopy: { flex: 1, alignItems: "flex-end" },
  homeworkTitle: { width: "100%", fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  homeworkBody: { width: "100%", fontSize: 11, lineHeight: 17, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 4 },
  tabs: { borderRadius: 14, padding: 4, flexDirection: "row", marginBottom: 12 },
  tab: { flex: 1, minHeight: 42, borderRadius: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  panel: { marginBottom: 14 },
  textPanel: { flex: 1, minHeight: 0, marginBottom: 0 },
  panelHeader: { borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: "row", alignItems: "center", marginBottom: 10 },
  panelHeaderIcon: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center", marginLeft: 9 },
  panelHeaderCopy: { flex: 1, alignItems: "flex-end" },
  panelTitle: { width: "100%", fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  panelSubtitle: { width: "100%", fontSize: 10, lineHeight: 16, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 3 },
  welcome: { borderRadius: 17, minHeight: 130, alignItems: "center", justifyContent: "center", padding: 22, marginBottom: 10 },
  welcomeText: { maxWidth: "90%", fontSize: 12, lineHeight: 20, fontFamily: "Inter_500Medium", textAlign: "center", writingDirection: "rtl", marginTop: 10 },
  message: { maxWidth: "88%", borderRadius: 17, padding: 13, marginBottom: 9 },
  messageRole: { fontSize: 10, fontFamily: "Inter_600SemiBold", textAlign: "right", writingDirection: "rtl" },
  messageText: { fontSize: 12, lineHeight: 20, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 6 },
  audioButton: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-end", marginTop: 9 },
  audioButtonText: { fontSize: 10, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  thinking: { alignSelf: "flex-start", borderRadius: 15, paddingHorizontal: 13, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 9 },
  thinkingText: { fontSize: 11, fontFamily: "Inter_500Medium", writingDirection: "rtl" },
  messageScroller: { flex: 1, minHeight: 0 },
  messageList: { flexGrow: 1, justifyContent: "flex-end", paddingBottom: 10 },
  composerDock: { borderTopWidth: 1, paddingTop: 8, paddingHorizontal: 0 },
  composer: { minHeight: 56, borderRadius: 17, borderWidth: 1, padding: 7, flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: { flex: 1, minHeight: 38, maxHeight: 100, paddingHorizontal: 9, paddingVertical: 8, fontSize: 12, fontFamily: "Inter_400Regular", writingDirection: "rtl" },
  send: { width: 39, height: 39, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  voicePanel: { borderRadius: 20, borderWidth: 1, alignItems: "center", paddingHorizontal: 17, paddingVertical: 28, marginBottom: 14 },
  voiceOrb: { width: 128, height: 128, borderRadius: 64, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  recordingDot: { width: 30, height: 30, borderRadius: 15 },
  voiceTitle: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center", writingDirection: "rtl" },
  voiceBody: { fontSize: 11, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "center", writingDirection: "rtl", marginTop: 6, marginBottom: 18 },
  voiceButton: { minHeight: 46, borderRadius: 24, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  voiceButtonText: { fontSize: 12, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  voiceHint: { fontSize: 10, lineHeight: 16, fontFamily: "Inter_400Regular", textAlign: "center", writingDirection: "rtl", marginTop: 18 },
  homeworkSection: { borderTopWidth: 1, paddingTop: 17, marginTop: 2, paddingBottom: 12 },
  sectionTitleLine: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginBottom: 11 },
  sectionMark: { width: 7, height: 22, borderRadius: 4, marginRight: 7 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  pickGrid: { flexDirection: "row", gap: 9 },
  pickButton: { flex: 1, minHeight: 126, borderRadius: 17, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", padding: 10 },
  pickTitle: { fontSize: 12, fontFamily: "Inter_700Bold", writingDirection: "rtl", marginTop: 7 },
  pickSubtitle: { fontSize: 10, fontFamily: "Inter_400Regular", writingDirection: "rtl", marginTop: 3 },
  imageCard: { borderRadius: 18, borderWidth: 1, padding: 10 },
  imageFrame: { height: 220, borderRadius: 13, overflow: "hidden", position: "relative" },
  homeworkImage: { width: "100%", height: "100%" },
  removeImage: { position: "absolute", top: 8, left: 8, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  homeworkInput: { minHeight: 58, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 9, fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 9 },
  homeworkActions: { flexDirection: "row", gap: 8, marginTop: 9 },
  solveButton: { flex: 1, minHeight: 43, borderRadius: 22, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  solveButtonText: { fontSize: 12, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  retryButton: { width: 43, minHeight: 43, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  solution: { marginTop: 12, gap: 9 },
  subjectPill: { alignSelf: "flex-end", borderRadius: 15, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 5 },
  subjectText: { fontSize: 11, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  solutionCard: { borderRadius: 16, borderWidth: 1, padding: 13 },
  accessState: { minHeight: 190, borderRadius: 18, alignItems: "center", justifyContent: "center", gap: 10 },
  accessStateText: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center", writingDirection: "rtl" },
  solutionLabel: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginBottom: 4 },
  solutionQuestion: { fontSize: 12, lineHeight: 20, fontFamily: "Inter_600SemiBold", textAlign: "right", writingDirection: "rtl" },
  solutionHeading: { fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl", marginBottom: 12 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginLeft: 9 },
  stepNumberText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  stepCopy: { flex: 1, alignItems: "flex-end" },
  stepTitle: { width: "100%", fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  stepExplanation: { width: "100%", fontSize: 11, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 3 },
  callout: { borderRadius: 16, borderWidth: 1, padding: 13 },
  calloutLabel: { fontSize: 10, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl", marginBottom: 5 },
  calloutText: { fontSize: 11, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl" },
  finalAnswer: { fontSize: 15, lineHeight: 23, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  error: { fontSize: 11, lineHeight: 18, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl", marginVertical: 8 },
});