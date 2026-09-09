import React from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Icon } from '@/components/AjyalUI';
import { useInternalCall } from '@/contexts/InternalCallContext';

export function IncomingCallOverlay() {
  const colors = useColors();
  const { call, acceptCall, declineCall, endCall, clearCall, muted, toggleMute, callConnectionState, callError } = useInternalCall();
  const pathname = usePathname();
  if (!call || (call.status === 'active' && pathname.endsWith('/live-session'))) return null;

  const isRinging = call.status === 'ringing';
  const isActive = call.status === 'active';
  const statusTitle = isRinging
    ? 'مكالمة واردة'
    : isActive
      ? 'المكالمة جارية'
      : call.status === 'declined'
        ? 'تم رفض المكالمة'
        : 'انتهت المكالمة';
  const statusBody = isRinging
    ? 'لديك مكالمة واردة الآن'
    : isActive
      ? callConnectionState === 'connected' ? 'الصوت متصل ويمكنك كتم الميكروفون أو إنهاء المكالمة' : 'جارٍ إنشاء الاتصال الصوتي…'
      : call.status === 'declined'
        ? 'لن يتم إشعار الطرف الآخر بالمزيد من الرنين'
        : 'انتهى الاتصال ويمكنك إغلاق هذه النافذة';
  const acceptAndOpenRoom = async () => {
    try {
      await acceptCall();
      // Internal voice is independent from the booking video room. Keep this
      // overlay open so the audio hook can run without starting session video.
    } catch (error) {
      Alert.alert('تعذر قبول المكالمة', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={isRinging ? declineCall : isActive ? () => { void endCall().catch(() => undefined); } : clearCall}
      testID="incoming-call-modal"
    >
      <View style={[styles.backdrop, { backgroundColor: `${colors.tint}E8` }]}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.callIcon, { backgroundColor: colors.tealSoft }]}>
            <Icon name={isActive ? 'phone' : 'phone-incoming'} size={29} color={colors.teal} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.teal }]}>أجيال المعرفة</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>{statusTitle}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>{statusBody}</Text>
          <Text style={[styles.callerName, { color: colors.foreground }]}>{call.callerName}</Text>
          {call.callerRole ? <Text style={[styles.callerRole, { color: colors.mutedForeground }]}>{call.callerRole}</Text> : null}

          {isRinging ? (
            <View style={styles.actions}>
              <Pressable
                testID="decline-incoming-call"
                onPress={declineCall}
                style={({ pressed }) => [styles.action, styles.declineAction, { borderColor: colors.destructive }, pressed && styles.pressed]}
              >
                <Icon name="phone-off" size={19} color={colors.destructive} />
                <Text style={[styles.actionText, { color: colors.destructive }]}>رفض المكالمة</Text>
              </Pressable>
              <Pressable
                testID="accept-incoming-call"
                onPress={() => void acceptAndOpenRoom()}
                style={({ pressed }) => [styles.action, styles.acceptAction, { backgroundColor: colors.teal }, pressed && styles.pressed]}
              >
                <Icon name="phone" size={19} color={colors.primaryForeground} />
                <Text style={[styles.actionText, { color: colors.primaryForeground }]}>قبول المكالمة</Text>
              </Pressable>
            </View>
          ) : isActive ? (
            <>
              <Pressable
                testID="toggle-internal-call-mute"
                onPress={toggleMute}
                style={({ pressed }) => [styles.singleAction, { backgroundColor: muted ? colors.destructive : colors.teal }, pressed && styles.pressed]}
              >
                <Icon name={muted ? 'mic-off' : 'mic'} size={19} color={colors.primaryForeground} />
                <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{muted ? 'فتح الميكروفون' : 'كتم الميكروفون'}</Text>
              </Pressable>
              <Pressable
                testID="end-call"
                onPress={() => void endCall().catch((error: unknown) => Alert.alert('تعذر إنهاء المكالمة', error instanceof Error ? error.message : 'حاول مرة أخرى.'))}
                style={({ pressed }) => [styles.singleAction, { backgroundColor: colors.destructive }, pressed && styles.pressed]}
              >
                <Icon name="phone-off" size={19} color={colors.destructiveForeground} />
                <Text style={[styles.actionText, { color: colors.destructiveForeground }]}>إنهاء المكالمة</Text>
              </Pressable>
              {callError ? <Text style={[styles.actionText, { color: colors.destructive, marginTop: 12 }]}>{callError}</Text> : null}
            </>
          ) : (
            <Pressable
              testID="close-call"
              onPress={clearCall}
              style={({ pressed }) => [styles.singleAction, { backgroundColor: colors.primary }, pressed && styles.pressed]}
            >
              <Text style={[styles.actionText, { color: colors.primaryForeground }]}>إغلاق</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  card: { borderTopLeftRadius: 30, borderTopRightRadius: 30, alignItems: 'center', paddingHorizontal: 22, paddingTop: 30, paddingBottom: 38 },
  callIcon: { width: 68, height: 68, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  eyebrow: { fontSize: 12, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  title: { fontSize: 25, fontFamily: 'Inter_700Bold', marginTop: 6, writingDirection: 'rtl' },
  body: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 8, textAlign: 'center', writingDirection: 'rtl' },
  callerName: { fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 24, writingDirection: 'rtl' },
  callerRole: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 4, writingDirection: 'rtl' },
  actions: { flexDirection: 'row-reverse', width: '100%', gap: 10, marginTop: 30 },
  action: { flex: 1, minHeight: 52, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  acceptAction: { borderWidth: 0 },
  declineAction: { backgroundColor: 'transparent' },
  singleAction: { width: '100%', minHeight: 52, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 30 },
  actionText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72 },
});