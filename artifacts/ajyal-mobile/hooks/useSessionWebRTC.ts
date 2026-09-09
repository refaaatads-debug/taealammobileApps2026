import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioModeAsync } from 'expo-audio';
import { supabase } from '@/lib/supabase';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';
export type SessionDataMessage = {
  type: string;
  [key: string]: unknown;
};
type RtcModule = {
  RTCPeerConnection: new (configuration?: unknown) => any;
  RTCIceCandidate: new (candidate: unknown) => any;
  RTCSessionDescription: new (description: unknown) => any;
  MediaStream?: new (tracks?: any[]) => any;
  RTCView?: any;
  mediaDevices?: { getUserMedia(constraints: unknown): Promise<any> };
  registerGlobals?: () => void;
};

type UseSessionWebRTCOptions = {
  bookingId?: string;
  userId?: string;
  enabled: boolean;
  onRemoteJoin?: () => void;
  onRemoteLeave?: () => void;
  onDataMessage?: (message: SessionDataMessage) => void;
};

const WEBRTC_BUILD_MESSAGE = 'الفيديو والصوت داخل الجلسة يحتاجان إلى Development Build، وهما غير متاحين داخل Expo Go.';
const SESSION_DEVICE_ID_KEY = 'ajyal-session-device-id';
const HEARTBEAT_INTERVAL_MS = 15_000;

