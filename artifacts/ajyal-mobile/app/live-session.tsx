import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useInternalCall } from '@/contexts/InternalCallContext';
import { useAjyal } from '@/hooks/useAjyal';
import { useSessionWebRTC } from '@/hooks/useSessionWebRTC';
import { SessionVideo } from '@/components/SessionVideo';
import { SessionCollaboration } from '@/components/SessionCollaboration';
import { SessionWhiteboard, normalizeWhiteboardAction, type WhiteboardAction } from '@/components/SessionWhiteboard';
import type { SessionDataMessage } from '@/hooks/useSessionWebRTC';
import { useGetStudentDashboard, useListMySessions } from '@workspace/api-client-react';
import { Header, Icon, Screen } from '@/components/AjyalUI';
import { supabase } from '@/lib/supabase';

function formatElapsed(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60).toString().padStart(2, '0')}:${(safeSeconds % 60).toString().padStart(2, '0')}`;
}

export default function LiveSessionScreen() {
  const colors = useColors();
  const { height: windowHeight } = useWindowDimensions();
  const { profile, role } = useAjyal();
  const params = useLocalSearchParams<{ booking?: string }>();
  const { call, endCall, clearCall } = useInternalCall();
  const sessionsQuery = useListMySessions({ view: 'upcoming' });
  const studentDashboardQuery = useGetStudentDashboard({
    query: { queryKey: ['student-dashboard'], enabled: role === 'student' },
  });
  const bookingId = typeof params.booking === 'string' ? params.booking : undefined;
  const session = sessionsQuery.data?.find((item) => item.id === bookingId);
  const isActive = call?.status === 'active';
  const isCurrentCall = Boolean(bookingId && call?.roomId === bookingId);
  const isSessionCallActive = isActive && isCurrentCall;
  const isStudent = role === 'student';
  const isActiveRef = useRef(isSessionCallActive);
  const isCurrentCallRef = useRef(isCurrentCall);
  const [lifecycle, setLifecycle] = useState<{
    startedAt: string | null;
    endedAt: string | null;
    status: string | null;
    bookingStatus: string | null;
    studentId: string | null;
    teacherId: string | null;
  }>({
    startedAt: null,
    endedAt: null,
    status: null,
    bookingStatus: null,
    studentId: null,
    teacherId: null,
  });
  const [joinRequested, setJoinRequested] = useState(false);
  const [whiteboardActions, setWhiteboardActions] = useState<WhiteboardAction[]>([]);
  const [whiteboardVisible, setWhiteboardVisible] = useState(false);
  const [whiteboardCanDraw, setWhiteboardCanDraw] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [displayScale, setDisplayScale] = useState(1);
  const [handRaised, setHandRaised] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const timerAnchorRef = useRef<{ elapsed: number; timestamp: number; paused: boolean } | null>(null);
  const refreshLifecycle = useCallback(async () => {
    if (!supabase || !bookingId) return;
    const [{ data: sessionRow, error: sessionError }, { data: bookingRow, error: bookingError }] = await Promise.all([
      supabase.from('sessions').select('started_at, ended_at').eq('booking_id', bookingId).maybeSingle(),
      supabase.from('bookings').select('status, session_status, student_id, teacher_id').eq('id', bookingId).maybeSingle(),
    ]);
    if (sessionError) throw sessionError;
    if (bookingError) throw bookingError;
    setLifecycle({
      startedAt: typeof sessionRow?.started_at === 'string' ? sessionRow.started_at : null,
      endedAt: typeof sessionRow?.ended_at === 'string' ? sessionRow.ended_at : null,
      status: typeof bookingRow?.session_status === 'string' ? bookingRow.session_status : null,
      bookingStatus: typeof bookingRow?.status === 'string' ? bookingRow.status : null,
      studentId: typeof bookingRow?.student_id === 'string' ? bookingRow.student_id : null,
      teacherId: typeof bookingRow?.teacher_id === 'string' ? bookingRow.teacher_id : null,
    });
  }, [bookingId]);
  const isBookingStudent = Boolean(isStudent && profile?.id && lifecycle.studentId === profile.id);
  const canStudentJoin = Boolean(
    isBookingStudent
      && lifecycle.status === 'in_progress'
      && !lifecycle.endedAt,
  );
  // Internal calls are a separate notification/audio system. They must never
  // authorize the session media path; the student explicitly joins the room.
  const shouldJoin = Boolean(canStudentJoin && bookingId && profile?.id && joinRequested);
  const handleDataMessage = useCallback((message: SessionDataMessage) => {
    const messageTypeCandidates = [message.type, message.event, message.kind, message.messageType]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const messageType = (
      messageTypeCandidates.find((value) => /whiteboard|screen[-_:]?share|timer|hand[-_:]?raise/i.test(value))
      ?? messageTypeCandidates[0]
      ?? ''
    )
      .trim()
      .toLowerCase()
      .replace(/[_:]/g, '-');
    const parseRecord = (value: unknown): Record<string, unknown> | null => {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
        } catch {
          return null;
        }
      }
      return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
    };
    const messagePayload = parseRecord(message.payload);
    const messageData = parseRecord(message.data);
    const messageDetail = parseRecord(message.detail);
    const payloadData = parseRecord(messagePayload?.data);
    const dataData = parseRecord(messageData?.data);
    const nestedRecords = [
      message,
      messagePayload,
      messageData,
      messageDetail,
      payloadData,
      dataData,
      parseRecord(messagePayload?.permission),
      parseRecord(messagePayload?.permissions),
      parseRecord(messagePayload?.student),
      parseRecord(messageData?.permission),
      parseRecord(messageData?.permissions),
      parseRecord(messageData?.student),
      parseRecord(payloadData?.permission),
      parseRecord(payloadData?.permissions),
      parseRecord(dataData?.permission),
      parseRecord(dataData?.permissions),
    ].filter((source): source is Record<string, unknown> => Boolean(source));
    const enabled = message.enabled === true
      || message.active === true
      || message.isSharing === true
      || messagePayload?.enabled === true
      || messagePayload?.active === true
      || messagePayload?.isSharing === true
      || messageData?.enabled === true
      || messageData?.active === true
      || messageData?.isSharing === true;
    const boardAction = normalizeWhiteboardAction(
      message.action
      ?? messagePayload?.action
      ?? messageData?.action
      ?? payloadData?.action
      ?? dataData?.action
      ?? (Array.isArray(message.points) ? message : null)
      ?? (messagePayload && Array.isArray(messagePayload.points) ? messagePayload : null)
      ?? (messageData && Array.isArray(messageData.points) ? messageData : null)
      ?? (payloadData && Array.isArray(payloadData.points) ? payloadData : null)
      ?? (dataData && Array.isArray(dataData.points) ? dataData : null)
      ?? (messageType === 'path' || messageType === 'draw' ? message : null),
    );
    const boardActions = message.actions
      ?? messagePayload?.actions
      ?? message.whiteboardData
      ?? message.whiteboard_data
      ?? messagePayload?.whiteboardData
      ?? messagePayload?.whiteboard_data
      ?? messageData?.whiteboardData
      ?? messageData?.whiteboard_data
      ?? payloadData?.whiteboardData
      ?? payloadData?.whiteboard_data
      ?? dataData?.whiteboardData
      ?? dataData?.whiteboard_data;
    const explicitPermissionKeys = [
      'canWrite',
      'allowStudentDrawing',
      'studentCanDraw',
      'canEdit',
      'editable',
      'writeEnabled',
      'can_write',
      'allow_student_drawing',
      'student_can_draw',
    ];
    const genericPermissionKeys = ['enabled', 'allowed', 'permitted'];
    const readBoolean = (keys: string[]) => nestedRecords.reduce<boolean | undefined>((current, source) => {
      if (typeof current === 'boolean') return current;
      for (const key of keys) {
        if (typeof source[key] === 'boolean') return source[key] as boolean;
      }
      return undefined;
    }, undefined);
    const explicitPermissionValue = readBoolean(explicitPermissionKeys);
    const isPermissionMessage = (
      (messageType.includes('whiteboard') && (
        messageType.includes('permission')
        || messageType.includes('access')
        || messageType.includes('edit')
        || messageType.includes('write')
      ))
      || messageType === 'student-can-draw'
      || messageType === 'student-whiteboard-access'
    );
    const permissionValue = explicitPermissionValue
      ?? (isPermissionMessage ? readBoolean(genericPermissionKeys) : undefined);
    if (typeof permissionValue === 'boolean' && (isPermissionMessage || explicitPermissionValue !== undefined)) {
      setWhiteboardCanDraw(permissionValue);
      if (permissionValue) setWhiteboardVisible(true);
    }
    if (messageType === 'timer-sync' && typeof message.elapsed === 'number') {
      timerAnchorRef.current = {
        elapsed: Math.max(0, message.elapsed),
        timestamp: typeof message.ts === 'number' ? message.ts : Date.now(),
        paused: message.paused === true,
      };
      setElapsedSeconds(Math.max(0, message.elapsed));
    } else if (messageType === 'timer-start' && typeof message.startedAt === 'string') {
      const startedAt = Date.parse(message.startedAt);
      if (!Number.isNaN(startedAt)) {
        timerAnchorRef.current = { elapsed: 0, timestamp: startedAt, paused: false };
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
      }
    } else if (
      boardAction
      && (messageType.includes('whiteboard') || messageType === 'path' || messageType === 'draw')
    ) {
      setWhiteboardActions((current) => [...current, boardAction].slice(-160));
      setWhiteboardVisible(true);
    } else if (
      (messageType === 'whiteboard-state'
        || messageType === 'whiteboard-sync'
        || messageType === 'whiteboard-data'
        || messageType === 'whiteboard-update')
      && Array.isArray(boardActions)
    ) {
      const actions = boardActions
        .map(normalizeWhiteboardAction)
        .filter((action): action is WhiteboardAction => Boolean(action));
      setWhiteboardActions(actions);
      setWhiteboardVisible(true);
    } else if (messageType === 'whiteboard-clear' || messageType === 'whiteboard-reset') {
      setWhiteboardActions([]);
      setWhiteboardVisible(true);
    } else if (messageType === 'whiteboard-undo') {
      setWhiteboardActions((current) => current.slice(0, -1));
      setWhiteboardVisible(true);
    } else if (
      messageType === 'whiteboard-open'
      || messageType === 'whiteboard-start'
      || messageType === 'whiteboard-show'
      || (messageType === 'whiteboard-toggle' && enabled)
    ) {
      setWhiteboardVisible(true);
    } else if (
      messageType === 'screen-share-start'
      || messageType === 'screen-share'
      || messageType === 'screen-share-state'
      || messageType === 'screen-share-toggle'
      || (messageType === 'whiteboard-toggle' && !enabled)
    ) {
      setWhiteboardVisible(false);
    }
  }, []);
  const rtc = useSessionWebRTC({
    bookingId,
    userId: profile?.id,
    enabled: shouldJoin && isStudent,
    onDataMessage: handleDataMessage,
  });
  const handleWhiteboardAction = useCallback((action: WhiteboardAction) => {
    if (!whiteboardCanDraw) return;
    setWhiteboardActions((current) => [...current, action].slice(-160));
    setWhiteboardVisible(true);
    rtc.sendDataMessage({
      type: 'whiteboard-action',
      event: 'whiteboard-action',
      kind: 'whiteboard-action',
      action,
      points: action.points,
      color: action.color,
      lineWidth: action.lineWidth,
      userId: profile?.id,
      timestamp: Date.now(),
    });
  }, [profile?.id, rtc.sendDataMessage, whiteboardCanDraw]);

  useEffect(() => {
    const startedAt = lifecycle.startedAt ? Date.parse(lifecycle.startedAt) : Number.NaN;
    if (Number.isNaN(startedAt)) return;
    const endedAt = lifecycle.endedAt ? Date.parse(lifecycle.endedAt) : Number.NaN;
    const hasEnded = !Number.isNaN(endedAt);
    const elapsed = hasEnded
      ? Math.max(0, Math.floor((endedAt - startedAt) / 1000))
      : Math.max(0, Math.floor((Date.now() - startedAt) / 1000));

    // The Realtime/data-channel timer can refine this anchor later. Until it
    // arrives, the session lifecycle still gives the student an accurate
    // elapsed value and lets an ended session remain frozen.
    if (hasEnded || !timerAnchorRef.current) {
      timerAnchorRef.current = {
        elapsed,
        timestamp: hasEnded ? Date.now() : Date.now(),
        paused: hasEnded,
      };
      setElapsedSeconds(elapsed);
    }
  }, [lifecycle.startedAt, lifecycle.endedAt]);
  useEffect(() => {
    if (rtc.dataChannelState !== 'open' || !shouldJoin) return;
    // The desktop teacher is the authoritative timer source. Requesting a
    // snapshot also covers a student that joined after the teacher's initial
    // timer-sync broadcast.
    rtc.sendDataMessage({ type: 'timer-request' });
  }, [rtc.dataChannelState, rtc.sendDataMessage, shouldJoin]);

  useEffect(() => {
    if (!shouldJoin) return;
    const interval = setInterval(() => {
      const anchor = timerAnchorRef.current;
      if (!anchor || anchor.paused) return;
      const drift = Math.max(0, Math.floor((Date.now() - anchor.timestamp) / 1000));
      setElapsedSeconds(anchor.elapsed + drift);
    }, 1000);
    return () => clearInterval(interval);
  }, [shouldJoin]);
  const [ending, setEnding] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const closeRoom = useCallback(async () => {
    void rtc.stop();
    if (isSessionCallActive) {
      isActiveRef.current = false;
      await endCall().catch(() => undefined);
    }
    if (isCurrentCall) clearCall();
    router.replace('/(tabs)/bookings');
  }, [clearCall, endCall, isCurrentCall, isSessionCallActive, rtc.stop]);

  useEffect(() => {
    isActiveRef.current = isSessionCallActive;
  }, [isSessionCallActive]);

  useEffect(() => {
    isCurrentCallRef.current = isCurrentCall;
  }, [isCurrentCall]);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void closeRoom();
      return true;
    });
    return () => subscription.remove();
  }, [closeRoom]);

  useEffect(() => {
    return () => {
      void rtc.stop();
      if (isActiveRef.current) void endCall().catch(() => undefined);
      if (isCurrentCallRef.current) clearCall();
    };
  }, [clearCall, endCall, rtc.stop]);

  useEffect(() => {
    const client = supabase;
    if (!bookingId || !client) return;
    setLifecycleError(null);
    void refreshLifecycle().catch((error: unknown) => {
      setLifecycleError(error instanceof Error ? error.message : 'تعذر تسجيل نهاية الجلسة.');
    });
    // Use a fresh topic for every effect subscription. React Strict Mode can
    // mount the screen twice before Supabase finishes removing the previous
    // channel, and reusing the topic makes postgres_changes throw synchronously.
    const channel = client
      .channel(`session-lifecycle-${bookingId}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `booking_id=eq.${bookingId}` }, () => {
        void refreshLifecycle();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `id=eq.${bookingId}` }, () => {
        void refreshLifecycle();
      });
    try {
      channel.subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Polling below remains the fallback when Realtime is unavailable.
          console.warn('تعذر الاشتراك الفوري في دورة حياة الجلسة:', status);
        }
      });
    } catch (error) {
      console.warn('تعذر تهيئة تحديثات دورة حياة الجلسة:', error);
    }
    return () => {
      void client.removeChannel(channel);
    };
  }, [bookingId, refreshLifecycle]);

  // Realtime is the fast path, but a mobile connection can miss a channel
  // event while the app is backgrounded or reconnecting. Poll the authoritative
  // booking/session state while this room is open so the join action appears
  // without requiring the student to leave and reopen the screen.
  useEffect(() => {
    if (!bookingId) return;
    const interval = setInterval(() => {
      void refreshLifecycle().catch(() => undefined);
    }, 2500);
    return () => clearInterval(interval);
  }, [bookingId, refreshLifecycle]);

  const finishCall = async () => {
    if (ending) return;
    setEnding(true);
    try {
      await rtc.stop();
      if (isSessionCallActive) await endCall();
      setJoinRequested(false);
      await refreshLifecycle();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'تعذر مغادرة الجلسة.';
      setLifecycleError(message);
      Alert.alert('تعذر مغادرة الجلسة', message);
    } finally {
      setEnding(false);
    }
  };

  const toggleRaiseHand = () => {
    const nextRaised = !handRaised;
    setHandRaised(nextRaised);
    rtc.sendDataMessage({
      type: 'hand-raise',
      event: 'hand-raise',
      raised: nextRaised,
      userId: profile?.id,
      timestamp: Date.now(),
    });
  };

  const renderFullscreenButton = (fullscreen = false) => (
    <Pressable
      testID={fullscreen ? 'close-session-fullscreen' : 'open-session-fullscreen'}
      onPress={() => setIsFullscreen(!fullscreen)}
      hitSlop={8}
      style={({ pressed }) => [styles.fullscreenButton, { backgroundColor: colors.primary + 'E6' }, pressed && styles.pressed]}
    >
      <Icon name={fullscreen ? 'minimize-2' : 'maximize-2'} size={17} color={colors.primaryForeground} />
    </Pressable>
  );

  const renderSessionTimer = (fullscreen = false) => (
    <Text style={[styles.elapsedText, { color: fullscreen ? colors.primaryForeground : colors.mutedForeground }]}>
      {elapsedSeconds > 0 || lifecycle.startedAt ? `الوقت المنقضي ${formatElapsed(elapsedSeconds)}` : 'بانتظار بدء الجلسة'}
    </Text>
  );

  const renderBalance = (fullscreen = false) => {
    const balance = studentDashboardQuery.data?.balance;
    const valueColor = fullscreen ? colors.primaryForeground : colors.mutedForeground;
    return (
      <View style={styles.balanceStat}>
        <Text style={[styles.balanceText, { color: valueColor }]}>
          {balance ? `رصيد الباقة ${balance.remainingMinutes} د` : studentDashboardQuery.isLoading ? 'جارٍ تحميل الرصيد…' : 'الرصيد غير متاح'}
        </Text>
        {balance ? <Text style={[styles.balanceSubtext, { color: valueColor }]}>{balance.sessionsRemaining} جلسة متبقية</Text> : null}
      </View>
    );
  };

  const renderSessionStats = (fullscreen = false) => (
    <View style={[styles.statsStrip, { backgroundColor: fullscreen ? colors.card + '22' : colors.muted, borderColor: fullscreen ? colors.primaryForeground + '26' : colors.border, marginBottom: fullscreen ? 0 : 9 }]}>
      <View style={styles.statItem}>
        <Text style={[styles.statValue, { color: fullscreen ? colors.primaryForeground : colors.foreground }]}>{formatElapsed(elapsedSeconds)}</Text>
        <Text style={[styles.statLabel, { color: fullscreen ? colors.tint : colors.mutedForeground }]}>الوقت المنقضي</Text>
      </View>
      <View style={[styles.statDivider, { backgroundColor: fullscreen ? colors.primaryForeground + '26' : colors.border }]} />
      <View style={styles.statItem}>
        {renderBalance(fullscreen)}
      </View>
    </View>
  );

  return (
    <Screen>
      <Header onBack={() => { void closeRoom(); }} avatarText={profile?.displayName?.slice(0, 1)} eyebrow="غرفة الجلسة" title="جلسة مباشرة" onAvatar={() => router.push('/profile')} />
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.tealSoft }]}>
          <Icon name={rtc.connectionState === 'connected' || isSessionCallActive ? 'phone' : 'video'} size={26} color={colors.teal} />
        </View>
        <Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>{rtc.connectionState === 'connected' ? 'الجلسة جارية الآن' : role === 'teacher' ? 'الجلسة تبدأ من الكمبيوتر' : canStudentJoin ? 'المعلم بدأ الجلسة' : 'بانتظار بدء المعلم'}</Text>
        <Text style={[styles.heroBody, { color: colors.tint }]}>{rtc.connectionState === 'connected' ? 'الصوت متصل بالطرف الآخر عبر WebRTC.' : role === 'teacher' ? 'لا يمكن بدء جلسة المعلم من الهاتف أو الجهاز اللوحي.' : isSessionCallActive ? `أنت متصل مع ${call?.callerName ?? 'المعلم'}` : canStudentJoin ? 'اضغط على الانضمام للدخول إلى غرفة الشرح.' : session ? `${session.subject} · ${session.duration}` : 'ستظهر تفاصيل الجلسة هنا عند فتحها.'}</Text>
      </View>

      <View style={[styles.roomCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.statusDot, { backgroundColor: rtc.connectionState === 'connected' ? colors.teal : lifecycle.status === 'in_progress' ? colors.accent : colors.mutedForeground }]} />
        <View style={styles.roomCopy}>
          <Text style={[styles.roomTitle, { color: colors.foreground }]}>{rtc.connectionState === 'connected' ? 'الاتصال الصوتي متصل' : session?.title ?? 'جلسة أجيال المعرفة'}</Text>
          <Text style={[styles.roomBody, { color: colors.mutedForeground }]}>{rtc.connectionState === 'connected' ? 'تم إنشاء اتصال WebRTC آمن.' : lifecycle.status === 'in_progress' ? 'بدأ المعلم الجلسة من الكمبيوتر.' : session ? `${session.date} · ${session.time}` : 'تم قبول الجلسة ويمكنك العودة إليها من الحجوزات.'}</Text>
        </View>
      </View>

      {shouldJoin ? (
        <View style={[styles.mediaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
           {renderSessionStats()}
          <View style={[styles.mediaStage, { backgroundColor: colors.primary }]}>
            <SessionVideo
              stream={rtc.remoteStream}
              nativeView={rtc.rtcView}
              label="بانتظار عرض المعلم"
              height={360}
              fit="contain"
              scale={displayScale}
            />
            {whiteboardVisible ? (
              <View style={[styles.whiteboardOverlay, { backgroundColor: colors.background }]}>
                <SessionWhiteboard
                  actions={whiteboardActions}
                  height={360}
                  canDraw={whiteboardCanDraw}
                  onAction={handleWhiteboardAction}
                />
                <View style={[styles.whiteboardOverlayLabel, { backgroundColor: colors.primary + 'E6' }]}>
                  <Icon name="edit-3" size={14} color={colors.tint} />
                  <Text style={[styles.mediaStageLabelText, { color: colors.primaryForeground }]}>{whiteboardCanDraw ? 'يمكنك الكتابة' : 'سبورة المعلم'}</Text>
                </View>
              </View>
            ) : null}
            <View style={[styles.mediaStageLabel, { backgroundColor: colors.primary + 'E6' }]}>
              <Icon name="monitor" size={14} color={colors.tint} />
              <Text style={[styles.mediaStageLabelText, { color: colors.primaryForeground }]}>عرض المعلم والسبورة</Text>
            </View>
            {renderFullscreenButton()}
          </View>
           <View style={[styles.mediaToolbar, { borderBottomColor: colors.border }]}>
            <View style={styles.zoomControls}>
              <Pressable testID="zoom-out-session" disabled={displayScale <= 1} onPress={() => setDisplayScale((value) => Math.max(1, Number((value - 0.25).toFixed(2))))} style={[styles.iconControl, { borderColor: colors.border, backgroundColor: colors.muted, opacity: displayScale <= 1 ? 0.45 : 1 }]}>
                <Icon name="minus" size={16} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.zoomValue, { color: colors.mutedForeground }]}>{Math.round(displayScale * 100)}%</Text>
              <Pressable testID="zoom-in-session" disabled={displayScale >= 2} onPress={() => setDisplayScale((value) => Math.min(2, Number((value + 0.25).toFixed(2))))} style={[styles.iconControl, { borderColor: colors.border, backgroundColor: colors.muted, opacity: displayScale >= 2 ? 0.45 : 1 }]}>
                <Icon name="plus" size={16} color={colors.foreground} />
              </Pressable>
              {displayScale > 1 ? (
                <Pressable testID="zoom-reset-session" onPress={() => setDisplayScale(1)} style={[styles.resetZoom, { borderColor: colors.border }]}>
                  <Text style={[styles.resetZoomText, { color: colors.primary }]}>إعادة</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <View style={[styles.sessionControlBar, { backgroundColor: colors.muted }]}>
            <Pressable testID="toggle-session-mute" onPress={rtc.toggleMute} style={[styles.sessionControl, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Icon name={rtc.muted ? 'mic-off' : 'mic'} size={17} color={rtc.muted ? colors.destructive : colors.teal} />
              <Text style={[styles.sessionControlText, { color: colors.foreground }]}>{rtc.muted ? 'إلغاء الكتم' : 'كتم الصوت'}</Text>
            </Pressable>
            <Pressable testID="toggle-raise-hand" onPress={toggleRaiseHand} style={[styles.sessionControl, { backgroundColor: handRaised ? colors.goldSoft : colors.card, borderColor: handRaised ? colors.accent : colors.border }]}>
              <Icon name="flag" size={17} color={handRaised ? colors.accentForeground : colors.primary} />
              <Text style={[styles.sessionControlText, { color: handRaised ? colors.accentForeground : colors.foreground }]}>{handRaised ? 'تم رفع اليد' : 'رفع اليد'}</Text>
            </Pressable>
            <Pressable testID="leave-live-session" disabled={ending} onPress={() => void finishCall()} style={[styles.sessionControl, styles.endControl, { backgroundColor: colors.destructive, borderColor: colors.destructive, opacity: ending ? 0.65 : 1 }]}>
              <Icon name="phone-off" size={17} color={colors.destructiveForeground} />
              <Text style={[styles.sessionControlText, { color: colors.destructiveForeground }]}>{ending ? 'جارٍ الإنهاء' : 'إنهاء'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal visible={isFullscreen && shouldJoin} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setIsFullscreen(false)}>
        <View style={[styles.fullscreenRoot, { backgroundColor: colors.primary }]}>
          <View style={styles.fullscreenHeader}>
            <Text style={[styles.fullscreenTitle, { color: colors.primaryForeground }]}>عرض المعلم والسبورة</Text>
            {renderFullscreenButton(true)}
          </View>
          <View style={[styles.fullscreenStage, { height: Math.max(280, windowHeight - 170) }]}>
            <SessionVideo
              stream={rtc.remoteStream}
              nativeView={rtc.rtcView}
              label="بانتظار عرض المعلم"
              height={Math.max(280, windowHeight - 170)}
              fit="contain"
              scale={displayScale}
            />
            {whiteboardVisible ? (
              <View style={[styles.whiteboardOverlay, { backgroundColor: colors.background }]}>
                <SessionWhiteboard
                  actions={whiteboardActions}
                  height={Math.max(280, windowHeight - 170)}
                  canDraw={whiteboardCanDraw}
                  onAction={handleWhiteboardAction}
                />
                <View style={[styles.whiteboardOverlayLabel, { backgroundColor: colors.primary + 'E6' }]}>
                  <Icon name="edit-3" size={14} color={colors.tint} />
                  <Text style={[styles.mediaStageLabelText, { color: colors.primaryForeground }]}>{whiteboardCanDraw ? 'يمكنك الكتابة' : 'سبورة المعلم'}</Text>
                </View>
              </View>
            ) : null}
          </View>
           <View style={[styles.fullscreenToolbar, { backgroundColor: colors.card }]}>
             {renderSessionStats(true)}
            <View style={styles.zoomControls}>
              <Pressable testID="fullscreen-zoom-out-session" disabled={displayScale <= 1} onPress={() => setDisplayScale((value) => Math.max(1, Number((value - 0.25).toFixed(2))))} style={[styles.iconControl, { borderColor: colors.border, backgroundColor: colors.muted, opacity: displayScale <= 1 ? 0.45 : 1 }]}>
                <Icon name="minus" size={16} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.zoomValue, { color: colors.mutedForeground }]}>{Math.round(displayScale * 100)}%</Text>
              <Pressable testID="fullscreen-zoom-in-session" disabled={displayScale >= 2} onPress={() => setDisplayScale((value) => Math.min(2, Number((value + 0.25).toFixed(2))))} style={[styles.iconControl, { borderColor: colors.border, backgroundColor: colors.muted, opacity: displayScale >= 2 ? 0.45 : 1 }]}>
                <Icon name="plus" size={16} color={colors.foreground} />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {role === 'teacher' ? (
        <View style={[styles.infoCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Icon name="monitor" size={17} color={colors.teal} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>بدء جلسة المعلم وإدارتها يتم من الكمبيوتر فقط، كما في منصة أجيال المعرفة.</Text>
        </View>
      ) : canStudentJoin && !shouldJoin ? (
        <Pressable testID="join-live-session" onPress={() => setJoinRequested(true)} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.teal }, pressed && styles.pressed]}>
          <Icon name="video" size={18} color={colors.primaryForeground} />
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>الانضمام إلى الجلسة</Text>
        </Pressable>
      ) : shouldJoin ? (
        <>
          <View style={[styles.connectionCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <View style={[styles.connectionDot, { backgroundColor: rtc.connectionState === 'connected' ? colors.teal : rtc.connectionState === 'failed' ? colors.destructive : colors.accent }]} />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>{rtc.connectionState === 'connected' ? `الصوت متصل ويمكن بدء الشرح.${rtc.dataChannelState === 'open' ? ' قناة مزامنة الجلسة جاهزة.' : ''}` : rtc.connectionState === 'failed' ? 'تعذر الاتصال. تحقق من الشبكة وحاول مرة أخرى.' : 'جارٍ الاتصال بالطرف الآخر…'}</Text>
          </View>
          {bookingId ? (
             <SessionCollaboration
              bookingId={bookingId}
              userId={profile?.id}
              sendDataMessage={rtc.sendDataMessage}
              dataChannelState={rtc.dataChannelState}
            />
          ) : null}
        </>
      ) : isCurrentCall && (call?.status === 'ended' || call?.status === 'declined') ? (
        <Pressable onPress={closeRoom} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>العودة للحجوزات</Text>
        </Pressable>
      ) : (
        <View style={[styles.infoCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Icon name="info" size={17} color={colors.teal} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>{lifecycle.endedAt ? 'انتهت هذه الجلسة.' : 'سيظهر زر الانضمام بعد أن يبدأ المعلم الجلسة من الكمبيوتر.'}</Text>
        </View>
      )}
      {rtc.mediaWarning ? (
        <View style={[styles.infoCard, { backgroundColor: colors.goldSoft, borderColor: colors.accent }]}>
          <Icon name="info" size={17} color={colors.accent} />
          <Text style={[styles.infoText, { color: colors.foreground }]}>{rtc.mediaWarning}</Text>
        </View>
      ) : null}
      {lifecycleError || rtc.error ? (
        <View style={[styles.errorCard, { backgroundColor: colors.destructive + '14', borderColor: colors.destructive }]}>
          <Icon name="alert-circle" size={17} color={colors.destructive} />
          <Text style={[styles.infoText, { color: colors.destructive }]}>{lifecycleError ?? rtc.error}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, padding: 20, alignItems: 'flex-end', minHeight: 180, justifyContent: 'center', marginBottom: 16 },
  heroIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  heroTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  heroBody: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 7, writingDirection: 'rtl', textAlign: 'right' },
  roomCard: { borderRadius: 18, borderWidth: 1, padding: 16, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 14 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  roomCopy: { flex: 1, alignItems: 'flex-end' },
  roomTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  roomBody: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 5, writingDirection: 'rtl', textAlign: 'right' },
  primaryButton: { minHeight: 52, borderRadius: 15, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 6 },
  primaryButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  infoCard: { borderRadius: 15, borderWidth: 1, padding: 15, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 9 },
  errorCard: { borderRadius: 15, borderWidth: 1, padding: 15, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 9, marginTop: 12 },
  connectionCard: { borderRadius: 15, borderWidth: 1, padding: 11, flexDirection: 'row-reverse', alignItems: 'center', gap: 9, marginTop: 6 },
  connectionDot: { width: 9, height: 9, borderRadius: 5 },
  muteButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mediaCard: { borderRadius: 18, borderWidth: 1, padding: 10, marginBottom: 10, position: 'relative' },
  mediaStage: { height: 360, borderRadius: 15, overflow: 'hidden', position: 'relative', justifyContent: 'center' },
  mediaStageLabel: { position: 'absolute', top: 10, right: 10, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  mediaStageLabelText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  mediaToolbar: { minHeight: 48, borderBottomWidth: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statsStrip: { minHeight: 54, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, marginBottom: 9, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around' },
  statItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  statValue: { fontSize: 11, fontFamily: 'Inter_700Bold', writingDirection: 'rtl', textAlign: 'center' },
  statLabel: { fontSize: 8, marginTop: 2, fontFamily: 'Inter_400Regular', writingDirection: 'rtl', textAlign: 'center' },
  statDivider: { width: 1, height: 27 },
  zoomControls: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  iconControl: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  zoomValue: { minWidth: 38, textAlign: 'center', fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  resetZoom: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 7 },
  resetZoomText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  sessionControlBar: { borderRadius: 13, padding: 7, marginTop: 9, flexDirection: 'row-reverse', gap: 6 },
  sessionControl: { flex: 1, minHeight: 44, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  endControl: { minWidth: 72 },
  sessionControlText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  elapsedText: { flex: 1, alignSelf: 'center', textAlign: 'right', writingDirection: 'rtl', fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  balanceStat: { alignItems: 'center', justifyContent: 'center' },
  balanceText: { textAlign: 'center', writingDirection: 'rtl', fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  balanceSubtext: { textAlign: 'center', writingDirection: 'rtl', fontSize: 8, marginTop: 2, fontFamily: 'Inter_400Regular' },
  fullscreenButton: { position: 'absolute', left: 10, top: 10, width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  fullscreenRoot: { flex: 1, padding: 14, justifyContent: 'space-between' },
  fullscreenHeader: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  fullscreenTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  fullscreenStage: { width: '100%', justifyContent: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: '#112D4E' },
  fullscreenToolbar: { minHeight: 58, borderRadius: 14, paddingHorizontal: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  whiteboardOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 1, justifyContent: 'center' },
  whiteboardOverlayLabel: { position: 'absolute', top: 10, right: 10, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  infoText: { flex: 1, textAlign: 'right', writingDirection: 'rtl', fontSize: 11, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  pressed: { opacity: 0.72 },
});