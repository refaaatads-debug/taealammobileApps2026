import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, Icon, Screen } from "@/components/AjyalUI";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";

type Row = Record<string, unknown>;
type SupportTab = "support" | "messages" | "ai";
type AiMessage = { role: "user" | "assistant"; content: string };

const QUICK_REPLIES = [
  "متى موعد حصتي القادمة؟",
  "كم الدقائق المتبقية في باقتي؟",
  "ما هي واجباتي الحالية؟",
  "أريد التحدث مع الدعم البشري",
];

function text(row: Row, ...keys: string[]): string {
  for (const key of keys) {
    if (typeof row[key] === "string" && row[key]) return row[key] as string;
  }
  return "";
}

function dateLabel(row: Row): string {
  const raw = text(row, "created_at", "updated_at");
  if (!raw) return "—";
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? raw
    : new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "");
    if (message) return message;
  }
  return fallback;
}

export default function SupportCenterScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { t, direction } = useAppPreferences();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<SupportTab>("support");
  const [tickets, setTickets] = useState<Row[]>([]);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Row[]>([]);
  const [ticketSubject, setTicketSubject] = useState("");
  const [draft, setDraft] = useState("");
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiDraft, setAiDraft] = useState("");
  const [aiSending, setAiSending] = useState(false);
  const [aiTicketId, setAiTicketId] = useState<string | null>(null);
  const realtimeSequence = useRef(0);

  const currentTicket = useMemo(
    () => tickets.find((ticket) => String(ticket.id) === ticketId),
    [ticketId, tickets],
  );

  const loadTickets = async (preferredId?: string | null) => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const result = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (result.error) {
      setError(errorMessage(result.error, t("تعذر تحميل تذاكر الدعم.", "Unable to load support tickets.")));
      setLoading(false);
      return;
    }
    const rows = (result.data ?? []) as Row[];
    setTickets(rows);
    setTicketId((current) => {
      const wanted = preferredId ?? current;
      return wanted && rows.some((row) => String(row.id) === wanted)
        ? wanted
        : rows[0]
          ? String(rows[0].id)
          : null;
    });
    setLoading(false);
  };

  const loadMessages = async (id: string) => {
    if (!supabase) return;
    const result = await supabase.from("support_messages").select("*").eq("ticket_id", id).order("created_at", { ascending: true });
    if (result.error) {
      setError(errorMessage(result.error, t("تعذر تحميل رسائل التذكرة.", "Unable to load ticket messages.")));
      return;
    }
    setMessages((result.data ?? []) as Row[]);
  };

  useEffect(() => {
    void loadTickets();
  }, [user?.id]);

  useEffect(() => {
    if (!ticketId || !supabase) {
      setMessages([]);
      return;
    }
    void loadMessages(ticketId);
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    try {
      // React Strict Mode can mount this effect twice before the previous
      // channel has finished leaving. A unique topic prevents Supabase from
      // reusing a subscribed channel and throwing synchronously.
      const topic = `mobile-support-${ticketId}-${realtimeSequence.current++}`;
      channel = supabase.channel(topic);
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, (payload) => {
        const incoming = payload.new as Row;
        setMessages((current) => current.some((item) => String(item.id) === String(incoming.id)) ? current : [...current, incoming]);
      });
      void channel.subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Realtime is an enhancement; the initial query and explicit sends
          // remain usable when the project has not enabled this table yet.
          console.warn(`[support] Realtime unavailable: ${status}`);
        }
      });
    } catch (caught) {
      console.warn("[support] Realtime subscription skipped", caught);
    }
    return () => {
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [ticketId]);

  const createTicket = async (subject = ticketSubject) => {
    if (!supabase || !user || !subject.trim() || sending) return null;
    setSending(true);
    setError("");
    const result = await supabase.from("support_tickets").insert({ user_id: user.id, subject: subject.trim() }).select().single();
    if (result.error || !result.data) {
      const message = errorMessage(result.error, t("تعذر إنشاء طلب الدعم.", "Unable to create the support request."));
      setError(message);
      Alert.alert(t("تعذر إنشاء الطلب", "Unable to create request"), message);
      setSending(false);
      return null;
    }
    const id = String(result.data.id);
    setTickets((current) => [result.data as Row, ...current]);
    setTicketId(id);
    setTicketSubject("");
    setShowNewTicket(false);
    setTab("support");
    setMessages([]);
    setSending(false);
    return id;
  };

  const sendSupportMessage = async () => {
    if (!supabase || !user || !ticketId || !draft.trim() || sending) return;
    setSending(true);
    const content = draft.trim();
    const result = await supabase.from("support_messages").insert({
      ticket_id: ticketId,
      sender_id: user.id,
      content,
      is_admin: false,
    }).select().single();
    if (result.error) {
      const message = errorMessage(result.error, t("تعذر إرسال الرد.", "Unable to send the reply."));
      setError(message);
      Alert.alert(t("تعذر الإرسال", "Unable to send"), message);
    } else {
      setMessages((current) => current.some((item) => String(item.id) === String(result.data?.id)) ? current : [...current, result.data as Row]);
      setDraft("");
    }
    setSending(false);
  };

  const sendAiMessage = async (preset?: string) => {
    if (!supabase || !user || aiSending) return;
    const content = (preset ?? aiDraft).trim();
    if (!content) return;
    const history = [...aiMessages, { role: "user" as const, content }];
    setAiMessages(history);
    setAiDraft("");
    setAiSending(true);
    try {
      const result = await supabase.functions.invoke("ai-support", { body: { messages: history } });
      if (result.error) throw result.error;
      const reply = typeof result.data?.content === "string"
        ? result.data.content
        : t("سأراجع طلبك وأساعدك بما أستطيع. إذا احتجت فريق الدعم البشري سأحوّلك إليه.", "I’ll review your request and help as much as I can. I can hand you to human support if needed.");
      const ticket = result.data?.ticket as { id?: string } | null;
      if (ticket?.id) setAiTicketId(ticket.id);
      setAiMessages((current) => [...current, { role: "assistant", content: reply }]);
    } catch (caught) {
      setAiMessages((current) => [...current, { role: "assistant", content: errorMessage(caught, t("حدث خطأ في الاتصال بالمساعد. حاول مرة أخرى.", "The assistant could not connect. Try again.")) }]);
    } finally {
      setAiSending(false);
    }
  };

  const handoffToSupport = async () => {
    if (aiTicketId) {
      setTicketId(aiTicketId);
      await loadTickets(aiTicketId);
      setTab("support");
      return;
    }
    const firstQuestion = aiMessages.find((message) => message.role === "user")?.content ?? t("استفسار من المساعد الذكي", "Question from AI assistant");
    const id = await createTicket(`محادثة المساعد: ${firstQuestion.slice(0, 55)}`);
    if (!id || !supabase || !user) return;
    const conversation = aiMessages.map((message) => `${message.role === "user" ? "المستخدم" : "المساعد"}: ${message.content}`).join("\n\n");
    await supabase.from("support_messages").insert({ ticket_id: id, sender_id: user.id, content: `سجل المحادثة مع المساعد الذكي:\n\n${conversation}`, is_admin: false });
    await loadMessages(id);
  };

  const tabs: Array<{ id: SupportTab; label: string; icon: "headphones" }> = [
    { id: "support", label: t("الدعم الفني", "Technical support"), icon: "headphones" },
  ];

  return (
    <Screen scroll={false} contentStyle={styles.screenContent}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
        <LinearGradient colors={[colors.teal, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.centerHeader}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerIcon}><Icon name="x" size={17} color={colors.primaryForeground} /></Pressable>
          <View style={styles.centerHeaderCopy}>
            <Text style={[styles.centerHeaderTitle, { color: colors.primaryForeground, writingDirection: direction }]}>{t("مركز تواصل أجيال المعرفة", "Ajyal Knowledge contact center")}</Text>
            <Text style={[styles.centerHeaderBody, { color: colors.tint, writingDirection: direction }]}>{t("الدعم والإرشاد والمساعدة في مكان واحد", "Support, guidance, and help in one place")}</Text>
          </View>
          <View style={[styles.headerBubble, { backgroundColor: colors.navySoft }]}>
            <Icon name="message-circle" size={21} color={colors.primaryForeground} />
            <View style={[styles.onlineDot, { backgroundColor: colors.teal }]} />
          </View>
        </LinearGradient>

        <View style={[styles.tabs, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <Pressable key={item.id} testID={`support-tab-${item.id}`} onPress={() => setTab(item.id)} style={[styles.tab, active && { backgroundColor: colors.muted }]}>
                <Icon name={item.icon} size={14} color={active ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.tabText, { color: active ? colors.primary : colors.mutedForeground, writingDirection: direction }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "support" ? (
          <View style={styles.flex}>
            <View style={styles.sectionBar}>
              <View style={styles.sectionBarCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, writingDirection: direction }]}>{ticketId ? text(currentTicket ?? {}, "subject") || t("طلب الدعم", "Support request") : t("الدعم الفني", "Technical support")}</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground, writingDirection: direction }]}>{ticketId ? t("محادثة مع فريق الدعم", "Conversation with support") : t("لديك طلبات وتواصل مع فريق الدعم", "Your requests and contact with support")}</Text>
              </View>
              <Pressable testID="new-support-ticket" onPress={() => setShowNewTicket((current) => !current)} style={[styles.newTicketButton, { backgroundColor: colors.primary }]}>
                <Icon name="plus" size={14} color={colors.primaryForeground} />
                <Text style={[styles.newTicketText, { color: colors.primaryForeground }]}>{t("تذكرة جديدة", "New ticket")}</Text>
              </Pressable>
            </View>
            {showNewTicket ? (
              <View style={[styles.newTicketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TextInput value={ticketSubject} onChangeText={setTicketSubject} placeholder={t("اكتب عنوان المشكلة أو الاستفسار", "Describe the issue or question")} placeholderTextColor={colors.mutedForeground} textAlign="right" style={[styles.subjectInput, { color: colors.foreground, borderColor: colors.border }]} />
                <Pressable disabled={!ticketSubject.trim() || sending} onPress={() => void createTicket()} style={[styles.fullButton, { backgroundColor: ticketSubject.trim() ? colors.teal : colors.muted }]}>
                  {sending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.fullButtonText, { color: ticketSubject.trim() ? colors.primaryForeground : colors.mutedForeground }]}>{t("إرسال الطلب", "Submit request")}</Text>}
                </Pressable>
              </View>
            ) : null}
            {loading ? <View style={styles.center}><ActivityIndicator color={colors.teal} /></View> : error ? <EmptyState icon="alert-circle" title={t("تعذر تحميل الدعم", "Unable to load support")} body={error} action={t("إعادة المحاولة", "Try again")} onAction={() => void loadTickets()} /> : ticketId ? (
              <View style={styles.flex}>
                <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent} showsVerticalScrollIndicator={false} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
                  {messages.length ? messages.map((message) => {
                    const mine = message.is_admin !== true;
                    return <View key={String(message.id)} style={[styles.messageBubble, { alignSelf: mine ? "flex-end" : "flex-start", backgroundColor: mine ? colors.primary : colors.card, borderColor: colors.border }]}><Text style={[styles.messageText, { color: mine ? colors.primaryForeground : colors.foreground, writingDirection: direction }]}>{text(message, "content")}</Text><Text style={[styles.messageDate, { color: mine ? colors.tint : colors.mutedForeground }]}>{dateLabel(message)}</Text></View>;
                  }) : <EmptyState icon="headphones" title={t("ابدأ التواصل مع الدعم", "Start a support conversation")} body={t("اكتب رسالتك وسيتمكن فريق الدعم من متابعتها.", "Write a message and the support team will follow up.")} />}
                </ScrollView>
                <View style={[styles.composerDock, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
                  <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Pressable disabled={sending || !draft.trim()} onPress={() => void sendSupportMessage()} style={[styles.sendButton, { backgroundColor: draft.trim() ? colors.primary : colors.muted }]}><Icon name="send" size={16} color={draft.trim() ? colors.primaryForeground : colors.mutedForeground} /></Pressable>
                    <TextInput value={draft} onChangeText={setDraft} placeholder={t("اكتب رسالتك لفريق الدعم…", "Write to support…")} placeholderTextColor={colors.mutedForeground} multiline textAlign="right" style={[styles.composerInput, { color: colors.foreground }]} />
                  </View>
                </View>
              </View>
            ) : tickets.length ? (
              <ScrollView style={styles.messages} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
                {tickets.map((ticket) => <Pressable key={String(ticket.id)} onPress={() => setTicketId(String(ticket.id))} style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.ticketIcon, { backgroundColor: colors.tealSoft }]}><Icon name="headphones" size={18} color={colors.teal} /></View><View style={styles.ticketCopy}><Text style={[styles.ticketTitle, { color: colors.foreground, writingDirection: direction }]}>{text(ticket, "subject") || t("طلب دعم", "Support request")}</Text><Text style={[styles.ticketMeta, { color: colors.mutedForeground, writingDirection: direction }]}>{dateLabel(ticket)} · {text(ticket, "status") || t("مفتوحة", "Open")}</Text></View><Icon name="chevron-left" size={16} color={colors.mutedForeground} /></Pressable>)}
              </ScrollView>
            ) : (
              <View style={styles.emptyWrap}><View style={[styles.emptySupportIcon, { backgroundColor: colors.navySoft }]}><Icon name="headphones" size={27} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.foreground, writingDirection: direction }]}>{t("لا توجد تذاكر", "No tickets yet")}</Text><Text style={[styles.emptyBody, { color: colors.mutedForeground, writingDirection: direction }]}>{t("أنشئ تذكرة جديدة وسيساعدك فريق الدعم داخل هذه النافذة.", "Create a ticket and the support team will help you here.")}</Text></View>
            )}
          </View>
        ) : tab === "messages" ? (
          <View style={styles.messagesLanding}>
            <View style={[styles.emptySupportIcon, { backgroundColor: colors.navySoft }]}><Icon name="message-square" size={27} color={colors.primary} /></View>
            <Text style={[styles.emptyTitle, { color: colors.foreground, writingDirection: direction }]}>{t("رسائلك التعليمية", "Your learning messages")}</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground, writingDirection: direction }]}>{t("افتح المحادثات المرتبطة بحجوزاتك وتواصل مع معلميك.", "Open booking conversations and contact your teachers.")}</Text>
            <Pressable onPress={() => router.push("/chat")} style={[styles.fullButton, { backgroundColor: colors.primary }]}><Text style={[styles.fullButtonText, { color: colors.primaryForeground }]}>{t("فتح المحادثات", "Open messages")}</Text><Icon name="arrow-left" size={15} color={colors.primaryForeground} /></Pressable>
          </View>
        ) : (
          <View style={styles.flex}>
            <ScrollView style={styles.aiMessages} contentContainerStyle={styles.aiContent} showsVerticalScrollIndicator={false} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
              <View style={styles.aiHeader}>
                <View style={[styles.aiAvatar, { backgroundColor: colors.navySoft }]}><Icon name="star" size={24} color={colors.primary} /><View style={[styles.aiOnline, { backgroundColor: colors.teal }]} /></View>
                <View style={styles.aiHeaderCopy}><Text style={[styles.aiTitle, { color: colors.foreground, writingDirection: direction }]}>{t("المساعد الذكي", "AI assistant")}</Text><Text style={[styles.aiSubtitle, { color: colors.mutedForeground, writingDirection: direction }]}>{t("متصل دائماً · يفهم بياناتك", "Always available · understands your account")}</Text></View>
              </View>
              {!aiMessages.length ? <View style={styles.aiWelcome}><View style={[styles.aiWelcomeIcon, { backgroundColor: colors.navySoft }]}><Icon name="star" size={27} color={colors.primary} /></View><Text style={[styles.aiWelcomeTitle, { color: colors.foreground, writingDirection: direction }]}>{t("مرحباً 👋", "Hello 👋")}</Text><Text style={[styles.aiWelcomeBody, { color: colors.mutedForeground, writingDirection: direction }]}>{t("أنا مساعدك الذكي. اسألني عن باقتك أو حصصك أو واجباتك، ويمكنني تحويلك لفريق الدعم البشري.", "I’m your AI assistant. Ask about your plan, sessions, or assignments, and I can hand you to human support.")}</Text></View> : null}
              {aiMessages.map((message, index) => <View key={`${message.role}-${index}`} style={[styles.aiBubble, { alignSelf: message.role === "user" ? "flex-end" : "flex-start", backgroundColor: message.role === "user" ? colors.primary : colors.card, borderColor: colors.border }]}><Text style={[styles.aiBubbleText, { color: message.role === "user" ? colors.primaryForeground : colors.foreground, writingDirection: direction }]}>{message.content}</Text></View>)}
              {aiTicketId ? <Pressable onPress={() => void handoffToSupport()} style={[styles.handoffButton, { backgroundColor: colors.tealSoft }]}><Icon name="headphones" size={15} color={colors.teal} /><Text style={[styles.handoffText, { color: colors.teal }]}>{t("فتح تذكرة الدعم", "Open support ticket")}</Text></Pressable> : null}
            </ScrollView>
            {!aiMessages.length ? <View style={styles.quickReplies}><Text style={[styles.quickLabel, { color: colors.mutedForeground, writingDirection: direction }]}>{t("اقتراحات سريعة:", "Quick suggestions:")}</Text><View style={styles.quickWrap}>{QUICK_REPLIES.map((reply) => <Pressable key={reply} onPress={() => void sendAiMessage(reply)} style={[styles.quickChip, { backgroundColor: colors.muted }]}><Text style={[styles.quickText, { color: colors.primary, writingDirection: direction }]}>{reply}</Text></Pressable>)}</View></View> : null}
             <View style={[styles.composerDock, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
               <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                 <Pressable testID="ai-send-button" disabled={aiSending || !aiDraft.trim()} onPress={() => void sendAiMessage()} style={[styles.sendButton, { backgroundColor: aiDraft.trim() ? colors.primary : colors.muted }]}>{aiSending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Icon name="send" size={16} color={aiDraft.trim() ? colors.primaryForeground : colors.mutedForeground} />}</Pressable>
                 <TextInput testID="ai-message-input" value={aiDraft} onChangeText={setAiDraft} placeholder={aiSending ? t("جاري التفكير…", "Thinking…") : t("اسأل المساعد الذكي…", "Ask the AI assistant…")} placeholderTextColor={colors.mutedForeground} multiline textAlign="right" style={[styles.composerInput, { color: colors.foreground }]} />
               </View>
             </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenContent: { paddingHorizontal: 10 },
  centerHeader: { minHeight: 68, borderTopLeftRadius: 23, borderTopRightRadius: 23, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: { width: 25, height: 25, alignItems: "center", justifyContent: "center" },
  centerHeaderCopy: { flex: 1, alignItems: "flex-end" },
  centerHeaderTitle: { width: "100%", fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  centerHeaderBody: { width: "100%", fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 2 },
  headerBubble: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", position: "relative" },
  onlineDot: { width: 10, height: 10, borderRadius: 5, position: "absolute", bottom: -1, left: 0, borderWidth: 2, borderColor: "#fff" },
  tabs: { minHeight: 47, borderBottomWidth: 1, flexDirection: "row-reverse", alignItems: "center", padding: 4, gap: 3 },
  tab: { flex: 1, minHeight: 38, borderRadius: 11, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6 },
  tabText: { fontSize: 10, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  sectionBar: { minHeight: 62, paddingHorizontal: 13, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottomWidth: 1, borderBottomColor: "#E8ECF2" },
  sectionBarCopy: { flex: 1, alignItems: "flex-end" },
  sectionTitle: { width: "100%", fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  sectionSubtitle: { width: "100%", fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 2 },
  newTicketButton: { minHeight: 34, borderRadius: 17, paddingHorizontal: 11, flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  newTicketText: { fontSize: 10, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  newTicketCard: { borderWidth: 1, borderRadius: 15, padding: 10, margin: 10 },
  subjectInput: { minHeight: 43, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, fontSize: 11, fontFamily: "Inter_400Regular", writingDirection: "rtl" },
  fullButton: { minHeight: 42, borderRadius: 13, paddingHorizontal: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 9 },
  fullButtonText: { fontSize: 11, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  messages: { flex: 1 },
  messagesContent: { padding: 12, flexGrow: 1, justifyContent: "flex-end", gap: 8 },
  listContent: { padding: 12, gap: 9 },
  ticketCard: { minHeight: 68, borderWidth: 1, borderRadius: 16, padding: 11, flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  ticketIcon: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  ticketCopy: { flex: 1, alignItems: "flex-end" },
  ticketTitle: { width: "100%", fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  ticketMeta: { width: "100%", fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 3 },
  messageBubble: { maxWidth: "84%", borderWidth: 1, borderRadius: 16, padding: 11 },
  messageText: { fontSize: 11, lineHeight: 18, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl" },
  messageDate: { fontSize: 8, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 5 },
  composerDock: { borderTopWidth: 1, paddingTop: 8, paddingHorizontal: 9 },
  composer: { minHeight: 56, borderWidth: 1, borderRadius: 17, padding: 7, flexDirection: "row", alignItems: "flex-end", gap: 7 },
  composerInput: { flex: 1, minHeight: 38, maxHeight: 86, paddingHorizontal: 9, paddingVertical: 8, fontSize: 11, fontFamily: "Inter_400Regular", writingDirection: "rtl" },
  sendButton: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 9 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 35 },
  emptySupportIcon: { width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center", writingDirection: "rtl" },
  emptyBody: { maxWidth: 300, fontSize: 10, lineHeight: 17, fontFamily: "Inter_400Regular", textAlign: "center", writingDirection: "rtl", marginTop: 5 },
  messagesLanding: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  aiMessages: { flex: 1 },
  aiContent: { padding: 14, flexGrow: 1, justifyContent: "flex-end", gap: 9 },
  aiHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 9, marginBottom: 7 },
  aiAvatar: { width: 43, height: 43, borderRadius: 15, alignItems: "center", justifyContent: "center", position: "relative" },
  aiOnline: { width: 9, height: 9, borderRadius: 5, position: "absolute", bottom: -1, left: -1, borderWidth: 2, borderColor: "#fff" },
  aiHeaderCopy: { flex: 1, alignItems: "flex-end" },
  aiTitle: { width: "100%", fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  aiSubtitle: { width: "100%", fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 2 },
  aiWelcome: { alignItems: "center", justifyContent: "center", paddingVertical: 36, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#E8ECF2" },
  aiWelcomeIcon: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  aiWelcomeTitle: { fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center", writingDirection: "rtl" },
  aiWelcomeBody: { maxWidth: 300, fontSize: 11, lineHeight: 19, fontFamily: "Inter_400Regular", textAlign: "center", writingDirection: "rtl", marginTop: 6 },
  aiBubble: { maxWidth: "88%", borderWidth: 1, borderRadius: 16, padding: 11 },
  aiBubbleText: { fontSize: 11, lineHeight: 18, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl" },
  quickReplies: { borderTopWidth: 1, borderTopColor: "#E8ECF2", paddingHorizontal: 10, paddingTop: 9 },
  quickLabel: { fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl", marginBottom: 6 },
  quickWrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  quickChip: { borderRadius: 13, paddingHorizontal: 9, paddingVertical: 7 },
  quickText: { fontSize: 9, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  handoffButton: { minHeight: 38, borderRadius: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6 },
  handoffText: { fontSize: 10, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
});