import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

type SessionVideoProps = {
  stream: any;
  nativeView?: any;
  label: string;
  compact?: boolean;
  height?: number;
  fit?: 'contain' | 'cover';
  scale?: number;
};

export function SessionVideo({
  stream,
  nativeView,
  label,
  compact = false,
  height,
  fit = 'cover',
  scale = 1,
}: SessionVideoProps) {
  const videoRef = useRef<any>(null);
  const videoTracks = stream?.getVideoTracks?.() ?? [];
  const hasLiveVideo = videoTracks.some((track: any) => track?.readyState !== 'ended');
  const videoTrackSignature = videoTracks
    .map((track: any) => `${track?.id ?? 'video'}:${track?.readyState ?? 'unknown'}:${track?.enabled !== false}`)
    .join('|');

  useEffect(() => {
    if (Platform.OS !== 'web' || !videoRef.current) return;
    videoRef.current.srcObject = stream ?? null;
    if (stream) void videoRef.current.play?.().catch(() => undefined);
  }, [stream, videoTrackSignature]);

  if (!stream || !hasLiveVideo) {
    return (
      <View style={[styles.empty, compact && styles.compact, height ? { height } : null, { backgroundColor: '#112D4E', transform: [{ scale }] }]}>
        <Text style={styles.emptyLabel}>{stream && !compact ? 'الصوت متصل — بانتظار فيديو المعلم' : label}</Text>
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
      <View style={[styles.frame, compact && styles.compact, height ? { height } : null, { transform: [{ scale }] }]}>
        {React.createElement('video', {
          ref: videoRef,
          autoPlay: true,
          playsInline: true,
          muted: compact,
          // This is a raw HTML element on web, so its style must be a plain
          // CSS object rather than a React Native style array.
          style: webVideoStyle,
        })}
      </View>
    );
  }

  if (!nativeView) {
    return (
      <View style={[styles.empty, compact && styles.compact, height ? { height } : null, { backgroundColor: '#112D4E', transform: [{ scale }] }]}>
        <Text style={styles.emptyLabel}>جارٍ تجهيز الفيديو…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, compact && styles.compact, height ? { height } : null, { transform: [{ scale }] }]}>
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
  emptyLabel: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});