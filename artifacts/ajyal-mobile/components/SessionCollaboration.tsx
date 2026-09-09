import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/AjyalUI';
import type { SessionDataMessage } from '@/hooks/useSessionWebRTC';
import { customFetch } from '@workspace/api-client-react';

type ChatMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at?: string | null;
};

type SessionCollaborationProps = {
  bookingId: string;
  userId?: string;
  sendDataMessage: (message: SessionDataMessage) => void;
  dataChannelState: 'closed' | 'connecting' | 'open';
};

function messageDate(value?: string | null) {
  if (!value) return 'الآن';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'الآن'
    : new Intl.DateTimeFormat('ar-SA', { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function SessionCollaboration({
  bookingId,
  userId,
  sendDataMessage,
  dataChannelState,
}: SessionCollaborationProps) {
  const colors = useColors();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const threadBookingIdsRef = useRef<Set<string>>(new Set([bookingId]));

  useEffect(() => {
    if (!supabase || !bookingId) return;
    let active = true;
    const client = supabase;
    const channel = client
      .channel(`session-chat-${bookingId}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const message = payload.new as ChatMessage & { booking_id?: string };
        if (!message.booking_id || !threadBookingIdsRef.current.has(String(message.booking_id))) return;
        setMessages((current) => current.some((item) => String(item.id) === String(message.id)) ? current : [...current, message].slice(-500));
      });
    try {
      channel.subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('تعذر تحديث محادثة الجلسة فورياً:', status);
        }
      });
    } catch (error) {
      console.warn('تعذر تهيئة محادثة الجلسة:', error);
    }

    setLoading(true);
    void (async () => {
      const { data: booking, error: bookingError } = await client
        .from('bookings')
        .select('student_id,teacher_id')
        .eq('id', bookingId)
        .maybeSingle();
      if (!active) return;
      if (bookingError || !booking) {
        setMessages([]);
        setLoading(false);
        return;
      }

      const participantId = user?.id ?? userId;
      const nextRecipientId = String(booking.student_id) === participantId
        ? String(booking.teacher_id)
        : String(booking.student_id);
      setRecipientId(nextRecipientId);
      const { data: visibleBookings, error: visibleBookingsError } = participantId
        ? await client
          .from('bookings')
          .select('id,student_id,teacher_id')
          .or(`student_id.eq.${participantId},teacher_id.eq.${participantId}`)
        : { data: [], error: null };
      if (!active) return;
      const allBookingIds = new Set<string>([bookingId]);
      if (!visibleBookingsError) {
        for (const row of visibleBookings ?? []) {
          const samePair = (
            String(row.student_id) === String(booking.student_id) && String(row.teacher_id) === String(booking.teacher_id)
          ) || (
            String(row.student_id) === String(booking.teacher_id) && String(row.teacher_id) === String(booking.student_id)
          );
          if (samePair && row.id) allBookingIds.add(String(row.id));
        }
      }
      threadBookingIdsRef.current = allBookingIds;

      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const result = await client
        .from('chat_messages')
        .select('id,sender_id,content,created_at')
        .in('booking_id', [...allBookingIds])
        .gte('created_at', oneYearAgo.toISOString())
        .order('created_at', { ascending: true });
      if (!active) return;
      setMessages(result.error ? [] : (result.data ?? []) as ChatMessage[]);
      setLoading(false);
    })();

    return () => {
      active = false;
      threadBookingIdsRef.current = new Set();
      void client.removeChannel(channel);
    };
  }, [bookingId]);

  useEffect(() => {
    if (dataChannelState === 'open') {
      // The whiteboard is rendered in the main media stage. Requesting the
      // current state here still supports students who join after drawing began.
      sendDataMessage({ type: 'whiteboard-request', event: 'whiteboard-request', kind: 'whiteboard-request' });
    }
  }, [dataChannelState, sendDataMessage]);

  const sendMessage = async () => {
    const content = draft.trim();
    const senderId = user?.id ?? userId;
    if (!supabase || !senderId || !bookingId || !content || sending) return;
    setSending(true);
    const result = await supabase
      .from('chat_messages')
      .insert({ booking_id: bookingId, sender_id: senderId, content })
      .select('id,sender_id,content,created_at')
      .single();
    if (!result.error && result.data) {
      const message = result.data as ChatMessage;
      setMessages((current) => current.some((item) => String(item.id) === String(message.id)) ? current : [...current, message].slice(-100));
      setDraft('');
      if (recipientId) {
        await customFetch<{ delivered: boolean }>('/api/push/messages', {
          method: 'POST',
          body: JSON.stringify({ bookingId, recipientId, kind: 'text' }),
        }).catch(() => undefined);
      }
    }
    setSending(false);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.chatHeader, { borderBottomColor: colors.border }]}>
        <Icon name="message-circle" size={15} color={colors.teal} />
        <Text style={[styles.chatHeaderText, { color: colors.foreground }]}>محادثة الجلسة</Text>
        <Text style={[styles.chatStatus, { color: colors.mutedForeground }]}>
          {dataChannelState === 'open' ? 'مزامنة الجلسة جاهزة' : 'المحادثة متاحة'}
        </Text>
      </View>
      <View style={styles.chatPanel}>
        {loading ? <ActivityIndicator color={colors.teal} /> : messages.length ? messages.map((message) => (
          <View key={String(message.id)} style={[styles.message, { alignSelf: message.sender_id === userId ? 'flex-end' : 'flex-start', backgroundColor: message.sender_id === userId ? colors.tealSoft : colors.muted }]}>
            <Text style={[styles.messageText, { color: colors.foreground }]}>{message.content}</Text>
            <Text style={[styles.messageDate, { color: colors.mutedForeground }]}>{messageDate(message.created_at)}</Text>
          </View>
        )) : <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا توجد رسائل داخل هذه الجلسة بعد.</Text>}
        <View style={[styles.composer, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Pressable testID="send-session-message" disabled={sending || !draft.trim()} onPress={() => void sendMessage()} style={[styles.sendButton, { backgroundColor: sending || !draft.trim() ? colors.muted : colors.primary }]}>
            <Icon name="send" size={15} color={sending || !draft.trim() ? colors.mutedForeground : colors.primaryForeground} />
          </Pressable>
          <TextInput value={draft} onChangeText={setDraft} placeholder="اكتب رسالة مرتبطة بالجلسة…" placeholderTextColor={colors.mutedForeground} textAlign="right" style={[styles.input, { color: colors.foreground }]} multiline />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 18, borderWidth: 1, padding: 10, marginTop: 14, marginBottom: 12 },
  chatHeader: { minHeight: 34, borderBottomWidth: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 10, paddingBottom: 8 },
  chatHeaderText: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  chatStatus: { flex: 1, textAlign: 'left', fontSize: 9, fontFamily: 'Inter_400Regular', writingDirection: 'rtl' },
  chatPanel: { gap: 8 },
  message: { maxWidth: '86%', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 },
  messageText: { textAlign: 'right', writingDirection: 'rtl', fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  messageDate: { textAlign: 'right', fontSize: 9, marginTop: 3, fontFamily: 'Inter_400Regular' },
  emptyText: { textAlign: 'center', paddingVertical: 18, fontSize: 11, fontFamily: 'Inter_400Regular' },
  composer: { minHeight: 45, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, marginTop: 5 },
  input: { flex: 1, minHeight: 38, maxHeight: 80, paddingHorizontal: 9, fontSize: 12, fontFamily: 'Inter_400Regular' },
  sendButton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});