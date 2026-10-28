import { useCallback, useEffect, useRef, useState } from "react";
import { NativeModules, Platform } from "react-native";
import { requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import { supabase } from "@/lib/supabase";
import { parseInternalCallTransport, type InternalCallProvider } from "@/lib/internalCallTransport";

type InternalCall = {
  id: string;
  callerId?: string;
  roomId?: string;
  status: string;
};

type AgoraEngine = {
  initialize(options: unknown): number;
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

type RtcModule = {
  RTCPeerConnection: new (configuration?: unknown) => any;
  RTCIceCandidate: new (candidate: unknown) => any;
  RTCSessionDescription: new (description: unknown) => any;
  mediaDevices: { getUserMedia(constraints: unknown): Promise<any> };
  registerGlobals?: () => void;
  RTCAudioSession?: { audioSessionDidActivate?: () => void };
};

type ConnectionState = "idle" | "connecting" | "connected" | "failed";

const WEBRTC_BUILD_MESSAGE = "المكالمات الصوتية تحتاج إلى Development Build، وهي غير متاحة داخل Expo Go.";

async function getRtcModule(): Promise<RtcModule> {
  if (Platform.OS !== "web") {
    if (!(NativeModules as { WebRTCModule?: unknown }).WebRTCModule) {
      throw new Error(WEBRTC_BUILD_MESSAGE);
    }
    try {
      const native = await import("react-native-webrtc");
      native.registerGlobals?.();
      return native as unknown as RtcModule;
    } catch {
      throw new Error(WEBRTC_BUILD_MESSAGE);
    }
  }
  const browser = globalThis as typeof globalThis & {
    RTCPeerConnection?: RtcModule["RTCPeerConnection"];
    RTCIceCandidate?: RtcModule["RTCIceCandidate"];
    RTCSessionDescription?: RtcModule["RTCSessionDescription"];
  };
  if (!browser.RTCPeerConnection || !navigator.mediaDevices) {
    throw new Error("لا يدعم هذا الجهاز المكالمة الصوتية المباشرة.");
  }
  return {
    RTCPeerConnection: browser.RTCPeerConnection,
    RTCIceCandidate: browser.RTCIceCandidate!,
    RTCSessionDescription: browser.RTCSessionDescription!,
    mediaDevices: navigator.mediaDevices,
  };
}

let cachedIce: { servers: unknown[]; expiresAt: number } | null = null;

async function getIceServers(): Promise<unknown[]> {
  if (cachedIce && cachedIce.expiresAt > Date.now() + 60_000) return cachedIce.servers;
  try {
    if (supabase) {
      const { data, error } = await supabase.functions.invoke("turn-credentials");
      if (error) throw error;
      if (Array.isArray(data?.iceServers) && data.iceServers.length) {
        const servers = data.iceServers as unknown[];
        cachedIce = { servers, expiresAt: Date.now() + (Number(data.ttl) || 3600) * 1000 };
        return servers;
      }
    }
  } catch (error) {
    console.warn("تعذر الحصول على TURN للمكالمة الداخلية:", error);
  }
  return [
    { urls: "stun:ajyal.app:3478" },
    { urls: "stun:stun.l.google.com:19302" },
  ];
}

export function useInternalCallWebRTC({
  call,
  userId,
  enabled,
  transportProvider = "webrtc",
}: {
  call: InternalCall | null;
  userId?: string;
  enabled: boolean;
  transportProvider?: InternalCallProvider;
}) {
  const callId = call?.id;
  const callerId = call?.callerId;
  const channelRef = useRef<any>(null);
  const peerRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const remoteAudioRef = useRef<any>(null);
  const agoraEngineRef = useRef<AgoraEngine | null>(null);
  const rtcRef = useRef<RtcModule | null>(null);
  const pendingCandidatesRef = useRef<unknown[]>([]);
  const startedRef = useRef(false);
  const isCallerRef = useRef(false);
  const offerStartedRef = useRef(false);
  const readyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callIdRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const speakerEnabledRef = useRef(true);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [muted, setMuted] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sendSignal = useCallback(async (signalType: string, payload: unknown) => {
    if (!channelRef.current || !userId) return;
    await channelRef.current.send({
      type: "broadcast",
      event: "signal",
      payload: { senderId: userId, signalType, payload },
    });
  }, [userId]);

  const flushCandidates = useCallback(async () => {
    const peer = peerRef.current;
    const rtc = rtcRef.current;
    if (!peer?.remoteDescription || !rtc) return;
    const pending = pendingCandidatesRef.current.splice(0);
    for (const candidate of pending) {
      await peer.addIceCandidate(new rtc.RTCIceCandidate(candidate));
    }
  }, []);

  const createOffer = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer || !isCallerRef.current || offerStartedRef.current || peer.signalingState !== "stable") return;
    offerStartedRef.current = true;
    const offer = await peer.createOffer({ offerToReceiveAudio: true });
    await peer.setLocalDescription(offer);
    await sendSignal("offer", { sdp: peer.localDescription?.toJSON?.() ?? peer.localDescription });
  }, [sendSignal]);

  const handleSignal = useCallback(async (signalType: string, payload: any, senderId: string) => {
    if (!userId || senderId === userId) return;
    const peer = peerRef.current;
    const rtc = rtcRef.current;
    if (!peer || !rtc) return;
    if (signalType === "ready") {
      await createOffer();
      return;
    }
    if (signalType === "offer" && !isCallerRef.current) {
      await peer.setRemoteDescription(new rtc.RTCSessionDescription(payload?.sdp));
      await flushCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal("answer", { sdp: peer.localDescription?.toJSON?.() ?? peer.localDescription });
      return;
    }
    if (signalType === "answer" && isCallerRef.current && peer.signalingState === "have-local-offer") {
      await peer.setRemoteDescription(new rtc.RTCSessionDescription(payload?.sdp));
      await flushCandidates();
      return;
    }
    if (signalType === "ice" && payload?.candidate) {
      if (peer.remoteDescription) await peer.addIceCandidate(new rtc.RTCIceCandidate(payload.candidate));
      else pendingCandidatesRef.current.push(payload.candidate);
    }
  }, [createOffer, flushCandidates, sendSignal, userId]);

  const stop = useCallback(async () => {
    generationRef.current += 1;
    startedRef.current = false;
    offerStartedRef.current = false;
    pendingCandidatesRef.current = [];
    if (readyTimerRef.current) clearInterval(readyTimerRef.current);
    readyTimerRef.current = null;
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel && supabase) await supabase.removeChannel(channel);
    const peer = peerRef.current;
    peerRef.current = null;
    peer?.close?.();
    const stream = localStreamRef.current;
    localStreamRef.current = null;
    stream?.getTracks?.().forEach((track: any) => track.stop());
    const remoteAudio = remoteAudioRef.current;
    remoteAudioRef.current = null;
    if (remoteAudio) {
      remoteAudio.pause?.();
      remoteAudio.srcObject = null;
    }
    if (agoraEngineRef.current) {
      try {
        agoraEngineRef.current.leaveChannel();
        agoraEngineRef.current.release();
      } catch {
        // An interrupted native join can already have released the engine.
      }
      agoraEngineRef.current = null;
    }
    setMuted(false);
    setConnectionState("idle");
  }, []);

  const start = useCallback(async () => {
    if (startedRef.current || !enabled || !callId || !userId || !supabase) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    startedRef.current = true;
    callIdRef.current = callId;
    isCallerRef.current = callerId === userId;
    setConnectionState("connecting");
    setError(null);
    try {
      if (transportProvider === "agora") {
        const client = supabase;
        if (!client) throw new Error("خدمة المكالمات غير متاحة.");
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) throw new Error("يلزم السماح بالميكروفون لقبول مكالمة Agora.");
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: "doNotMix",
          shouldRouteThroughEarpiece: !speakerEnabledRef.current,
        });
        const { data, error } = await client.functions.invoke("internal-call-transport-token", {
          body: { callId },
        });
        if (error) throw error;
        const transport = parseInternalCallTransport(data, userId);
        const agora = await import("react-native-agora");
        const engine = agora.createAgoraRtcEngine() as unknown as AgoraEngine;
        agoraEngineRef.current = engine;
        engine.initialize({
          appId: transport.appId,
          channelProfile: agora.ChannelProfileType.ChannelProfileCommunication,
        });
        engine.enableAudio();
        engine.setClientRole(agora.ClientRoleType.ClientRoleBroadcaster);
        const markConnected = () => {
          setConnectionState("connected");
          void client.rpc("mark_internal_call_connected", { p_call_id: callId });
        };
        engine.registerEventHandler({
          onJoinChannelSuccess: markConnected,
          onUserJoined: markConnected,
          onTokenPrivilegeWillExpire: async () => {
            try {
              const { data: renewed, error: renewalError } = await client.functions.invoke(
                "internal-call-transport-token",
                { body: { callId } },
              );
              if (renewalError) throw renewalError;
              engine.renewToken(parseInternalCallTransport(renewed, userId).token);
            } catch (renewalError) {
              setConnectionState("failed");
              setError(renewalError instanceof Error ? renewalError.message : "تعذر تجديد رمز Agora.");
            }
          },
          onError: (_code: number, message: string) => {
            setConnectionState("failed");
            setError(message || "تعذر الاتصال بخدمة Agora.");
          },
        });
        const joinResult = engine.joinChannelWithUserAccount(
          transport.token,
          transport.channel,
          transport.userAccount,
          { publishMicrophoneTrack: true, publishCameraTrack: false },
        );
        if (joinResult < 0) throw new Error(`تعذر الانضمام إلى Agora (رمز ${joinResult}).`);
        return;
      }
      const rtc = rtcRef.current ?? await getRtcModule();
      if (generation !== generationRef.current) return;
      rtcRef.current = rtc;
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: "doNotMix",
        shouldRouteThroughEarpiece: !speakerEnabledRef.current,
      });
      rtc.RTCAudioSession?.audioSessionDidActivate?.();
      if (generation !== generationRef.current) return;
      let localStream: any = null;
      try {
        localStream = await rtc.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (reason) {
        // A missing/blocked microphone must not prevent the participant from
        // joining an audio call. The peer can still negotiate recvonly audio
        // and receive the other participant's stream.
        const message = reason instanceof Error ? reason.message : "";
        setError(
          /requested device not found|notfounderror|permission denied|notallowederror/i.test(message)
            ? "الميكروفون غير متاح؛ ستستمر المكالمة بوضع الاستماع."
            : "تعذر الوصول إلى الميكروفون؛ ستستمر المكالمة بوضع الاستماع.",
        );
      }
      if (generation !== generationRef.current) {
        localStream?.getTracks?.().forEach((track: any) => track.stop());
        return;
      }
      const iceServers = await getIceServers();
      if (generation !== generationRef.current) {
        localStream?.getTracks?.().forEach((track: any) => track.stop());
        return;
      }
      const peer = new rtc.RTCPeerConnection({ iceServers });
      localStreamRef.current = localStream;
      peerRef.current = peer;
      if (localStream) {
        localStream.getAudioTracks?.().forEach((track: any) => {
          track.enabled = true;
          peer.addTrack(track, localStream);
        });
      } else if (typeof peer.addTransceiver === "function") {
        peer.addTransceiver("audio", { direction: "recvonly" });
      }
      peer.onicecandidate = (event: any) => {
        if (event.candidate) {
          void sendSignal("ice", { candidate: event.candidate.toJSON?.() ?? event.candidate });
        }
      };
      peer.onconnectionstatechange = () => {
        const state = peer.connectionState;
        if (state === "connected") {
          setConnectionState("connected");
          void setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: "doNotMix",
            shouldRouteThroughEarpiece: !speakerEnabledRef.current,
          }).catch(() => undefined);
          if (callIdRef.current && supabase) {
            void (async () => {
              await supabase?.rpc("mark_internal_call_connected", { p_call_id: callIdRef.current });
            })();
          }
        } else if (state === "failed" || state === "closed") {
          setConnectionState("failed");
        }
      };
      peer.ontrack = (event: any) => {
        if (event.track) event.track.enabled = true;
        // Native WebRTC routes received audio through the device audio session.
        // Browsers need an explicit autoplay audio sink.
        if (Platform.OS === "web" && event.streams?.[0]) {
          const BrowserAudio = (globalThis as any).Audio;
          if (!BrowserAudio) return;
          const audio = remoteAudioRef.current ?? new BrowserAudio();
          audio.autoplay = true;
          audio.srcObject = event.streams[0];
          remoteAudioRef.current = audio;
          void audio.play?.().catch(() => undefined);
        }
      };
      const channel = supabase
        .channel(`internal-voice-${callId}`, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "signal" }, (event: any) => {
          const signal = event.payload;
          if (signal?.senderId) {
            void handleSignal(signal.signalType, signal.payload, signal.senderId).catch((reason) => {
              setError(reason instanceof Error ? reason.message : "تعذر مزامنة المكالمة الصوتية.");
            });
          }
        });
      channelRef.current = channel;
      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status: string) => {
          if (status === "SUBSCRIBED") {
            if (!isCallerRef.current) {
              void sendSignal("ready", {});
              readyTimerRef.current = setInterval(() => {
                if (peer.remoteDescription) {
                  if (readyTimerRef.current) clearInterval(readyTimerRef.current);
                  readyTimerRef.current = null;
                } else {
                  void sendSignal("ready", {});
                }
              }, 900);
            }
            resolve();
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error("تعذر الاتصال بغرفة المكالمة."));
        });
      });
      if (generation !== generationRef.current) {
        await supabase.removeChannel(channel);
        peer.close?.();
        localStream?.getTracks?.().forEach((track: any) => track.stop());
      }
    } catch (reason) {
      if (generation !== generationRef.current) return;
      startedRef.current = false;
      if (agoraEngineRef.current) {
        try {
          agoraEngineRef.current.leaveChannel();
          agoraEngineRef.current.release();
        } catch {
          // Cleanup may follow an interrupted native initialization.
        }
        agoraEngineRef.current = null;
      }
      setConnectionState("failed");
      setError(reason instanceof Error ? reason.message : "تعذر بدء المكالمة الصوتية.");
    }
  }, [callId, callerId, enabled, handleSignal, sendSignal, transportProvider, userId]);

  useEffect(() => {
    if (enabled) void start();
    else void stop();
    return () => {
      void stop();
    };
  }, [enabled, start, stop]);

  const toggleMute = useCallback(() => {
    const nextMuted = !muted;
    if (transportProvider === "agora" && agoraEngineRef.current) {
      agoraEngineRef.current.muteLocalAudioStream(nextMuted);
      setMuted(nextMuted);
      return;
    }
    localStreamRef.current?.getAudioTracks?.().forEach((track: any) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }, [muted, transportProvider]);

  const toggleSpeaker = useCallback(() => {
    const nextSpeakerEnabled = !speakerEnabledRef.current;
    speakerEnabledRef.current = nextSpeakerEnabled;
    setSpeakerEnabled(nextSpeakerEnabled);
    void setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
        shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
      shouldRouteThroughEarpiece: !nextSpeakerEnabled,
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "تعذر تغيير مخرج الصوت.");
    });
    if (transportProvider === "agora") {
      agoraEngineRef.current?.setEnableSpeakerphone(nextSpeakerEnabled);
    }
  }, [transportProvider]);

  return { connectionState, muted, error, speakerEnabled, start, stop, toggleMute, toggleSpeaker };
}