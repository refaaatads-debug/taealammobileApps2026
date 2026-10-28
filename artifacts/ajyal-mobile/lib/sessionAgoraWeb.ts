import type { AgoraTransport } from './sessionTransport';

export type AgoraWebCallbacks = {
  onRemoteUserJoined?: (uid: string | number) => void;
  onRemoteUserLeft?: (uid: string | number) => void;
  onRemoteAudio?: (state: 'starting' | 'playing' | 'interrupted' | 'failed', uid: string | number) => void;
  onRemoteAudioTrack?: (track: any | null) => void;
  onRemoteVideo?: (track: any | null) => void;
  onAutoplayBlocked?: () => void;
  onTokenWillExpire?: () => Promise<string>;
  onTokenError?: (error: unknown) => void;
  onReconnecting?: (reconnecting: boolean) => void;
};

export async function joinAgoraWebSession(
  transport: AgoraTransport,
  callbacks: AgoraWebCallbacks = {},
  rtcOverride?: any,
) {
  const rtc = rtcOverride ?? (await import('agora-rtc-sdk-ng')).default;
  if (!rtc.checkSystemRequirements()) {
    throw new Error('هذا المتصفح لا يدعم Agora WebRTC؛ جرّب متصفحًا حديثًا مع HTTPS.');
  }
  const client = rtc.createClient({ mode: 'rtc', codec: 'vp8' });
  let remoteAudioTrack: any = null;
  let remoteVideoTrack: any = null;

  client.on('user-published', async (user: any, mediaType: 'audio' | 'video') => {
    callbacks.onRemoteUserJoined?.(user.uid);
    if (mediaType === 'audio') callbacks.onRemoteAudio?.('starting', user.uid);
    try {
      await client.subscribe(user, mediaType);
      if (mediaType === 'audio' && user.audioTrack) {
        remoteAudioTrack = user.audioTrack;
        callbacks.onRemoteAudioTrack?.(remoteAudioTrack);
        try {
          remoteAudioTrack.play();
          callbacks.onRemoteAudio?.('playing', user.uid);
        } catch {
          callbacks.onAutoplayBlocked?.();
        }
      }
      if (mediaType === 'video' && user.videoTrack) {
        remoteVideoTrack = user.videoTrack;
        callbacks.onRemoteVideo?.(remoteVideoTrack);
      }
    } catch {
      if (mediaType === 'audio') callbacks.onRemoteAudio?.('failed', user.uid);
    }
  });
  client.on('user-unpublished', (user: any, mediaType: 'audio' | 'video') => {
    if (mediaType === 'audio') {
      remoteAudioTrack?.stop?.();
      remoteAudioTrack = null;
      callbacks.onRemoteAudioTrack?.(null);
      callbacks.onRemoteAudio?.('interrupted', user.uid);
    }
    if (mediaType === 'video') {
      remoteVideoTrack?.stop?.();
      remoteVideoTrack = null;
      callbacks.onRemoteVideo?.(null);
    }
  });
  client.on('user-left', (user: any) => {
    remoteAudioTrack?.stop?.();
    remoteVideoTrack?.stop?.();
    remoteAudioTrack = null;
    callbacks.onRemoteAudioTrack?.(null);
    remoteVideoTrack = null;
    callbacks.onRemoteUserLeft?.(user.uid);
    callbacks.onRemoteVideo?.(null);
  });
  const onAutoplayFailed = () => callbacks.onAutoplayBlocked?.();
  rtc.on('autoplay-failed', onAutoplayFailed);
  client.on('connection-state-change', (state: string) => {
    if (state === 'RECONNECTING' || state === 'CONNECTING') callbacks.onReconnecting?.(true);
    else if (state === 'CONNECTED') callbacks.onReconnecting?.(false);
    else if (state === 'DISCONNECTED') callbacks.onReconnecting?.(true);
  });
  client.on('token-privilege-will-expire', async () => {
    try {
      const token = await callbacks.onTokenWillExpire?.();
      if (token) await client.renewToken(token);
    } catch (error) {
      callbacks.onTokenError?.(error);
    }
  });

  try {
    await client.join(transport.appId, transport.channel, transport.token, transport.uid);
  } catch (error) {
    rtc.off?.('autoplay-failed', onAutoplayFailed);
    await client.leave?.().catch?.(() => undefined);
    throw error;
  }
  let microphoneTrack: any = null;
  let microphoneWarning: string | null = null;
  try {
    microphoneTrack = await rtc.createMicrophoneAudioTrack({
      AEC: true,
      ANS: true,
      AGC: true,
    });
    await client.publish([microphoneTrack]);
  } catch {
    microphoneTrack?.close?.();
    microphoneTrack = null;
    microphoneWarning = 'لم يتوفر الميكروفون؛ انضممت بوضع الاستقبال فقط.';
  }

  return {
    client,
    uid: transport.uid,
    get remoteAudioTrack() { return remoteAudioTrack; },
    get remoteVideoTrack() { return remoteVideoTrack; },
    microphoneTrack,
    microphoneWarning,
    async resumeAudio() {
      await rtc.resumeAudioContext?.();
      remoteAudioTrack?.play?.();
    },
    async leave() {
      rtc.off?.('autoplay-failed', onAutoplayFailed);
      remoteAudioTrack?.stop?.();
      remoteVideoTrack?.stop?.();
      microphoneTrack?.close?.();
      await client.leave();
    },
  };
}
