import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { supabase } from '@/lib/supabase';
import { parseInternalCallTransport } from '@/lib/internalCallTransport';

type InternalCall = {
  id: string;
  callerId?: string;
  roomId?: string;
  status: string;
};

type AgoraEngine = {
  initialize(options: unknown): number | void;
  enableAudio(): number;
  setClientRole(role: number): number;
  joinChannelWithUserAccount(token: string, channel: string, userAccount: string, options?: unknown): number;
  leaveChannel(): number;
  release(): void;
  muteLocalAudioStream(muted: boolean): number;
  setEnableSpeakerphone(enabled: boolean): number;
  renewToken(token: string): number;
  registerEventHandler(handler: Record<string, (...args: any[]) => void>): void;
};

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'failed';

export function useInternalCallAgora({
  call,
  userId,
  enabled,
}: {
  call: InternalCall | null;
  userId?: string;
  enabled: boolean;
}) {
  const callId = call?.id;
  const agoraEngineRef = useRef<AgoraEngine | null>(null);
  const agoraWebSessionRef = useRef<any>(null);
  const startedRef = useRef(false);
  const connectedRef = useRef(false);
  const generationRef = useRef(0);
  const speakerEnabledRef = useRef(true);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [muted, setMuted] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransport = useCallback(async () => {
    if (!supabase || !callId || !userId) throw new Error('خدمة المكالمات غير متاحة.');
    const { data, error: tokenError } = await supabase.functions.invoke('internal-call-transport-token', {
      body: { callId },
    });
    if (tokenError) throw tokenError;
    return parseInternalCallTransport(data, userId);
  }, [callId, userId]);

  const markConnected = useCallback(() => {
    if (connectedRef.current || !callId || !supabase) return;
    connectedRef.current = true;
    setConnectionState('connected');
    void supabase.rpc('mark_internal_call_connected', { p_call_id: callId }).then(({ error: rpcError }) => {
      if (rpcError) console.warn('تعذر تحديث حالة اتصال المكالمة:', rpcError.message);
    });
  }, [callId]);

  const stop = useCallback(async () => {
    generationRef.current += 1;
    startedRef.current = false;
    connectedRef.current = false;
    if (agoraWebSessionRef.current) {
      await agoraWebSessionRef.current.leave().catch(() => undefined);
      agoraWebSessionRef.current = null;
    }
    if (agoraEngineRef.current) {
      try {
        agoraEngineRef.current.leaveChannel();
        agoraEngineRef.current.release();
      } catch {
        // Cleanup may follow an interrupted native initialization.
      }
      agoraEngineRef.current = null;
    }
    setMuted(false);
    setConnectionState('idle');
  }, []);

  const start = useCallback(async () => {
    if (startedRef.current || !enabled || !callId || !userId || !supabase) return;
    const generation = ++generationRef.current;
    startedRef.current = true;
    connectedRef.current = false;
    setConnectionState('connecting');
    setError(null);
    try {
      const transport = await fetchTransport();
      if (generation !== generationRef.current) return;
      const agoraTransport = {
        provider: 'agora' as const,
        appId: transport.appId,
        channel: transport.channel,
        uid: transport.userAccount,
        token: transport.token,
        expiresAt: transport.expiresAt,
      };

      if (Platform.OS === 'web') {
        const { joinAgoraWebSession } = await import('@/lib/sessionAgoraWeb');
        const session = await joinAgoraWebSession(agoraTransport, {
          onRemoteUserJoined: () => markConnected(),
          onRemoteAudio: (state) => {
            if (state === 'playing') markConnected();
            else if (state === 'failed') {
              setConnectionState('failed');
              setError('انضم الطرف الآخر، لكن تعذر تشغيل صوته.');
            }
          },
          onTokenWillExpire: async () => (await fetchTransport()).token,
          onTokenError: (reason) => {
            setConnectionState('failed');
            setError(reason instanceof Error ? reason.message : 'تعذر تجديد رمز Agora.');
          },
        });
        if (generation !== generationRef.current) {
          await session.leave();
          return;
        }
        agoraWebSessionRef.current = session;
        markConnected();
        if (session.microphoneWarning) setError(session.microphoneWarning);
        return;
      }

      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('يلزم السماح بالميكروفون لقبول مكالمة Agora.');
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
        shouldRouteThroughEarpiece: !speakerEnabledRef.current,
      });
      if (generation !== generationRef.current) return;

      const agora = await import('react-native-agora');
      const engine = agora.createAgoraRtcEngine() as unknown as AgoraEngine;
      agoraEngineRef.current = engine;
      engine.initialize({
        appId: transport.appId,
        channelProfile: agora.ChannelProfileType.ChannelProfileCommunication,
      });
      engine.enableAudio();
      engine.setClientRole(agora.ClientRoleType.ClientRoleBroadcaster);
      engine.setEnableSpeakerphone(speakerEnabledRef.current);
      engine.registerEventHandler({
        onJoinChannelSuccess: () => markConnected(),
        onUserJoined: () => markConnected(),
        onTokenPrivilegeWillExpire: async () => {
          try {
            engine.renewToken((await fetchTransport()).token);
          } catch (reason) {
            setConnectionState('failed');
            setError(reason instanceof Error ? reason.message : 'تعذر تجديد رمز Agora.');
          }
        },
        onError: (_code: number, message: string) => {
          setConnectionState('failed');
          setError(message || 'تعذر الاتصال بخدمة Agora.');
        },
      });
      const joinResult = engine.joinChannelWithUserAccount(
        transport.token,
        transport.channel,
        transport.userAccount,
        { publishMicrophoneTrack: true, publishCameraTrack: false },
      );
      if (joinResult < 0) throw new Error(`تعذر الانضمام إلى Agora (رمز ${joinResult}).`);
    } catch (reason) {
      if (generation !== generationRef.current) return;
      await stop();
      setConnectionState('failed');
      setError(reason instanceof Error ? reason.message : 'تعذر بدء المكالمة الصوتية عبر Agora.');
    }
  }, [callId, enabled, fetchTransport, markConnected, stop, userId]);

  useEffect(() => {
    if (enabled) void start();
    else void stop();
    return () => {
      void stop();
    };
  }, [enabled, start, stop]);

  const toggleMute = useCallback(() => {
    const nextMuted = !muted;
    if (agoraWebSessionRef.current?.microphoneTrack) {
      void agoraWebSessionRef.current.microphoneTrack.setEnabled(!nextMuted);
    } else {
      agoraEngineRef.current?.muteLocalAudioStream(nextMuted);
    }
    setMuted(nextMuted);
  }, [muted]);

  const toggleSpeaker = useCallback(() => {
    if (Platform.OS === 'web') {
      setError('يتحكم المتصفح ونظام الجهاز بمخرج الصوت؛ غيّر مستوى الصوت من إعداداته.');
      return;
    }
    const nextSpeakerEnabled = !speakerEnabledRef.current;
    speakerEnabledRef.current = nextSpeakerEnabled;
    setSpeakerEnabled(nextSpeakerEnabled);
    void setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      shouldRouteThroughEarpiece: !nextSpeakerEnabled,
    }).then(() => {
      agoraEngineRef.current?.setEnableSpeakerphone(nextSpeakerEnabled);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'تعذر تغيير مخرج الصوت.');
    });
  }, []);

  return { connectionState, muted, error, speakerEnabled, start, stop, toggleMute, toggleSpeaker };
}
