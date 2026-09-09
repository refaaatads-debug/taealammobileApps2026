import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { EmptyState, Header, Icon, Screen, SectionHeading } from "@/components/AjyalUI";
import { markChatMessagesRead } from "@/lib/localChatReadState";

type Row = Record<string, unknown>;

function value(row: Row, ...keys: string[]): string {
  for (const key of keys) if (typeof row[key] === "string" && row[key]) return row[key] as string;
  return "";
}

function dateValue(row: Row): string {
  const raw = value(row, "created_at", "sent_at", "scheduled_at");
  if (!raw) return "—";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

function supabaseErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "");
    if (message) return message;
  }
  return fallback;
}

function PageHeader({ eyebrow, title, avatar }: { eyebrow: string; title: string; avatar?: string | null }) {
  return <Header onBack={() => router.back()} eyebrow={eyebrow} title={title} avatarText={avatar?.slice(0, 1)} onAvatar={() => router.push("/profile")} />;
}

function Composer({ value: draft, onChange, onSend, disabled, placeholder }: { value: string; onChange: (value: string) => void; onSend: () => void; disabled?: boolean; placeholder: string }) {
  const colors = useColors();
  return <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}><Pressable disabled={disabled || !draft.trim()} onPress={onSend} style={({ pressed }) => [styles.sendButton, { backgroundColor: disabled || !draft.trim() ? colors.muted : colors.primary }, pressed && styles.pressed]}><Icon name="send" size={16} color={disabled || !draft.trim() ? colors.mutedForeground : colors.primaryForeground} /></Pressable><TextInput value={draft} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} multiline textAlign="right" style={[styles.composerInput, { color: colors.foreground }]} /></View>;
}

export function ChatScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ booking?: string; student?: string }>();
  const [bookings, setBookings] = useState<Row[]>([]);
  const [bookingId, setBookingId] = useState<string | null>(typeof params.booking === "string" ? params.booking : null);
  const [messages, setMessages] = useState<Row[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setError(false);
    const result = await supabase.from("bookings").select("id,student_id,teacher_id").or(`student_id.eq.${user.id},teacher_id.eq.${user.id}`).order("scheduled_at", { ascending: false });
    if (result.error) { setError(true); setLoading(false); return; }
    const rows = (result.data ?? []) as Row[];
    setBookings(rows);
    const studentBookings = typeof params.student === "string"
      ? rows.filter((row) => String(row.student_id) === params.student)
      : rows;
    const chosen = bookingId && studentBookings.some((row) => String(row.id) === bookingId)
      ? bookingId
      : (studentBookings[0] ? String(studentBookings[0].id) : null);
    setBookingId(chosen);
    if (!chosen) { setMessages([]); setLoading(false); return; }
    const messagesResult = await supabase.from("chat_messages").select("*").in("booking_id", rows.map((row) => String(row.id))).order("created_at", { ascending: true });
    if (messagesResult.error) setError(true);
    setMessages((messagesResult.data ?? []) as Row[]);
    if (!messagesResult.error && messagesResult.data?.length) {
      await markChatMessagesRead(
        user.id,
        messagesResult.data
          .filter((message) => String(message.sender_id) !== user.id)
          .map((message) => String(message.id)),
      );
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [user?.id, params.booking, params.student]);

  const send = async () => {
    if (!supabase || !user || !bookingId || !draft.trim() || sending) return;
    setSending(true);
    const content = draft.trim();
    const result = await supabase.from("chat_messages").insert({ booking_id: bookingId, sender_id: user.id, content }).select().single();
    if (!result.error && result.data) setMessages((current) => [...current, result.data as Row]);
    if (!result.error) setDraft("");
    setSending(false);
  };

  const visibleMessages = messages.filter((message) => String(message.booking_id) === String(bookingId));
  return <Screen scroll={false}><PageHeader eyebrow="تواصل داخل أجيال المعرفة" title="المحادثات" avatar={user?.email} /><View style={[styles.hero, { backgroundColor: colors.primary }]}><View style={[styles.heroIcon, { backgroundColor: colors.tealSoft }]}><Icon name="message-circle" size={22} color={colors.teal} /></View><View style={styles.heroCopy}><Text style={[styles.heroEyebrow, { color: colors.tint }]}>مرتبطة بحجوزاتك</Text><Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>محادثتك التعليمية</Text><Text style={[styles.heroBody, { color: colors.tint }]}>الرسائل محفوظة في منصة أجيال المعرفة.</Text></View></View>{bookings.length > 1 ? <View style={styles.bookingTabs}>{bookings.map((booking) => <Pressable key={String(booking.id)} onPress={() => setBookingId(String(booking.id))} style={[styles.bookingTab, { backgroundColor: bookingId === String(booking.id) ? colors.primary : colors.card, borderColor: colors.border }]}><Text style={[styles.bookingTabText, { color: bookingId === String(booking.id) ? colors.primaryForeground : colors.foreground }]}>{String(booking.id).slice(0, 8)}</Text></Pressable>)}</View> : null}<View style={styles.chatBody}>{loading ? <View style={styles.center}><ActivityIndicator color={colors.teal} /><Text style={[styles.stateText, { color: colors.mutedForeground }]}>جارٍ تحميل المحادثة…</Text></View> : error ? <EmptyState icon="alert-circle" title="تعذر تحميل المحادثة" body="تحقق من اتصالك ثم حاول مرة أخرى." action="إعادة المحاولة" onAction={() => void load()} /> : !bookings.length ? <EmptyState icon="message-circle" title="لا توجد محادثات بعد" body="ستظهر المحادثة بعد إنشاء حجز مرتبط بالمعلم." /> : !visibleMessages.length ? <EmptyState icon="message-circle" title="ابدأ المحادثة" body="أرسل أول رسالة مرتبطة بهذا الحجز." /> : visibleMessages.map((message) => <View key={String(message.id)} style={[styles.message, { alignSelf: message.sender_id === user?.id ? "flex-end" : "flex-start", backgroundColor: message.sender_id === user?.id ? colors.primary : colors.card, borderColor: colors.border }]}><Text style={[styles.messageText, { color: message.sender_id === user?.id ? colors.primaryForeground : colors.foreground }]}>{value(message, "content")}</Text><Text style={[styles.messageDate, { color: message.sender_id === user?.id ? colors.tint : colors.mutedForeground }]}>{dateValue(message)}</Text></View>)}</View><Composer value={draft} onChange={setDraft} onSend={() => void send()} disabled={sending || !bookingId} placeholder={sending ? "جارٍ الإرسال…" : "اكتب رسالتك…"} /></Screen>;
}

