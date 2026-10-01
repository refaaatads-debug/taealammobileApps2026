import { useCallback, useEffect, useRef, useState } from "react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

export type ContinuousVoicePhase =
  | "idle"
  | "preparing"
  | "listening"
  | "transcribing"
  | "speaking";

export type VoiceQuestionContext = {
  isCurrent: () => boolean;
};

export type VoiceQuestionHandler = (
  uri: string,
  context: VoiceQuestionContext,
) => Promise<string | null>;

type UseContinuousVoiceConversationOptions = {
  onQuestion: VoiceQuestionHandler;
  onError: (error: unknown) => void;
};

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};
const SPEECH_THRESHOLD_DB = -48;
const SILENCE_DURATION_MS = 1600;
const MIN_SPEECH_DURATION_MS = 500;
const PLAYER_START_TIMEOUT_MS = 12000;

export function useContinuousVoiceConversation({
  onQuestion,
  onError,
}: UseContinuousVoiceConversationOptions) {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderStatus = useAudioRecorderState(recorder, 200);
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const playerStatus = useAudioPlayerStatus(player);

  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<ContinuousVoicePhase>("idle");

  const onQuestionRef = useRef(onQuestion);
  const onErrorRef = useRef(onError);
  onQuestionRef.current = onQuestion;
  onErrorRef.current = onError;

  const activeRef = useRef(false);
  const sessionIdRef = useRef(0);
  const startLockRef = useRef(false);
  const processingTurnRef = useRef(false);
  const speechStartedAtRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPlaybackSessionRef = useRef<number | null>(null);
  const playbackStartedRef = useRef(false);
  const playbackWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCurrentSession = useCallback(
    (sessionId: number) => activeRef.current && sessionIdRef.current === sessionId,
    [],
  );

  const clearSpeechDetection = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    speechStartedAtRef.current = null;
  }, []);

  const clearPlaybackWatchdog = useCallback(() => {
    if (playbackWatchdogRef.current) clearTimeout(playbackWatchdogRef.current);
    playbackWatchdogRef.current = null;
  }, []);

  const playAudio = useCallback((base64: string | null | undefined) => {
    if (!base64) return;
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    player.replace(`data:audio/mpeg;base64,${base64}`);
    player.play();
  }, [player]);

  const startListening = useCallback(async (sessionId: number) => {
    if (!isCurrentSession(sessionId)) return;
    setPhase("preparing");
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    if (!isCurrentSession(sessionId)) return;
    clearSpeechDetection();
    recorder.record();
    setPhase("listening");
  }, [clearSpeechDetection, isCurrentSession, recorder]);

  const resumeListening = useCallback(async (sessionId: number) => {
    if (!isCurrentSession(sessionId)) return;
    try {
      await startListening(sessionId);
    } catch (error) {
      if (!isCurrentSession(sessionId)) return;
      activeRef.current = false;
      setIsActive(false);
      setPhase("idle");
      clearSpeechDetection();
      onErrorRef.current(error);
    }
  }, [clearSpeechDetection, isCurrentSession, startListening]);

  const submitUtterance = useCallback(async (sessionId: number) => {
    if (!isCurrentSession(sessionId) || processingTurnRef.current) return;
    processingTurnRef.current = true;
    clearSpeechDetection();
    setPhase("transcribing");

    try {
      if (recorder.isRecording) await recorder.stop();
      if (!isCurrentSession(sessionId)) return;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!isCurrentSession(sessionId)) return;

      const uri = recorder.uri;
      if (!uri) throw new Error("لم يتم حفظ التسجيل الصوتي. حاول مرة أخرى.");

      const replyAudio = await onQuestionRef.current(uri, {
        isCurrent: () => isCurrentSession(sessionId),
      });
      if (!isCurrentSession(sessionId)) return;

      if (!replyAudio) {
        await resumeListening(sessionId);
        return;
      }

      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!isCurrentSession(sessionId)) return;
      pendingPlaybackSessionRef.current = sessionId;
      playbackStartedRef.current = false;
      setPhase("speaking");
      player.replace(`data:audio/mpeg;base64,${replyAudio}`);
      player.play();

      clearPlaybackWatchdog();
      playbackWatchdogRef.current = setTimeout(() => {
        if (
          pendingPlaybackSessionRef.current === sessionId
          && !playbackStartedRef.current
          && isCurrentSession(sessionId)
        ) {
          pendingPlaybackSessionRef.current = null;
          onErrorRef.current(new Error("تعذر تشغيل الرد الصوتي. سأعود للاستماع."));
          void resumeListening(sessionId);
        }
      }, PLAYER_START_TIMEOUT_MS);
    } catch (error) {
      if (isCurrentSession(sessionId)) {
        onErrorRef.current(error);
        await resumeListening(sessionId);
      }
    } finally {
      processingTurnRef.current = false;
    }
  }, [
    clearPlaybackWatchdog,
    clearSpeechDetection,
    isCurrentSession,
    player,
    recorder,
    resumeListening,
  ]);

  const start = useCallback(async () => {
    if (activeRef.current || startLockRef.current) return;
    startLockRef.current = true;
    setPhase("preparing");

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error("اسمح للتطبيق باستخدام الميكروفون لبدء المحادثة الصوتية.");
      }

      const sessionId = sessionIdRef.current + 1;
      sessionIdRef.current = sessionId;
      activeRef.current = true;
      setIsActive(true);
      await startListening(sessionId);
    } catch (error) {
      activeRef.current = false;
      setIsActive(false);
      setPhase("idle");
      clearSpeechDetection();
      onErrorRef.current(error);
    } finally {
      startLockRef.current = false;
    }
  }, [clearSpeechDetection, startListening]);

  const end = useCallback(async () => {
    activeRef.current = false;
    sessionIdRef.current += 1;
    setIsActive(false);
    setPhase("idle");
    clearSpeechDetection();
    clearPlaybackWatchdog();
    pendingPlaybackSessionRef.current = null;
    playbackStartedRef.current = false;

    try {
      player.pause();
    } catch {
      // The player may already be released during navigation.
    }

    if (recorder.isRecording && !processingTurnRef.current) {
      try {
        await recorder.stop();
      } catch (error) {
        onErrorRef.current(error);
      }
    }
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch (error) {
      onErrorRef.current(error);
    }
  }, [clearPlaybackWatchdog, clearSpeechDetection, player, recorder]);

  useEffect(() => {
    if (!isActive || phase !== "listening" || !recorderStatus.isRecording) {
      clearSpeechDetection();
      return;
    }

    const level = recorderStatus.metering;
    if (typeof level !== "number") return;

    if (level > SPEECH_THRESHOLD_DB) {
      speechStartedAtRef.current ??= Date.now();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
      return;
    }

    if (speechStartedAtRef.current === null || silenceTimerRef.current) return;
    const sessionId = sessionIdRef.current;
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      const startedAt = speechStartedAtRef.current;
      if (!isCurrentSession(sessionId)) {
        clearSpeechDetection();
        return;
      }
      if (startedAt === null || Date.now() - startedAt < MIN_SPEECH_DURATION_MS) {
        clearSpeechDetection();
        return;
      }
      void submitUtterance(sessionId);
    }, SILENCE_DURATION_MS);
  }, [
    clearSpeechDetection,
    isActive,
    isCurrentSession,
    phase,
    recorderStatus.durationMillis,
    recorderStatus.isRecording,
    recorderStatus.metering,
    submitUtterance,
  ]);

  useEffect(() => {
    const sessionId = pendingPlaybackSessionRef.current;
    if (sessionId === null) return;
    if (!isCurrentSession(sessionId)) {
      pendingPlaybackSessionRef.current = null;
      playbackStartedRef.current = false;
      clearPlaybackWatchdog();
      return;
    }

    if (playerStatus.playing) {
      playbackStartedRef.current = true;
      clearPlaybackWatchdog();
      return;
    }

    if (playerStatus.error || (playerStatus.didJustFinish && playbackStartedRef.current)) {
      pendingPlaybackSessionRef.current = null;
      playbackStartedRef.current = false;
      clearPlaybackWatchdog();
      if (playerStatus.error) onErrorRef.current(new Error(playerStatus.error));
      void resumeListening(sessionId);
    }
  }, [
    clearPlaybackWatchdog,
    isCurrentSession,
    playerStatus.didJustFinish,
    playerStatus.error,
    playerStatus.playing,
    resumeListening,
  ]);

  useEffect(() => () => {
    activeRef.current = false;
    sessionIdRef.current += 1;
    clearSpeechDetection();
    clearPlaybackWatchdog();
    pendingPlaybackSessionRef.current = null;
    try {
      player.pause();
    } catch {
      // The player may already be released during navigation.
    }
    if (recorder.isRecording && !processingTurnRef.current) {
      void recorder.stop().catch(() => {});
    }
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }, [clearPlaybackWatchdog, clearSpeechDetection, player, recorder]);

  return { isActive, phase, start, end, playAudio };
}