async function getSessionDeviceId(): Promise<string> {
  const stored = await AsyncStorage.getItem(SESSION_DEVICE_ID_KEY);
  if (stored) return stored;
  const generated = `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(SESSION_DEVICE_ID_KEY, generated);
  return generated;
}

function injectOpusParams(sdp: string): string {
  const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!opusMatch) return sdp;
  const payloadType = opusMatch[1];
  const params = 'useinbandfec=1;minptime=20;maxaveragebitrate=128000;maxplaybackrate=48000;stereo=0;sprop-stereo=0';
  const fmtpPattern = new RegExp(`a=fmtp:${payloadType} `);
  if (fmtpPattern.test(sdp)) {
    return sdp.replace(new RegExp(`(a=fmtp:${payloadType} [^\\r\\n]*)`), (line) => (
      line.includes('useinbandfec') ? line : `${line};${params}`
    ));
  }
  return sdp.replace(
    `a=rtpmap:${payloadType} opus/48000/2`,
    `a=rtpmap:${payloadType} opus/48000/2\na=fmtp:${payloadType} ${params}`,
  );
}

function parseDataChannelMessage(data: unknown): SessionDataMessage | null {
  let parsed: unknown = data;
  if (data instanceof ArrayBuffer) {
    const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
    if (!decoder) return null;
    parsed = decoder.decode(new Uint8Array(data));
  } else if (ArrayBuffer.isView(data)) {
    const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
    if (!decoder) return null;
    parsed = decoder.decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
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

async function getRtcModule(): Promise<RtcModule> {
  if (Platform.OS !== 'web') {
    if (!(NativeModules as { WebRTCModule?: unknown }).WebRTCModule) {
      throw new Error(WEBRTC_BUILD_MESSAGE);
    }
    try {
      const native = await import('react-native-webrtc');
      native.registerGlobals?.();
      return native as unknown as RtcModule;
    } catch {
      throw new Error(WEBRTC_BUILD_MESSAGE);
    }
  }
  const browser = globalThis as typeof globalThis & {
    RTCPeerConnection?: RtcModule['RTCPeerConnection'];
    RTCIceCandidate?: RtcModule['RTCIceCandidate'];
    RTCSessionDescription?: RtcModule['RTCSessionDescription'];
    MediaStream?: RtcModule['MediaStream'];
  };
  if (!browser.RTCPeerConnection) {
    throw new Error('المتصفح لا يدعم الصوت المباشر في هذه الجلسة.');
  }
  return {
    RTCPeerConnection: browser.RTCPeerConnection,
    RTCIceCandidate: browser.RTCIceCandidate!,
    RTCSessionDescription: browser.RTCSessionDescription!,
    MediaStream: browser.MediaStream,
    mediaDevices: typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined,
  };
}

let cachedIce: { servers: unknown[]; expiresAt: number } | null = null;

async function getIceServers(): Promise<unknown[]> {
  if (cachedIce && cachedIce.expiresAt - 60_000 > Date.now()) return cachedIce.servers;
  try {
    if (supabase) {
      const { data, error } = await supabase.functions.invoke('turn-credentials');
      if (error) throw error;
      if (Array.isArray(data?.iceServers) && data.iceServers.length) {
        const servers = data.iceServers as unknown[];
        cachedIce = { servers, expiresAt: Date.now() + (Number(data.ttl) || 3600) * 1000 };
        return servers;
      }
    }
  } catch (error) {
    console.warn('تعذر الحصول على بيانات TURN، سيُستخدم STUN كمسار احتياطي:', error);
  }
  return [
    { urls: 'stun:ajyal.app:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ];
}

export function useSessionWebRTC({
  bookingId,
  userId,
  enabled,
  onRemoteJoin,
  onRemoteLeave,
  onDataMessage,
}: UseSessionWebRTCOptions) {
  const channelRef = useRef<any>(null);
  const peerRef = useRef<any>(null);
  const dataChannelRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const remoteStreamRef = useRef<any>(null);
  const remoteTrackIdsRef = useRef<Set<string>>(new Set());
  const remoteTracksRef = useRef<any[]>([]);
  const rtcRef = useRef<RtcModule | null>(null);
  const pendingCandidatesRef = useRef<unknown[]>([]);
  const pendingDataMessagesRef = useRef<SessionDataMessage[]>([]);
  const startedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinRetryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectingRef = useRef(false);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionDeviceIdRef = useRef<string | null>(null);
  const heartbeatStartedRef = useRef(false);
  const heartbeatGenerationRef = useRef(0);
  const restartRef = useRef<(() => Promise<void>) | null>(null);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [rtcView, setRtcView] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [dataChannelState, setDataChannelState] = useState<'closed' | 'connecting' | 'open'>('closed');

  const sendSignal = useCallback(async (signalType: string, payload: unknown) => {
    if (!channelRef.current || !userId) return;
    await channelRef.current.send({
      type: 'broadcast',
      event: 'signal',
      payload: { bookingId, senderId: userId, signalType, payload },
    });
  }, [bookingId, userId]);

  const flushPendingDataMessages = useCallback(() => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') return;
    for (const message of pendingDataMessagesRef.current.splice(0)) {
      try {
        channel.send(JSON.stringify(message));
      } catch {
        pendingDataMessagesRef.current.unshift(message);
        break;
      }
    }
  }, []);

  const setupDataChannel = useCallback((channel: any) => {
    dataChannelRef.current = channel;
    setDataChannelState(channel.readyState === 'open' ? 'open' : 'connecting');
    channel.onopen = () => {
      setDataChannelState('open');
      flushPendingDataMessages();
    };
    channel.onclose = () => {
      if (dataChannelRef.current === channel) {
        setDataChannelState('closed');
        dataChannelRef.current = null;
      }
    };
    channel.onerror = () => {
      if (dataChannelRef.current === channel) setDataChannelState('closed');
    };
    channel.onmessage = (event: any) => {
      const parsed = parseDataChannelMessage(event?.data);
      if (parsed) onDataMessage?.(parsed);
    };
  }, [flushPendingDataMessages, onDataMessage]);

  const sendDataMessage = useCallback((message: SessionDataMessage) => {
    const channel = dataChannelRef.current;
    if (channel?.readyState === 'open') {
      try {
        channel.send(JSON.stringify(message));
        return;
      } catch {
        // Queue below when a channel transitions during a reconnect.
      }
    }
    if (message.type.startsWith('whiteboard-') || message.type === 'session-state' || message.type === 'hand-raise') {
      pendingDataMessagesRef.current = [...pendingDataMessagesRef.current.slice(-19), message];
    }
  }, []);

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
      if (result.error) {
        console.warn('تعذر تحديث نبضة جلسة الطالب:', result.error.message);
      }
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

  const flushPendingCandidates = useCallback(async () => {
    const peer = peerRef.current;
    const rtc = rtcRef.current;
    if (!peer?.remoteDescription || !rtc) return;
    for (const candidate of pendingCandidatesRef.current.splice(0)) {
      try {
        await peer.addIceCandidate(new rtc.RTCIceCandidate(candidate));
      } catch {
        // Candidates from an older ICE generation can safely be discarded.
      }
    }
  }, []);

  const makeOffer = useCallback(async (peer: any) => {
    if (makingOfferRef.current || peer.signalingState !== 'stable') return;
    makingOfferRef.current = true;
    try {
      pendingCandidatesRef.current = [];
      const offer = await peer.createOffer();
      const rtc = rtcRef.current as RtcModule | null;
      if (!rtc) return;
      const description = new rtc.RTCSessionDescription({
        type: offer.type,
        sdp: injectOpusParams(offer.sdp ?? ''),
      });
      await peer.setLocalDescription(description);
      await sendSignal('offer', { sdp: peer.localDescription?.toJSON?.() ?? peer.localDescription });
    } catch (reason: any) {
      if (reason?.name !== 'InvalidStateError') {
        setError(reason instanceof Error ? reason.message : 'تعذر إنشاء عرض الاتصال.');
      }
    } finally {
      makingOfferRef.current = false;
    }
  }, [sendSignal]);

  const createPeer = useCallback(async () => {
    const rtc = rtcRef.current ?? await getRtcModule();
    rtcRef.current = rtc;
    if (peerRef.current) peerRef.current.close();
    remoteStreamRef.current = null;
    remoteTrackIdsRef.current.clear();
    remoteTracksRef.current = [];
    setRemoteStream(null);
    const peer = new rtc.RTCPeerConnection({
      iceServers: await getIceServers(),
      bundlePolicy: 'max-bundle',
      iceCandidatePoolSize: 10,
    });
    peerRef.current = peer;
    peer.onnegotiationneeded = () => {
      void makeOffer(peer);
    };
    // Create the data channel before adding media tracks/transceivers. Adding
    // tracks can schedule negotiationneeded immediately; creating the channel
    // afterwards can therefore produce an offer without the session-data
    // m-line. That leaves audio connected but prevents timer/chat/whiteboard
    // synchronization from opening on the desktop peer.
    const outgoingDataChannel = peer.createDataChannel('session-data', { ordered: true });
    setupDataChannel(outgoingDataChannel);
    peer.ondatachannel = (event: any) => {
      if (event?.channel) setupDataChannel(event.channel);
    };
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) peer.addTrack(track, localStreamRef.current);
    }
    // Keep stable media lines even when this device has no usable input
    // devices. The student can still receive the teacher's media.
    if (typeof peer.addTransceiver === 'function') {
      try {
        if (!localStreamRef.current?.getAudioTracks?.().length) {
          peer.addTransceiver('audio', { direction: 'recvonly' });
        }
        if (!localStreamRef.current?.getVideoTracks?.().length) {
          peer.addTransceiver('video', { direction: 'recvonly' });
        }
      } catch {
        // Older native WebRTC builds may not expose transceivers. Data
        // channel signaling can still connect even without local media.
      }
    }
    peer.onicecandidate = (event: any) => {
      if (event.candidate) {
        // The web client wraps ICE candidates in { candidate: ... }.
        // Keep the same envelope so mobile/web can add each other's
        // candidates without silently dropping the negotiation.
        void sendSignal('ice-candidate', {
          candidate: event.candidate.toJSON?.() ?? event.candidate,
        });
      }
    };
    const publishRemoteTracks = (incomingStream?: any, incomingTrack?: any) => {
      const incomingTracks = [
        ...(incomingStream?.getTracks?.() ?? []),
        ...(incomingTrack ? [incomingTrack] : []),
      ];
      for (const track of incomingTracks) {
        if (!track) continue;
        const trackId = track.id ? String(track.id) : null;
        const existingIndex = remoteTracksRef.current.findIndex((item: any) => (
          item === track || (trackId && item?.id && String(item.id) === trackId)
        ));
        if (existingIndex === -1) {
          remoteTracksRef.current.push(track);
        } else if (remoteTracksRef.current[existingIndex] !== track && remoteTracksRef.current[existingIndex]?.readyState === 'ended') {
          remoteTracksRef.current[existingIndex] = track;
        }
      }
      remoteTrackIdsRef.current = new Set(
        remoteTracksRef.current
          .map((track: any, index: number) => String(track?.id ?? `${track?.kind ?? 'track'}-${index}`)),
      );

      const Stream = rtc.MediaStream;
      if (Stream && remoteTracksRef.current.length) {
        try {
          // Rebuild a fresh stream for every track event. This is important for
          // screen sharing: native WebRTC may deliver the new video track
          // without event.streams and RTCView will not refresh a mutated stream.
          const nextStream = new Stream(remoteTracksRef.current);
          remoteStreamRef.current = nextStream;
          setRemoteStream(nextStream);
          return;
        } catch {
          // Fall back to the stream supplied by the platform below.
        }
      }
      if (incomingStream) remoteStreamRef.current = incomingStream;
      if (remoteStreamRef.current) setRemoteStream(remoteStreamRef.current);
    };
    peer.ontrack = (event: any) => {
      publishRemoteTracks(event?.streams?.[0] ?? event?.stream, event?.track);
    };
    // Older react-native-webrtc builds can expose stream events instead of
    // track events. Keep this compatibility path so screen-share streams are
    // not lost on those builds.
    peer.onaddstream = (event: any) => {
      publishRemoteTracks(event?.stream);
    };
    peer.onremovetrack = (event: any) => {
      const track = event?.track;
      if (!track) return;
      remoteTracksRef.current = remoteTracksRef.current.filter((item: any) => item !== track && item?.id !== track.id);
      remoteTrackIdsRef.current.delete(String(track.id));
      const Stream = rtc.MediaStream;
      if (Stream && remoteTracksRef.current.length) {
        try {
          const nextStream = new Stream(remoteTracksRef.current);
          remoteStreamRef.current = nextStream;
          setRemoteStream(nextStream);
        } catch {
          // Keep the last usable stream if this native implementation cannot
          // clone MediaStream instances.
        }
      } else {
        remoteStreamRef.current = null;
        setRemoteStream(null);
      }
    };
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState as ConnectionState;
      if (state === 'connected') {
        reconnectAttemptsRef.current = 0;
        reconnectingRef.current = false;
        setError(null);
        setConnectionState('connected');
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
      } else if (state === 'disconnected') {
        setConnectionState('disconnected');
        restartRef.current?.();
      } else if (state === 'failed') {
        setConnectionState('failed');
        restartRef.current?.();
      }
    };
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'failed') {
        setError('فشل مسار الشبكة بين الجهازين؛ تحقق من TURN أو جرّب شبكة أخرى.');
      }
    };
    return peer;
  }, [makeOffer, sendSignal, setupDataChannel]);

  const handleSignal = useCallback(async (signalType: string, payload: any, senderId: string) => {
    if (!userId || senderId === userId) return;
    const rtc = rtcRef.current ?? await getRtcModule();
    rtcRef.current = rtc;
    const peer = peerRef.current ?? await createPeer();
    if (signalType === 'join') {
      onRemoteJoin?.();
      return;
    }
    if (signalType === 'offer') {
      const offerCollision = makingOfferRef.current || peer.signalingState !== 'stable';
      const polite = userId.localeCompare(senderId) > 0;
      ignoreOfferRef.current = !polite && offerCollision;
      if (ignoreOfferRef.current) return;
      if (offerCollision && polite) {
        try {
          await peer.setLocalDescription({ type: 'rollback' });
        } catch {
          // Older native WebRTC builds may not expose rollback; continue with the offer.
        }
      }
      await peer.setRemoteDescription(new rtc.RTCSessionDescription(payload?.sdp ?? payload));
      await flushPendingCandidates();
      const answer = await peer.createAnswer();
      const answerDescription = new rtc.RTCSessionDescription({
        type: answer.type,
        sdp: injectOpusParams(answer.sdp ?? ''),
      });
      await peer.setLocalDescription(answerDescription);
      await sendSignal('answer', { sdp: peer.localDescription?.toJSON?.() ?? peer.localDescription });
      return;
    }
    if (signalType === 'answer') {
      if (peer.signalingState === 'have-local-offer') {
        await peer.setRemoteDescription(new rtc.RTCSessionDescription(payload?.sdp ?? payload));
        await flushPendingCandidates();
      }
      return;
    }
    if (signalType === 'ice-candidate') {
      if (ignoreOfferRef.current) return;
      const candidate = payload?.candidate && typeof payload.candidate === 'object'
        ? payload.candidate
        : payload;
      if (peer.remoteDescription) {
        try {
          await peer.addIceCandidate(new rtc.RTCIceCandidate(candidate));
        } catch {
          // Stale ICE generations can arrive during a reconnect and are safe to drop.
        }
      } else {
        pendingCandidatesRef.current.push(candidate);
      }
      return;
    }
    if (signalType === 'leave') onRemoteLeave?.();
  }, [createPeer, flushPendingCandidates, makeOffer, onRemoteJoin, onRemoteLeave, sendSignal, userId]);

  const stop = useCallback(async () => {
    startedRef.current = false;
    reconnectingRef.current = false;
    await stopSessionHeartbeat();
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (joinRetryIntervalRef.current) {
      clearInterval(joinRetryIntervalRef.current);
      joinRetryIntervalRef.current = null;
    }
    if (channelRef.current) {
      await sendSignal('leave', {}).catch(() => undefined);
      if (supabase) await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    dataChannelRef.current?.close?.();
    dataChannelRef.current = null;
    pendingDataMessagesRef.current = [];
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    remoteStreamRef.current = null;
    remoteTrackIdsRef.current.clear();
    remoteTracksRef.current = [];
    setRemoteStream(null);
    setMuted(false);
    setVideoEnabled(true);
    setRtcView(null);
    setConnectionState('idle');
    setDataChannelState('closed');
  }, [sendSignal, stopSessionHeartbeat]);

  const restartConnection = useCallback(async () => {
    if (!startedRef.current || reconnectingRef.current || !channelRef.current) return;
    reconnectingRef.current = true;
    const attempt = reconnectAttemptsRef.current;
    reconnectAttemptsRef.current += 1;
    const delay = Math.min(2_000 * 2 ** attempt, 15_000);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      void (async () => {
        try {
          pendingCandidatesRef.current = [];
          makingOfferRef.current = false;
          ignoreOfferRef.current = false;
          await createPeer();
          await sendSignal('join', { userId, retry: 'peer-restart' });
          reconnectingRef.current = false;
        } catch (reason) {
          reconnectingRef.current = false;
          setError(reason instanceof Error ? reason.message : 'تعذر إعادة الاتصال بالجلسة.');
          restartRef.current?.();
        }
      })();
    }, delay);
  }, [createPeer, sendSignal]);

  restartRef.current = restartConnection;

  const start = useCallback(async () => {
    if (startedRef.current || !bookingId || !userId || !supabase) return;
    startedRef.current = true;
    setConnectionState('connecting');
    setError(null);
    setMediaWarning(null);
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;
    pendingCandidatesRef.current = [];
    try {
      const rtc = rtcRef.current ?? await getRtcModule();
      rtcRef.current = rtc;
      setRtcView(rtc.RTCView ?? null);
      let localStream: any;
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      } catch {
        // Native audio routing is best-effort; WebRTC still owns the tracks.
      }
      const getUserMedia = rtc.mediaDevices?.getUserMedia?.bind(rtc.mediaDevices);
      if (getUserMedia) {
        try {
          // The student is a viewer in the platform session. Do not request
          // camera permission or publish a local video track; the teacher's
          // screen/camera is the only video shown in this room.
          localStream = await getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: false,
              channelCount: 1,
              sampleRate: 48_000,
            },
            video: false,
          });
        } catch {
          try {
            localStream = await getUserMedia({ audio: true, video: false });
          } catch {
            // A device-less/browser preview must still be able to join as a
            // receive-only student instead of aborting the whole session.
            localStream = null;
            setMediaWarning('لم يتوفر ميكروفون؛ سيتم الدخول بوضع الاستقبال.');
          }
        }
      } else {
        setMediaWarning('لم يتوفر إذن للميكروفون؛ سيتم الدخول بوضع الاستقبال.');
      }
      localStreamRef.current = localStream;
      setLocalStream(localStream);
      setVideoEnabled(Boolean(localStreamRef.current?.getVideoTracks?.().length));
      const channel = supabase
        .channel(`webrtc-${bookingId}`, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'signal' }, (event: any) => {
          const signal = event.payload;
          if (signal?.bookingId !== bookingId) return;
          if (signal?.senderId) void handleSignal(signal.signalType, signal.payload, signal.senderId).catch((reason) => {
            setError(reason instanceof Error ? reason.message : 'تعذر مزامنة غرفة الجلسة.');
          });
        });
      channelRef.current = channel;
      let firstSubscription = true;
      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            if (firstSubscription) {
              firstSubscription = false;
               void startSessionHeartbeat();
              resolve();
            } else if (startedRef.current && peerRef.current?.connectionState !== 'connected') {
               void startSessionHeartbeat();
              void sendSignal('join', { userId, retry: 'realtime-reconnect' });
            }
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (firstSubscription) reject(new Error('تعذر الاتصال بغرفة الجلسة.'));
            else setError('انقطع اتصال غرفة الجلسة، جارٍ إعادة المحاولة.');
          }
        });
      });
      await createPeer();
      await sendSignal('join', { userId });
      if (joinRetryIntervalRef.current) clearInterval(joinRetryIntervalRef.current);
      let retryCount = 0;
      joinRetryIntervalRef.current = setInterval(() => {
        if (!startedRef.current || peerRef.current?.connectionState === 'connected' || retryCount >= 15) {
          if (joinRetryIntervalRef.current) {
            clearInterval(joinRetryIntervalRef.current);
            joinRetryIntervalRef.current = null;
          }
          return;
        }
        retryCount += 1;
        void sendSignal('join', { userId, retry: retryCount });
      }, 3000);
    } catch (reason) {
      startedRef.current = false;
      setConnectionState('failed');
      setError(reason instanceof Error ? reason.message : 'تعذر بدء الصوت المباشر.');
    }
  }, [bookingId, createPeer, handleSignal, sendSignal, startSessionHeartbeat, userId]);

  useEffect(() => {
    if (enabled) void start();
    return () => {
      void stop();
    };
  }, [enabled, start, stop]);

  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks?.() ?? [];
    const nextMuted = !muted;
    tracks.forEach((track: any) => { track.enabled = !nextMuted; });
    setMuted(nextMuted);
  }, [muted]);

  const toggleVideo = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks?.() ?? [];
    const nextEnabled = !videoEnabled;
    tracks.forEach((track: any) => { track.enabled = nextEnabled; });
    setVideoEnabled(nextEnabled);
  }, [videoEnabled]);

  return {
    connectionState,
    localStream,
    remoteStream,
    rtcView,
    muted,
    videoEnabled,
    error,
    mediaWarning,
    dataChannelState,
    start,
    stop,
    toggleMute,
    toggleVideo,
    sendDataMessage,
  };
}