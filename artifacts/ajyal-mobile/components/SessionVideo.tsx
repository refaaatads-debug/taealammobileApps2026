import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getSessionMediaPlaybackPlan } from '@/lib/sessionMediaPlayback';

type SessionVideoProps = {
  stream: any;
  nativeView?: any;
  label: string;
  compact?: boolean;
  height?: number;
  fit?: 'contain' | 'cover';
  scale?: number;
  fill?: boolean;
  agoraRemoteUid?: string | number | null;
  agoraSurfaceView?: any;
  agoraWebRemoteAudioTrack?: any;
  agoraWebRemoteVideoTrack?: any;
  agoraWebAudioBlocked?: boolean;
  onResumeAgoraAudio?: () => void;
};

export function SessionVideo({
  stream,
  nativeView,
  label,
  compact = false,
  height,
  fit = 'cover',
  scale = 1,
  fill = false,
  agoraRemoteUid = null,
  agoraSurfaceView,
  agoraWebRemoteAudioTrack,
  agoraWebRemoteVideoTrack,
  agoraWebAudioBlocked = false,
  onResumeAgoraAudio,
}: SessionVideoProps) {
  const videoRef = useRef<any>(null);
  const agoraWebVideoRef = useRef<any>(null);
  const audioRef = useRef<any>(null);
  const allTracks = stream?.getTracks?.() ?? [];
  const playbackPlan = getSessionMediaPlaybackPlan(allTracks);
  const hasLiveVideo = playbackPlan.hasLiveVideo;
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const hasAgoraVideo = Platform.OS !== 'web' && agoraSurfaceView && agoraRemoteUid !== null;
  const trackSignature = allTracks
    .map((track: any) => `${track?.kind ?? 'track'}:${track?.id ?? 'unknown'}:${track?.readyState ?? 'unknown'}:${track?.enabled !== false}`)
    .join('|');

  useEffect(() => {
    if (Platform.OS !== 'web' || !videoRef.current) return;
    videoRef.current.srcObject = stream ?? null;
    if (stream) void videoRef.current.play?.().catch(() => undefined);
  }, [stream, trackSignature]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !playbackPlan.needsWebAudioSink || !audioRef.current) {
      setAudioPlaybackBlocked(false);
      return;
    }
    const audio = audioRef.current;
    audio.srcObject = stream ?? null;
    void audio.play?.()
      .then(() => setAudioPlaybackBlocked(false))
      .catch(() => setAudioPlaybackBlocked(true));
    return () => {
      audio.srcObject = null;
    };
  }, [playbackPlan.needsWebAudioSink, stream, trackSignature]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !agoraWebRemoteVideoTrack || !agoraWebVideoRef.current) return;
    try {
      agoraWebRemoteVideoTrack.play(agoraWebVideoRef.current);
    } catch {
      // Video can be republished after the component mounts; the next track update retries.
    }
    return () => agoraWebRemoteVideoTrack.stop?.();
  }, [agoraWebRemoteVideoTrack]);

  if (Platform.OS === 'web' && (agoraWebRemoteAudioTrack || agoraWebRemoteVideoTrack)) {
    return (
      <View style={[styles.frame, compact && styles.compact, fill && styles.fill, !fill && height ? { height } : null, { transform: [{ scale }] }]}>
        {React.createElement('div', {
          ref: agoraWebVideoRef,
          style: { width: '100%', height: '100%', objectFit: fit, backgroundColor: '#112D4E' },
        })}
        {agoraWebAudioBlocked ? (
          <Pressable accessibilityRole="button" onPress={onResumeAgoraAudio} style={styles.audioRecovery}>
            <Text style={styles.audioRecoveryText}>تفعيل صوت الحصة</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const renderWebAudio = () => Platform.OS === 'web' && playbackPlan.needsWebAudioSink
    ? React.createElement('audio', {
      ref: audioRef,
      autoPlay: true,
      playsInline: true,
      'aria-hidden': true,
      tabIndex: -1,
      style: { position: 'absolute', width: 1, height: 1, opacity: 0 },
    })
    : null;

  const renderAudioRecovery = () => audioPlaybackBlocked ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="تفعيل صوت المعلم"
      onPress={() => {
        void audioRef.current?.play?.()
          .then(() => setAudioPlaybackBlocked(false))
          .catch(() => setAudioPlaybackBlocked(true));
      }}
      style={styles.audioRecovery}
    >
      <Text style={styles.audioRecoveryText}>اضغط لتفعيل صوت المعلم</Text>
    </Pressable>
  ) : null;

  if (hasAgoraVideo) {
    return (
      <View style={[styles.frame, compact && styles.compact, fill && styles.fill, !fill && height ? { height } : null, { transform: [{ scale }] }]}>
        {React.createElement(agoraSurfaceView, {
          canvas: { uid: agoraRemoteUid },
          style: styles.video,
        })}
      </View>
    );
  }

  if (!stream || !hasLiveVideo) {
    return (
      <View style={[styles.empty, compact && styles.compact, fill && styles.fill, !fill && height ? { height } : null, { backgroundColor: '#112D4E', transform: [{ scale }] }]}>
        <Text style={styles.emptyLabel}>{stream && !compact ? 'الصوت متصل — بانتظار فيديو المعلم' : label}</Text>
        {renderWebAudio()}
        {renderAudioRecovery()}
      </View>
    );
  }

  if (Platform.OS === 'web') {
    const webVideoStyle = {
      width: '100%',
      height: '100%',
      objectFit: fit,
    } as const;

    return (
      <View style={[styles.frame, compact && styles.compact, fill && styles.fill, !fill && height ? { height } : null, { transform: [{ scale }] }]}>
        {React.createElement('video', {
          ref: videoRef,
          autoPlay: true,
          playsInline: true,
          muted: true,
          // This is a raw HTML element on web, so its style must be a plain
          // CSS object rather than a React Native style array.
          style: webVideoStyle,
        })}
        {renderWebAudio()}
        {renderAudioRecovery()}
      </View>
    );
  }

  if (!nativeView) {
    return (
      <View style={[styles.empty, compact && styles.compact, fill && styles.fill, !fill && height ? { height } : null, { backgroundColor: '#112D4E', transform: [{ scale }] }]}>
        <Text style={styles.emptyLabel}>جارٍ تجهيز الفيديو…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, compact && styles.compact, fill && styles.fill, !fill && height ? { height } : null, { transform: [{ scale }] }]}>
      {React.createElement(nativeView, {
        streamURL: stream.toURL?.() ?? stream.id,
        objectFit: fit,
        style: [styles.video, { objectFit: fit }],
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', height: 220, overflow: 'hidden', borderRadius: 18, backgroundColor: '#112D4E' },
  compact: { width: 108, height: 80, borderRadius: 13 },
  video: { width: '100%', height: '100%', objectFit: 'cover' } as any,
  empty: { width: '100%', height: 220, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1, height: '100%' },
  emptyLabel: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  audioRecovery: { position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  audioRecoveryText: { color: '#176B59', fontSize: 13, fontFamily: 'Inter_700Bold' },
});