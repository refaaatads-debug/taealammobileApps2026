import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { supabase } from '@/lib/supabase';
import { AGORA_DISCONNECTED_WATCHDOG_MS, agoraRejoinDelayMs, agoraRejoinExhausted } from '@/lib/sessionAgoraRejoin';
import { MOBILE_AGORA_SESSION_PUBLISH_OPTIONS } from '@/lib/sessionMediaPolicy';
import { mapAgoraConnectionEvent } from '@/lib/sessionAgoraConnectionState';
import { logSessionEvent } from '@/lib/sessionTelemetry';
import { parseSessionTransport, type AgoraTransport } from '@/lib/sessionTransport';
import { invokeSessionTransportToken } from '@/lib/sessionTransportToken';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export type SessionDataMessage = {
  type: string;
  [key: string]: unknown;
};

type UseSessionAgoraOptions = {
  bookingId?: string;
  userId?: string;
  enabled: boolean;
  onRemoteJoin?: () => void;
  onRemoteLeave?: () => void;
  onDataMessage?: (message: SessionDataMessage) => void;
};

const SESSION_DEVICE_ID_KEY = 'ajyal-session-device-id';
const HEARTBEAT_INTERVAL_MS = 15_000;

async function getSessionDeviceId(): Promise<string> {
  const stored = await AsyncStorage.getItem(SESSION_DEVICE_ID_KEY);
  if (stored) return stored;
  const generated = `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(SESSION_DEVICE_ID_KEY, generated);
  return generated;
}

function parseSessionDataMessage(data: unknown): SessionDataMessage | null {
  let parsed: unknown = data;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const candidates = [record.type, record.event, record.kind, record.messageType, record.name]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const rawType = candidates.find((value) => /whiteboard|screen[-_:]?share|timer|hand[-_:]?raise/i.test(value))
    ?? candidates[0];
  if (typeof rawType !== 'string' || !rawType.trim()) return null;
  return { ...record, type: rawType };
}

export function useSessionAgora({
  bookingId,
  userId,
  enabled,
  onRemoteJoin,
  onRemoteLeave,
  onDataMessage,
}: UseSessionAgoraOptions) {
  const channelRef = useRef<any>(null);
  const agoraEngineRef = useRef<any>(null);
  const agoraWebSessionRef = useRef<any>(null);
  const agoraRemoteUidRef = useRef<string | number | null>(null);
  const dataReadyRef = useRef(false);
  const pendingDataMessagesRef = useRef<SessionDataMessage[]>([]);
  const startedRef = useRef(false);
  const generationRef = useRef(0);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionDeviceIdRef = useRef<string | null>(null);
  const heartbeatStartedRef = useRef(false);
  const heartbeatGenerationRef = useRef(0);
  const rejoinAttemptsRef = useRef(0);
  const rejoinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rejoinInFlightRef = useRef(false);
  const nativeDisconnectWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAgoraRejoinRef = useRef<(reason: string) => void>(() => undefined);
  const mutedRef = useRef(false);
  const speakerEnabledRef = useRef(true);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [muted, setMuted] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [dataChannelState, setDataChannelState] = useState<'closed' | 'connecting' | 'open'>('closed');
  const [transportProvider, setTransportProvider] = useState<'unknown' | 'agora'>('unknown');
  const [agoraRemoteUid, setAgoraRemoteUid] = useState<string | number | null>(null);
  const [agoraSurfaceView, setAgoraSurfaceView] = useState<any>(null);
  const [agoraWebRemoteVideoTrack, setAgoraWebRemoteVideoTrack] = useState<any>(null);
  const [agoraWebRemoteAudioTrack, setAgoraWebRemoteAudioTrack] = useState<any>(null);
  const [agoraWebAudioBlocked, setAgoraWebAudioBlocked] = useState(false);

  const sendDataMessage = useCallback((message: SessionDataMessage): boolean => {
    if (!bookingId || !userId) return false;
    const channel = channelRef.current;
    if (!channel || !dataReadyRef.current) {
      pendingDataMessagesRef.current = [...pendingDataMessagesRef.current.slice(-99), message];
      return true;
    }
    void channel.send({
      type: 'broadcast',
      event: 'session-data',
      payload: { senderId: userId, message },
    }).catch((reason: unknown) => {
      pendingDataMessagesRef.current = [...pendingDataMessagesRef.current.slice(-99), message];
      console.warn('تعذر إرسال مزامنة الحصة عبر Agora:', reason);
    });
    return true;
  }, [bookingId, userId]);

  const reportSessionEvent = useCallback((eventType: string, metadata?: Record<string, unknown>) => {
    void logSessionEvent({
      userId,
      bookingId,
      eventType,
      deviceId: sessionDeviceIdRef.current,
      metadata,
    });
  }, [bookingId, userId]);

  const clearRejoinTimer = useCallback(() => {
    if (rejoinTimerRef.current) {
      clearTimeout(rejoinTimerRef.current);
      rejoinTimerRef.current = null;
    }
  }, []);

  const clearNativeDisconnectWatchdog = useCallback(() => {
    if (nativeDisconnectWatchdogRef.current) {
      clearTimeout(nativeDisconnectWatchdogRef.current);
      nativeDisconnectWatchdogRef.current = null;
    }
  }, []);

  const resetRejoinState = useCallback(() => {
    rejoinAttemptsRef.current = 0;
    rejoinInFlightRef.current = false;
    clearRejoinTimer();
  }, [clearRejoinTimer]);

  const writeSessionHeartbeat = useCallback(async (isConnected: boolean) => {
    if (!supabase || !bookingId || !userId) return;
    try {
      const deviceId = sessionDeviceIdRef.current ?? await getSessionDeviceId();
      sessionDeviceIdRef.current = deviceId;
      const now = new Date().toISOString();
      const existing = await supabase
        .from('active_sessions')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .limit(1)
        .maybeSingle();
      if (existing.error) {
        console.warn('تعذر قراءة نبضة جلسة الطالب:', existing.error.message);
        return;
      }
      const payload = {
        booking_id: bookingId,
        user_id: userId,
        device_id: deviceId,
        is_connected: isConnected,
        last_heartbeat: now,
        disconnected_at: isConnected ? null : now,
      };
      const result = existing.data?.id
        ? await supabase.from('active_sessions').update(payload).eq('id', existing.data.id)
        : await supabase.from('active_sessions').insert(payload);
      if (result.error) console.warn('تعذر تحديث نبضة جلسة الطالب:', result.error.message);
    } catch (reason) {
      console.warn('تعذر تحديث حالة اتصال الطالب:', reason);
    }
  }, [bookingId, userId]);

  const startSessionHeartbeat = useCallback(async () => {
    if (!bookingId || !userId || heartbeatStartedRef.current) return;
    heartbeatStartedRef.current = true;
    const generation = ++heartbeatGenerationRef.current;
    await writeSessionHeartbeat(true);
    if (!heartbeatStartedRef.current || generation !== heartbeatGenerationRef.current) return;
    heartbeatTimerRef.current = setInterval(() => {
      void writeSessionHeartbeat(true);
    }, HEARTBEAT_INTERVAL_MS);
  }, [bookingId, userId, writeSessionHeartbeat]);

  const stopSessionHeartbeat = useCallback(async () => {
    if (!heartbeatStartedRef.current) return;
    heartbeatStartedRef.current = false;
    heartbeatGenerationRef.current += 1;
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    await writeSessionHeartbeat(false);
  }, [writeSessionHeartbeat]);

  const subscribeSessionData = useCallback((routeWarning: string | null = null) => {
    if (!supabase || !bookingId) throw new Error('خدمة الحصة غير متاحة.');
    const channel = supabase
      .channel(`webrtc-${bookingId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'session-data' }, (event: any) => {
        if (event.payload?.senderId !== userId && event.payload?.message) {
          const message = parseSessionDataMessage(event.payload.message);
          if (message) onDataMessage?.(message);
        }
      });
    channelRef.current = channel;
    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        dataReadyRef.current = true;
        setDataChannelState('open');
        setMediaWarning(routeWarning);
        for (const message of pendingDataMessagesRef.current.splice(0)) sendDataMessage(message);
        sendDataMessage({ type: 'join', userId });
        void startSessionHeartbeat().catch(() => setError('تعذر تحديث حالة الحصة.'));
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        dataReadyRef.current = false;
        setDataChannelState('closed');
        setMediaWarning('الصوت يعمل، لكن تعذرت مزامنة السبورة والمحادثة مؤقتاً.');
      }
    });
  }, [bookingId, onDataMessage, sendDataMessage, startSessionHeartbeat, userId]);

  const startAgoraWeb = useCallback(async (transport: AgoraTransport) => {
    const { joinAgoraWebSession } = await import('@/lib/sessionAgoraWeb');
    if (!channelRef.current) subscribeSessionData();
    const session = await joinAgoraWebSession(transport, {
      onRemoteUserJoined: (uid) => {
        agoraRemoteUidRef.current = uid;
        setAgoraRemoteUid(uid);
        setConnectionState('connecting');
        onRemoteJoin?.();
      },
      onRemoteUserLeft: (uid) => {
        if (agoraRemoteUidRef.current === uid) agoraRemoteUidRef.current = null;
        setAgoraRemoteUid((current) => current === uid ? null : current);
        setConnectionState('disconnected');
        onRemoteLeave?.();
      },
      onRemoteAudio: (state, uid) => {
        agoraRemoteUidRef.current = uid;
        setAgoraRemoteUid(uid);
        if (state === 'playing') setConnectionState('connected');
        else if (state === 'starting') setConnectionState('connecting');
        else if (state === 'failed') {
          setConnectionState('failed');
          setError('انضم الطرف الآخر، لكن تعذر تشغيل صوته.');
        } else setConnectionState('disconnected');
      },
      onRemoteVideo: setAgoraWebRemoteVideoTrack,
      onRemoteAudioTrack: setAgoraWebRemoteAudioTrack,
      onAutoplayBlocked: () => {
        setConnectionState('connecting');
        setAgoraWebAudioBlocked(true);
        setMediaWarning('وصل صوت الطرف الآخر؛ اضغط زر تفعيل الصوت إذا لم تسمعه.');
      },
      onTokenWillExpire: async () => {
        const data = await invokeSessionTransportToken(bookingId!);
        const renewed = parseSessionTransport(data);
        if (renewed.uid !== userId) throw new Error('رد تجديد رمز Agora غير صالح.');
        return renewed.token;
      },
      onTokenError: (reason) => {
        setConnectionState('failed');
        setError(reason instanceof Error ? reason.message : 'تعذر تجديد رمز Agora.');
      },
      onReconnecting: (reconnecting) => {
        if (reconnecting) {
          setConnectionState('connecting');
          return;
        }
        if (rejoinInFlightRef.current || rejoinAttemptsRef.current > 0) {
          reportSessionEvent('session_agora_rejoin_success', { platform: Platform.OS });
          resetRejoinState();
        }
      },
      onHardDisconnect: () => scheduleAgoraRejoinRef.current('web_disconnected_watchdog'),
    });
    agoraWebSessionRef.current = session;
    if (session.microphoneWarning) setMediaWarning(session.microphoneWarning);
  }, [bookingId, onRemoteJoin, onRemoteLeave, reportSessionEvent, resetRejoinState, subscribeSessionData, userId]);

  const startAgoraNative = useCallback(async (transport: AgoraTransport) => {
    if (transport.uid !== userId) throw new Error('معرّف مستخدم Agora لا يطابق الحساب الحالي.');
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) throw new Error('يلزم السماح باستخدام الميكروفون للانضمام إلى الحصة.');
    let bluetoothRouteWarning: string | null = null;
    if (Platform.OS === 'android' && Number(Platform.Version) >= 31) {
      try {
        const bluetoothPermission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          {
            title: 'السماح بسماعات البلوتوث',
            message: 'يتيح هذا الإذن توجيه صوت الحصة إلى سماعات البلوتوث المتصلة.',
            buttonPositive: 'سماح',
            buttonNegative: 'ليس الآن',
            buttonNeutral: 'لاحقًا',
          },
        );
        if (bluetoothPermission !== PermissionsAndroid.RESULTS.GRANTED) {
          bluetoothRouteWarning = 'يمكنك متابعة الحصة، لكن توجيه الصوت إلى سماعة Bluetooth غير متاح دون الإذن.';
        }
      } catch {
        bluetoothRouteWarning = 'تعذر التحقق من إذن سماعات Bluetooth؛ سيستمر صوت الحصة عبر مخرج الجهاز الافتراضي.';
      }
    }
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: !speakerEnabledRef.current,
    });

    const agora = await import('react-native-agora');
    const engine = agora.createAgoraRtcEngine();
    agoraEngineRef.current = engine;
    setAgoraSurfaceView(() => agora.RtcSurfaceView);
    engine.initialize({
      appId: transport.appId,
      channelProfile: agora.ChannelProfileType.ChannelProfileCommunication,
    });
    engine.enableAudio();
    // Video decoding is enabled only to receive the teacher's shared screen.
    // The mobile client never starts a camera or publishes screen capture.
    engine.enableVideo();
    engine.setClientRole(agora.ClientRoleType.ClientRoleBroadcaster);
    engine.setEnableSpeakerphone(speakerEnabledRef.current);
    engine.registerEventHandler({
      onJoinChannelSuccess: () => setConnectionState(mapAgoraConnectionEvent('joined-channel')),
      onConnectionStateChanged: (_connection: unknown, state: number, reason: number) => {
        reportSessionEvent('agora_connection_state_changed', { state, reasonCode: reason, platform: Platform.OS });
        if (state === agora.ConnectionStateType.ConnectionStateConnected) {
          clearNativeDisconnectWatchdog();
          if (rejoinInFlightRef.current || rejoinAttemptsRef.current > 0) {
            reportSessionEvent('session_agora_rejoin_success', { platform: Platform.OS });
            resetRejoinState();
          }
          setConnectionState(mapAgoraConnectionEvent('joined-channel'));
        } else if (
          state === agora.ConnectionStateType.ConnectionStateConnecting
          || state === agora.ConnectionStateType.ConnectionStateReconnecting
        ) {
          setConnectionState('connecting');
        } else if (state === agora.ConnectionStateType.ConnectionStateDisconnected) {
          setConnectionState('disconnected');
          clearNativeDisconnectWatchdog();
          nativeDisconnectWatchdogRef.current = setTimeout(() => {
            nativeDisconnectWatchdogRef.current = null;
            scheduleAgoraRejoinRef.current('native_disconnected_watchdog');
          }, AGORA_DISCONNECTED_WATCHDOG_MS);
        } else if (state === agora.ConnectionStateType.ConnectionStateFailed) {
          clearNativeDisconnectWatchdog();
          reportSessionEvent('session_agora_connection_failed', { reasonCode: reason });
          scheduleAgoraRejoinRef.current('connection_failed');
        }
      },
      onConnectionLost: () => {
        reportSessionEvent('session_agora_connection_lost', {});
        scheduleAgoraRejoinRef.current('connection_lost');
      },
      onUserJoined: (_connection: unknown, uid: number) => {
        reportSessionEvent('agora_user_joined', { uid, platform: Platform.OS });
        agoraRemoteUidRef.current = uid;
        setAgoraRemoteUid(uid);
        setConnectionState(mapAgoraConnectionEvent('remote-joined'));
        onRemoteJoin?.();
      },
      onRemoteAudioStateChanged: (_connection: unknown, uid: number, state: number) => {
        reportSessionEvent('agora_remote_audio_state', { uid, state, platform: Platform.OS });
        if (agoraRemoteUidRef.current !== uid) return;
        if (state === agora.RemoteAudioState.RemoteAudioStateDecoding) {
          setConnectionState(mapAgoraConnectionEvent('remote-audio-playing'));
        } else if (state === agora.RemoteAudioState.RemoteAudioStateStarting) {
          setConnectionState(mapAgoraConnectionEvent('remote-audio-starting'));
        } else if (state === agora.RemoteAudioState.RemoteAudioStateFailed) {
          setConnectionState(mapAgoraConnectionEvent('error'));
          setError('انضم الطرف الآخر، لكن تعذر تشغيل صوته.');
        } else if (
          state === agora.RemoteAudioState.RemoteAudioStateStopped
          || state === agora.RemoteAudioState.RemoteAudioStateFrozen
        ) {
          setConnectionState(mapAgoraConnectionEvent('remote-audio-interrupted'));
        }
      },
      onUserOffline: (_connection: unknown, uid: number, reason?: number) => {
        reportSessionEvent('agora_user_left', { uid, reasonCode: reason ?? null, platform: Platform.OS });
        if (agoraRemoteUidRef.current === uid) agoraRemoteUidRef.current = null;
        setAgoraRemoteUid((current) => current === uid ? null : current);
        setConnectionState(mapAgoraConnectionEvent('remote-left'));
        onRemoteLeave?.();
      },
      onTokenPrivilegeWillExpire: async () => {
        try {
          if (!supabase || !bookingId) return;
          const data = await invokeSessionTransportToken(bookingId);
          const renewed = parseSessionTransport(data);
          if (renewed.uid !== userId) throw new Error('رد تجديد رمز Agora غير صالح.');
          engine.renewToken(renewed.token);
        } catch (reason) {
          reportSessionEvent('agora_token_renewal_failed', { platform: Platform.OS });
          setError(reason instanceof Error ? reason.message : 'تعذر تجديد رمز Agora.');
        }
      },
      onError: (_code: number, message: string) => {
        setConnectionState(mapAgoraConnectionEvent('error'));
        setError(message || 'تعذر الاتصال بخدمة Agora.');
      },
    });

    if (!channelRef.current) subscribeSessionData(bluetoothRouteWarning);
    void startSessionHeartbeat().catch(() => setError('تعذر تحديث حالة الحصة.'));
    const joinResult = engine.joinChannelWithUserAccount(
      transport.token,
      transport.channel,
      transport.uid,
      MOBILE_AGORA_SESSION_PUBLISH_OPTIONS,
    );
    if (joinResult < 0) throw new Error(`تعذر الانضمام إلى Agora (رمز ${joinResult}).`);
  }, [bookingId, clearNativeDisconnectWatchdog, onRemoteJoin, onRemoteLeave, reportSessionEvent, resetRejoinState, startSessionHeartbeat, subscribeSessionData, userId]);

  const startAgora = useCallback(async (transport: AgoraTransport) => {
    if (Platform.OS === 'web') await startAgoraWeb(transport);
    else await startAgoraNative(transport);
  }, [startAgoraNative, startAgoraWeb]);

  const performAgoraRejoin = useCallback(async (reason: string, attempt: number) => {
    if (!startedRef.current || !bookingId || !userId) {
      rejoinInFlightRef.current = false;
      return;
    }
    const generation = generationRef.current;
    setConnectionState('connecting');
    reportSessionEvent('session_agora_rejoin_attempt', { attempt: attempt + 1, reason, platform: Platform.OS });
    try {
      const data = await invokeSessionTransportToken(bookingId);
      if (generation !== generationRef.current || !startedRef.current) return;
      const transport = parseSessionTransport(data);
      if (transport.uid !== userId) throw new Error('رد تجديد رمز Agora غير صالح.');
      if (transport.expiresAt <= Math.floor(Date.now() / 1000)) {
        throw new Error('انتهت صلاحية رمز الحصة؛ أعد المحاولة.');
      }
      if (Platform.OS === 'web') {
        await agoraWebSessionRef.current?.leave().catch(() => undefined);
        agoraWebSessionRef.current = null;
        await startAgoraWeb(transport);
        if (mutedRef.current) {
          try {
            await agoraWebSessionRef.current?.microphoneTrack?.setEnabled(false);
          } catch {
            // The fresh microphone track stays enabled; the next mute toggle fixes it.
          }
        }
      } else {
        const engine = agoraEngineRef.current;
        if (!engine) throw new Error('محرك Agora غير متاح لإعادة الانضمام.');
        engine.leaveChannel();
        const joinResult = engine.joinChannelWithUserAccount(
          transport.token,
          transport.channel,
          transport.uid,
          MOBILE_AGORA_SESSION_PUBLISH_OPTIONS,
        );
        if (joinResult < 0) throw new Error(`تعذرت إعادة الانضمام إلى Agora (رمز ${joinResult}).`);
        if (mutedRef.current) engine.muteLocalAudioStream(true);
      }
    } catch (rejoinError) {
      rejoinInFlightRef.current = false;
      reportSessionEvent('session_agora_rejoin_failed', {
        attempt: attempt + 1,
        reason,
        message: rejoinError instanceof Error ? rejoinError.message : String(rejoinError),
      });
      scheduleAgoraRejoinRef.current(reason);
    }
  }, [bookingId, reportSessionEvent, startAgoraWeb, userId]);

  const scheduleAgoraRejoin = useCallback((reason: string) => {
    if (!startedRef.current) return;
    if (rejoinInFlightRef.current || rejoinTimerRef.current) return;
    if (agoraRejoinExhausted(rejoinAttemptsRef.current)) {
      setConnectionState('failed');
      setError('تعذرت إعادة الاتصال بالحصة بعد عدة محاولات. أعد فتح الحصة.');
      reportSessionEvent('session_agora_rejoin_exhausted', { reason, attempts: rejoinAttemptsRef.current });
      return;
    }
    const attempt = rejoinAttemptsRef.current;
    rejoinAttemptsRef.current = attempt + 1;
    const delay = agoraRejoinDelayMs(attempt);
    reportSessionEvent('session_agora_rejoin_scheduled', { attempt: attempt + 1, reason, delayMs: delay });
    rejoinTimerRef.current = setTimeout(() => {
      rejoinTimerRef.current = null;
      if (!startedRef.current) return;
      rejoinInFlightRef.current = true;
      void performAgoraRejoin(reason, attempt);
    }, delay);
  }, [performAgoraRejoin, reportSessionEvent]);

  scheduleAgoraRejoinRef.current = scheduleAgoraRejoin;

  const stop = useCallback(async () => {
    generationRef.current += 1;
    startedRef.current = false;
    clearRejoinTimer();
    clearNativeDisconnectWatchdog();
    rejoinAttemptsRef.current = 0;
    rejoinInFlightRef.current = false;
    await stopSessionHeartbeat();
    if (channelRef.current) {
      if (dataReadyRef.current) sendDataMessage({ type: 'leave', userId });
      dataReadyRef.current = false;
      if (supabase) await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (agoraWebSessionRef.current) {
      await agoraWebSessionRef.current.leave().catch(() => undefined);
      agoraWebSessionRef.current = null;
    }
    if (agoraEngineRef.current) {
      try {
        agoraEngineRef.current.leaveChannel();
        agoraEngineRef.current.release();
      } catch {
        // The native engine may already be released after an interrupted join.
      }
      agoraEngineRef.current = null;
    }
    pendingDataMessagesRef.current = [];
    agoraRemoteUidRef.current = null;
    setMuted(false);
    setAgoraRemoteUid(null);
    setAgoraSurfaceView(null);
    setAgoraWebRemoteVideoTrack(null);
    setAgoraWebRemoteAudioTrack(null);
    setAgoraWebAudioBlocked(false);
    setConnectionState('idle');
    setDataChannelState('closed');
    setMediaWarning(null);
    setTransportProvider('unknown');
  }, [clearNativeDisconnectWatchdog, clearRejoinTimer, sendDataMessage, stopSessionHeartbeat, userId]);

  const start = useCallback(async () => {
    if (startedRef.current || !bookingId || !userId || !supabase) return;
    const generation = ++generationRef.current;
    startedRef.current = true;
    resetRejoinState();
    setConnectionState('connecting');
    setError(null);
    setMediaWarning(null);
    try {
      const data = await invokeSessionTransportToken(bookingId);
      if (generation !== generationRef.current) return;
      const transport = parseSessionTransport(data);
      if (transport.expiresAt <= Math.floor(Date.now() / 1000)) {
        throw new Error('انتهت صلاحية رمز الحصة؛ أعد المحاولة.');
      }
      if (transport.uid !== userId) throw new Error('معرّف مستخدم Agora لا يطابق الحساب الحالي.');
      setTransportProvider('agora');
      await startAgora(transport);
      if (generation !== generationRef.current) await stop();
    } catch (reason) {
      if (generation !== generationRef.current) return;
      await stop();
      setConnectionState('failed');
      setError(reason instanceof Error ? reason.message : 'تعذر بدء الصوت المباشر عبر Agora.');
    }
  }, [bookingId, resetRejoinState, startAgora, stop, userId]);

  useEffect(() => {
    if (enabled) void start();
    else void stop();
    return () => {
      void stop();
    };
  }, [enabled, start, stop]);

  const toggleMute = useCallback(() => {
    const nextMuted = !muted;
    mutedRef.current = nextMuted;
    if (agoraWebSessionRef.current?.microphoneTrack) {
      void agoraWebSessionRef.current.microphoneTrack.setEnabled(!nextMuted);
    } else {
      agoraEngineRef.current?.muteLocalAudioStream(nextMuted);
    }
    setMuted(nextMuted);
  }, [muted]);

  const toggleSpeaker = useCallback(async () => {
    if (Platform.OS === 'web') {
      setError('يتحكم المتصفح ونظام الجهاز بمخرج الصوت؛ غيّر مستوى الصوت من إعداداته.');
      return;
    }
    const nextSpeakerEnabled = !speakerEnabledRef.current;
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: !nextSpeakerEnabled,
      });
      agoraEngineRef.current?.setEnableSpeakerphone(nextSpeakerEnabled);
      speakerEnabledRef.current = nextSpeakerEnabled;
      setSpeakerEnabled(nextSpeakerEnabled);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر تغيير مخرج الصوت.');
    }
  }, []);

  const resumeAgoraAudio = useCallback(async () => {
    try {
      await agoraWebSessionRef.current?.resumeAudio();
      setAgoraWebAudioBlocked(false);
      setMediaWarning(null);
    } catch {
      setAgoraWebAudioBlocked(true);
    }
  }, []);

  return {
    connectionState,
    muted,
    speakerEnabled,
    error,
    mediaWarning,
    dataChannelState,
    transportProvider,
    agoraRemoteUid,
    agoraSurfaceView,
    agoraWebRemoteVideoTrack,
    agoraWebRemoteAudioTrack,
    agoraWebAudioBlocked,
    resumeAgoraAudio,
    start,
    stop,
    toggleMute,
    toggleSpeaker,
    sendDataMessage,
  };
}
