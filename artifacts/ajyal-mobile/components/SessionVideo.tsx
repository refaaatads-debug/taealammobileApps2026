import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type SessionVideoProps = {
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
  // Element kept in state (callback ref) so play() re-runs whenever the div is created or replaced,
  // not only when the track object changes. Fixes the inline view staying black until fullscreen remounts it.
  const [agoraWebVideoEl, setAgoraWebVideoEl] = useState<any>(null);
  const hasAgoraVideo = Platform.OS !== 'web' && agoraSurfaceView && agoraRemoteUid !== null;

  useEffect(() => {
    if (Platform.OS !== 'web' || !agoraWebRemoteVideoTrack || !agoraWebVideoEl) return;
    try {
      agoraWebRemoteVideoTrack.play(agoraWebVideoEl);
    } catch {
      // Video can be republished after the component mounts; the next track update retries.
    }
    return () => agoraWebRemoteVideoTrack.stop?.();
  }, [agoraWebRemoteVideoTrack, agoraWebVideoEl]);

  if (Platform.OS === 'web' && (agoraWebRemoteAudioTrack || agoraWebRemoteVideoTrack)) {
    return (
      <View style={[styles.frame, compact && styles.compact, fill && styles.fill, !fill && height ? { height } : null, { transform: [{ scale }] }]}>
        {React.createElement('div', {
          ref: setAgoraWebVideoEl,
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

  return (
    <View style={[styles.empty, compact && styles.compact, fill && styles.fill, !fill && height ? { height } : null, { backgroundColor: '#112D4E', transform: [{ scale }] }]}>
      <Text style={styles.emptyLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', height: 220, overflow: 'hidden', borderRadius: 18, backgroundColor: '#112D4E' },
  compact: { width: 108, height: 80, borderRadius: 13 },
  empty: { width: '100%', height: 220, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1, height: '100%' },
  video: { width: '100%', height: '100%' },
  emptyLabel: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  audioRecovery: { position: 'absolute', alignSelf: 'center', bottom: 14, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#FFFFFF' },
  audioRecoveryText: { color: '#112D4E', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});