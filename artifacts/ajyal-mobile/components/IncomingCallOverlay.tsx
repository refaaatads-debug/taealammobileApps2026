import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Icon } from '@/components/AjyalUI';
import { useInternalCall } from '@/contexts/InternalCallContext';
import { useAuth } from '@/lib/auth';
import { isOutgoingRingingCallForUser } from '@/lib/internalCallDirection';

export function IncomingCallOverlay() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { call, acceptCall, declineCall, endCall, clearCall, muted, toggleMute, speakerEnabled, toggleSpeaker, callConnectionState, callError } = useInternalCall();
  const pathname = usePathname();
  const [endingOutgoingCall, setEndingOutgoingCall] = useState(false);
  if (!call) return null;

  const isRinging = call.status === 'ringing';
  const isOutgoingRinging = isOutgoingRingingCallForUser(call, user?.id);
  const isActive = call.status === 'active';
  if (isOutgoingRinging) {
    const cancelOutgoingCall = async () => {
      if (endingOutgoingCall) return;
      setEndingOutgoingCall(true);
      try {
        await endCall();
        clearCall();
      } catch (error) {
        Alert.alert('تعذر إلغاء الاتصال', error instanceof Error ? error.message : 'حاول مرة أخرى.');
      } finally {
        setEndingOutgoingCall(false);
      }
    };

    return (
      <Modal
        visible
        transparent
        animationType="slide"
        onRequestClose={() => void cancelOutgoingCall()}
        testID="outgoing-call-modal"
      >
        <View style={[styles.backdrop, { backgroundColor: `${colors.tint}E8` }]}>
          <View style={[styles.card, { backgroundColor: colors.card, paddingBottom: Math.max(30, insets.bottom + 18) }]}>
            <View style={[styles.outgoingTopRow, { flexDirection: 'row-reverse' }]}>
              <Pressable
                testID="cancel-outgoing-call"
                accessibilityRole="button"
                accessibilityLabel="إلغاء الاتصال وإغلاق النافذة"
                disabled={endingOutgoingCall}
                onPress={() => void cancelOutgoingCall()}
                hitSlop={8}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed, endingOutgoingCall && styles.disabledAction]}
              >
                {endingOutgoingCall
                  ? <ActivityIndicator size="small" color={colors.destructive} />
                  : <Icon name="x" size={21} color={colors.destructive} />}
              </Pressable>
            </View>
            <View style={[styles.callIcon, { backgroundColor: colors.tealSoft }]}>
              <Icon name="phone" size={29} color={colors.teal} />
            </View>
            <Text style={[styles.eyebrow, { color: colors.teal }]}>أجيال المعرفة</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>جارٍ الاتصال</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>بانتظار رد الطرف الآخر</Text>
            <Pressable
              testID="cancel-outgoing-call-action"
              accessibilityRole="button"
              disabled={endingOutgoingCall}
              onPress={() => void cancelOutgoingCall()}
              style={({ pressed }) => [
                styles.singleAction,
                styles.cancelOutgoingAction,
                { backgroundColor: colors.destructive, opacity: endingOutgoingCall ? 0.65 : 1 },
                pressed && styles.pressed,
              ]}
            >
              {endingOutgoingCall
                ? <ActivityIndicator color={colors.destructiveForeground} />
                : <Icon name="phone-off" size={19} color={colors.destructiveForeground} />}
              <Text style={[styles.actionText, { color: colors.destructiveForeground }]}>
                {endingOutgoingCall ? 'جارٍ الإلغاء…' : 'إلغاء الاتصال'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }
  if (isActive && pathname.endsWith('/live-session')) return null;
  const statusTitle = isRinging
    ? 'مكالمة واردة'
    : isActive
      ? 'المكالمة جارية'
       : call.status === 'busy'
         ? 'الطرف الآخر مشغول الآن بمكالمة'
         : call.status === 'declined'
        ? 'تم رفض المكالمة'
        : 'انتهت المكالمة';
  const statusBody = isRinging
    ? 'لديك مكالمة واردة الآن'
    : isActive
      ? callConnectionState === 'connected' ? 'الصوت متصل ويمكنك كتم الميكروفون أو إنهاء المكالمة' : 'جارٍ إنشاء الاتصال الصوتي…'
       : call.status === 'busy'
         ? 'لا يمكن استقبال مكالمتين في الوقت نفسه'
         : call.status === 'declined'
        ? 'لن يتم إشعار الطرف الآخر بالمزيد من الرنين'
        : 'انتهى الاتصال ويمكنك إغلاق هذه النافذة';
  const acceptAndOpenRoom = async () => {
    try {
      await acceptCall();
      // A booking-linked call is also the user's request to enter the platform
      // session. Standalone calls keep the audio overlay only.
      if (call.roomId && !call.roomId.startsWith('call:') && !call.roomId.startsWith('test-')) {
        router.push({ pathname: '/live-session', params: { booking: call.roomId } });
      }
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
              {Platform.OS !== 'web' ? (
                <Pressable
                  testID="toggle-internal-call-speaker"
                  onPress={toggleSpeaker}
                  style={({ pressed }) => [styles.singleAction, { backgroundColor: speakerEnabled ? colors.primary : colors.muted }, pressed && styles.pressed]}
                >
                  <Icon name={speakerEnabled ? 'volume-2' : 'volume-1'} size={19} color={speakerEnabled ? colors.primaryForeground : colors.foreground} />
                  <Text style={[styles.actionText, { color: speakerEnabled ? colors.primaryForeground : colors.foreground }]}>{speakerEnabled ? 'مكبر الصوت' : 'سماعة الهاتف'}</Text>
                </Pressable>
              ) : null}
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
  outgoingTopRow: { width: '100%', minHeight: 32, alignItems: 'center', justifyContent: 'flex-start' },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  disabledAction: { opacity: 0.65 },
  cancelOutgoingAction: { marginTop: 28 },
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