export function SupportScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Row[]>([]);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Row[]>([]);
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setError(false);
    setErrorMessage("");
    const result = await supabase.from("support_tickets").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (result.error) {
      setError(true);
      setErrorMessage(supabaseErrorMessage(result.error, "تعذر قراءة تذاكر الدعم."));
      setLoading(false);
      return;
    }
    const rows = (result.data ?? []) as Row[];
    setTickets(rows);
    const chosen = ticketId && rows.some((row) => String(row.id) === ticketId) ? ticketId : (rows[0] ? String(rows[0].id) : null);
    setTicketId(chosen);
    if (chosen) {
      const messageResult = await supabase.from("support_messages").select("*").eq("ticket_id", chosen).order("created_at", { ascending: true });
      if (messageResult.error) {
        setError(true);
        setErrorMessage(supabaseErrorMessage(messageResult.error, "تعذر قراءة رسائل التذكرة."));
      }
      setMessages((messageResult.data ?? []) as Row[]);
    } else setMessages([]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [user?.id]);

  useEffect(() => {
    if (!supabase || !ticketId) return;
    let active = true;
    void supabase.from("support_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true }).then((result) => {
      if (!active) return;
      if (result.error) {
        setError(true);
        setErrorMessage(supabaseErrorMessage(result.error, "تعذر قراءة رسائل التذكرة."));
        return;
      }
      setMessages((result.data ?? []) as Row[]);
    });
    const channel = supabase
      .channel(`support-messages-${ticketId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, (payload) => {
        const row = payload.new as Row;
        setMessages((current) => current.some((item) => String(item.id) === String(row.id)) ? current : [...current, row]);
      })
      .subscribe();
    return () => {
      active = false;
      void supabase?.removeChannel(channel);
    };
  }, [ticketId]);

  const createTicket = async () => {
    if (!supabase || !user || !subject.trim() || sending) return;
    setSending(true);
    const result = await supabase.from("support_tickets").insert({ user_id: user.id, subject: subject.trim() }).select().single();
    if (result.error) {
      const message = supabaseErrorMessage(result.error, "تعذر إنشاء طلب الدعم.");
      setErrorMessage(message);
      Alert.alert("تعذر إنشاء طلب الدعم", message);
    } else if (result.data) {
      setSubject("");
      setTickets((current) => [result.data as Row, ...current]);
      setTicketId(String(result.data.id));
      setMessages([]);
    }
    setSending(false);
  };

  const send = async () => {
    if (!supabase || !user || !ticketId || !draft.trim() || sending) return;
    setSending(true);
    const content = draft.trim();
    const result = await supabase.from("support_messages").insert({ ticket_id: ticketId, sender_id: user.id, content, is_admin: false }).select().single();
    if (result.error) {
      const message = supabaseErrorMessage(result.error, "تعذر إرسال الرد.");
      setErrorMessage(message);
      Alert.alert("تعذر إرسال الرد", message);
    } else if (result.data) {
      setMessages((current) => current.some((item) => String(item.id) === String(result.data?.id)) ? current : [...current, result.data as Row]);
      setDraft("");
    }
    setSending(false);
  };

  return <Screen><PageHeader eyebrow="نحن هنا لمساعدتك" title="مركز الدعم" avatar={user?.email} /><View style={[styles.hero, { backgroundColor: colors.primary }]}><View style={[styles.heroIcon, { backgroundColor: colors.tealSoft }]}><Icon name="help-circle" size={22} color={colors.teal} /></View><View style={styles.heroCopy}><Text style={[styles.heroEyebrow, { color: colors.tint }]}>تذاكر الدعم</Text><Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>تواصل مع الفريق</Text><Text style={[styles.heroBody, { color: colors.tint }]}>افتح طلباً جديداً أو تابع طلباتك السابقة.</Text></View></View>{tickets.length > 1 ? <View style={styles.bookingTabs}>{tickets.map((ticket) => <Pressable key={String(ticket.id)} onPress={() => setTicketId(String(ticket.id))} style={[styles.bookingTab, { backgroundColor: ticketId === String(ticket.id) ? colors.primary : colors.card, borderColor: colors.border }]}><Text numberOfLines={1} style={[styles.bookingTabText, { color: ticketId === String(ticket.id) ? colors.primaryForeground : colors.foreground }]}>{value(ticket, "subject") || "طلب دعم"}</Text></Pressable>)}</View> : null}{loading ? <View style={styles.center}><ActivityIndicator color={colors.teal} /></View> : error ? <EmptyState icon="alert-circle" title="تعذر تحميل الدعم" body={errorMessage || "تحقق من الاتصال ثم حاول مرة أخرى."} action="إعادة المحاولة" onAction={() => void load()} /> : !ticketId ? <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.foreground }]}>افتح طلب دعم جديد</Text><TextInput value={subject} onChangeText={setSubject} placeholder="موضوع الطلب" placeholderTextColor={colors.mutedForeground} textAlign="right" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} /><Pressable onPress={() => void createTicket()} style={[styles.actionButton, { backgroundColor: colors.primary }]}><Text style={[styles.actionText, { color: colors.primaryForeground }]}>إنشاء الطلب</Text></Pressable></View> : <><SectionHeading title={value(tickets.find((ticket) => String(ticket.id) === ticketId) ?? {}, "subject") || "طلب الدعم"} />{messages.length ? messages.map((message) => <View key={String(message.id)} style={[styles.card, { backgroundColor: message.is_admin ? colors.card : colors.tealSoft, borderColor: colors.border }]}><Text style={[styles.cardBody, { color: colors.foreground }]}>{value(message, "content")}</Text><Text style={[styles.messageDate, { color: colors.mutedForeground }]}>{dateValue(message)}</Text></View>) : <EmptyState icon="message-circle" title="لا توجد رسائل بعد" body="اكتب رسالتك وسيتمكن فريق الدعم من متابعتها." />}<Composer value={draft} onChange={setDraft} onSend={() => void send()} disabled={sending} placeholder={sending ? "جارٍ الإرسال…" : "اكتب رسالتك للدعم…"} /></>}</Screen>;
}

export function RatingScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ booking?: string }>();
  const [bookings, setBookings] = useState<Row[]>([]);
  const [bookingId, setBookingId] = useState<string | null>(typeof params.booking === "string" ? params.booking : null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!supabase || !user) return;
    void (async () => {
      const result = await supabase.from("bookings").select("id,teacher_id,subject_id,scheduled_at").eq("student_id", user.id).eq("status", "completed").order("scheduled_at", { ascending: false });
      if (result.error) setError(true);
      const rows = (result.data ?? []) as Row[];
      setBookings(rows);
      setBookingId((current) => current && rows.some((row) => String(row.id) === current) ? current : rows[0] ? String(rows[0].id) : null);
      setLoading(false);
    })();
  }, [user?.id]);

  const submit = async () => {
    if (!supabase || !user || !bookingId || !rating) return;
    const booking = bookings.find((row) => String(row.id) === bookingId);
    if (!booking) return;
    const result = await supabase.from("reviews").insert({ booking_id: bookingId, student_id: user.id, teacher_id: booking.teacher_id, rating, comment: comment.trim() || null });
    if (!result.error) setSubmitted(true);
  };

  return <Screen><PageHeader eyebrow="صوتك يصنع فرقاً" title="التقييمات" avatar={user?.email} /><View style={[styles.hero, { backgroundColor: colors.primary }]}><View style={[styles.heroIcon, { backgroundColor: colors.goldSoft }]}><Icon name="star" size={22} color={colors.accentForeground} /></View><View style={styles.heroCopy}><Text style={[styles.heroEyebrow, { color: colors.tint }]}>بعد الجلسة</Text><Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>قيّم تجربتك</Text><Text style={[styles.heroBody, { color: colors.tint }]}>التقييمات تُحفظ في جدول reviews في المنصة.</Text></View></View>{loading ? <View style={styles.center}><ActivityIndicator color={colors.teal} /></View> : error ? <EmptyState icon="alert-circle" title="تعذر تحميل الجلسات" body="تحقق من الاتصال ثم حاول مرة أخرى." /> : submitted ? <EmptyState icon="check-circle" title="تم إرسال تقييمك" body="شكراً لمساعدتك في تحسين جودة التعليم." action="العودة" onAction={() => router.back()} /> : !bookings.length ? <EmptyState icon="star" title="لا توجد جلسات مكتملة" body="يمكنك تقييم الجلسة بعد اكتمالها." /> : <><SectionHeading title="اختر الجلسة" />{bookings.map((booking) => <Pressable key={String(booking.id)} onPress={() => setBookingId(String(booking.id))} style={[styles.card, { backgroundColor: bookingId === String(booking.id) ? colors.tealSoft : colors.card, borderColor: bookingId === String(booking.id) ? colors.teal : colors.border }]}><Text style={[styles.cardTitle, { color: colors.foreground }]}>جلسة {String(booking.id).slice(0, 8)}</Text><Text style={[styles.cardBody, { color: colors.mutedForeground }]}>{dateValue(booking)}</Text></Pressable>)}<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.foreground }]}>كيف كانت الحصة؟</Text><View style={styles.stars}>{[1, 2, 3, 4, 5].map((star) => <Pressable key={star} onPress={() => setRating(star)}><Icon name="star" size={29} color={star <= rating ? colors.accentForeground : colors.border} /></Pressable>)}</View><TextInput value={comment} onChangeText={setComment} placeholder="ملاحظة اختيارية" placeholderTextColor={colors.mutedForeground} multiline textAlign="right" style={[styles.input, styles.comment, { color: colors.foreground, borderColor: colors.border }]} /><Pressable disabled={!rating} onPress={() => void submit()} style={[styles.actionButton, { backgroundColor: rating ? colors.primary : colors.muted }]}><Text style={[styles.actionText, { color: rating ? colors.primaryForeground : colors.mutedForeground }]}>إرسال التقييم</Text></Pressable></View></>}</Screen>;
}

const styles = StyleSheet.create({
  hero: { minHeight: 158, borderRadius: 23, padding: 17, flexDirection: "row", alignItems: "center", marginBottom: 18 },
  heroIcon: { width: 58, height: 58, borderRadius: 19, alignItems: "center", justifyContent: "center", marginLeft: 4 },
  heroCopy: { flex: 1, alignItems: "flex-end", marginLeft: 14 },
  heroEyebrow: { width: "100%", fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl" },
  heroTitle: { width: "100%", fontSize: 21, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl", marginTop: 6 },
  heroBody: { width: "100%", fontSize: 11, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 6 },
  card: { borderWidth: 1, borderRadius: 18, padding: 15, marginBottom: 11 },
  cardTitle: { fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  cardBody: { fontSize: 11, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 6 },
  message: { maxWidth: "84%", borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 9 },
  messageText: { fontSize: 12, lineHeight: 19, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl" },
  messageDate: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "right", writingDirection: "rtl", marginTop: 5 },
  composer: { minHeight: 54, borderWidth: 1, borderRadius: 17, padding: 7, flexDirection: "row", alignItems: "flex-end", gap: 7, marginTop: 10 },
  composerInput: { flex: 1, maxHeight: 90, minHeight: 37, paddingHorizontal: 9, paddingVertical: 8, fontSize: 12, fontFamily: "Inter_400Regular", writingDirection: "rtl" },
  sendButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  bookingTabs: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 12 },
  bookingTab: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, maxWidth: "48%" },
  bookingTabText: { fontSize: 10, fontFamily: "Inter_600SemiBold", writingDirection: "rtl" },
  chatBody: { flex: 1, justifyContent: "flex-end" },
  center: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 10 },
  stateText: { fontSize: 11, fontFamily: "Inter_500Medium", writingDirection: "rtl" },
  input: { minHeight: 45, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, marginTop: 12, fontSize: 12, fontFamily: "Inter_400Regular", writingDirection: "rtl" },
  comment: { minHeight: 80, textAlignVertical: "top" },
  actionButton: { minHeight: 43, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, marginTop: 12 },
  actionText: { fontSize: 11, fontFamily: "Inter_700Bold", writingDirection: "rtl" },
  stars: { flexDirection: "row", justifyContent: "center", gap: 9, marginTop: 15 },
  pressed: { opacity: 0.72 },
});