import { useCallback, useEffect, useRef, useState } from "react";
import { stopRecorderOnUnmount } from "@/lib/recorderUnmount";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Speech from "expo-speech";
import { normalizeAiAnswerAudio } from "@/lib/aiAnswerAudio";
import { speakAiAnswer } from "@/lib/speakAiAnswer";

export type ContinuousVoicePhase =
  | "idle"
  | "preparing"
  | "listening"
  | "transcribing"
  | "speaking";

export type VoiceQuestionContext = {
  isCurrent: () => boolean;
};

export type VoiceQuestionAnswer = {
  text: string;
  audio: string | null;
};

export type VoiceQuestionHandler = (
  uri: string,
  context: VoiceQuestionContext,
) => Promise<VoiceQuestionAnswer | null>;

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
  const pendingAnswerTextRef = useRef("");
  const playbackStartedRef = useRef(false);
  const playbackWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReplayTextRef = useRef<string | null>(null);
  const replayStartedRef = useRef(false);
  const replayWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const stopAnswerPlayback = useCallback(async () => {
    pendingReplayTextRef.current = null;
    replayStartedRef.current = false;
    if (replayWatchdogRef.current) clearTimeout(replayWatchdogRef.current);
    replayWatchdogRef.current = null;
    try {
      player.pause();
    } catch {
      // The player may already be released during navigation.
    }
    await Speech.stop().catch(() => {});
  }, [player]);

  const playAudio = useCallback(async (
    audio: string | null | undefined,
    fallbackText?: string,
  ): Promise<boolean> => {
    await stopAnswerPlayback();
    const source = normalizeAiAnswerAudio(audio);
    if (!source) return false;
    pendingReplayTextRef.current = fallbackText?.trim() || null;

    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      player.replace(source);
      player.play();
      if (pendingReplayTextRef.current) {
        const replayText = pendingReplayTextRef.current;
        replayWatchdogRef.current = setTimeout(() => {
          if (pendingReplayTextRef.current !== replayText || replayStartedRef.current) return;
          pendingReplayTextRef.current = null;
          replayWatchdogRef.current = null;
          void speakAiAnswer(replayText).catch((error) => onErrorRef.current(error));
        }, PLAYER_START_TIMEOUT_MS);
      }
      return true;
    } catch (error) {
      pendingReplayTextRef.current = null;
      if (replayWatchdogRef.current) clearTimeout(replayWatchdogRef.current);
      replayWatchdogRef.current = null;
      throw error;
    }
  }, [player, stopAnswerPlayback]);

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

  const speakThenResume = useCallback(async (sessionId: number, text: string) => {
    if (!isCurrentSession(sessionId)) return;
    setPhase("speaking");
    try {
      await speakAiAnswer(text);
    } catch (error) {
      if (isCurrentSession(sessionId)) onErrorRef.current(error);
    }
    if (isCurrentSession(sessionId)) await resumeListening(sessionId);
  }, [isCurrentSession, resumeListening]);

  const submitUtterance = useCallback(async (sessionId: number) => {
    if (!isCurrentSession(sessionId) || processingTurnRef.current) return;
    processingTurnRef.current = true;
    clearSpeechDetection();
    setPhase("transcribing");
    let answerText = "";

    try {
      if (recorder.isRecording) await recorder.stop();
      if (!isCurrentSession(sessionId)) return;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!isCurrentSession(sessionId)) return;

      const uri = recorder.uri;
      if (!uri) throw new Error("لم يتم حفظ التسجيل الصوتي. حاول مرة أخرى.");

      const reply = await onQuestionRef.current(uri, {
        isCurrent: () => isCurrentSession(sessionId),
      });
      if (!isCurrentSession(sessionId)) return;

      answerText = reply?.text.trim() ?? "";
      if (!reply || !answerText) {
        await resumeListening(sessionId);
        return;
      }

      const audioSource = normalizeAiAnswerAudio(reply.audio);
      if (!audioSource) {
        await speakThenResume(sessionId, answerText);
        return;
      }

      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!isCurrentSession(sessionId)) return;
      pendingPlaybackSessionRef.current = sessionId;
      pendingAnswerTextRef.current = answerText;
      playbackStartedRef.current = false;
      setPhase("speaking");
      player.replace(audioSource);
      player.play();

      clearPlaybackWatchdog();
      playbackWatchdogRef.current = setTimeout(() => {
        if (
          pendingPlaybackSessionRef.current === sessionId
          && !playbackStartedRef.current
          && isCurrentSession(sessionId)
        ) {
          pendingPlaybackSessionRef.current = null;
          const fallbackText = pendingAnswerTextRef.current;
          pendingAnswerTextRef.current = "";
          void speakThenResume(sessionId, fallbackText);
        }
      }, PLAYER_START_TIMEOUT_MS);
    } catch (error) {
      if (isCurrentSession(sessionId)) {
        const fallbackText = pendingAnswerTextRef.current || answerText;
        pendingPlaybackSessionRef.current = null;
        pendingAnswerTextRef.current = "";
        playbackStartedRef.current = false;
        clearPlaybackWatchdog();
        if (fallbackText) {
          await speakThenResume(sessionId, fallbackText);
        } else {
          onErrorRef.current(error);
          await resumeListening(sessionId);
        }
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
    speakThenResume,
  ]);

  const start = useCallback(async () => {
    if (activeRef.current || startLockRef.current) return;
    startLockRef.current = true;
    setPhase("preparing");

    try {
      await stopAnswerPlayback();
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
  }, [clearSpeechDetection, startListening, stopAnswerPlayback]);

  const end = useCallback(async () => {
    activeRef.current = false;
    sessionIdRef.current += 1;
    setIsActive(false);
    setPhase("idle");
    clearSpeechDetection();
    clearPlaybackWatchdog();
    pendingPlaybackSessionRef.current = null;
    pendingAnswerTextRef.current = "";
    playbackStartedRef.current = false;

    if (replayWatchdogRef.current) clearTimeout(replayWatchdogRef.current);
    replayWatchdogRef.current = null;
    pendingReplayTextRef.current = null;
    replayStartedRef.current = false;

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
    await Speech.stop().catch(() => {});
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
    if (pendingReplayTextRef.current) {
      if (playerStatus.playing) {
        replayStartedRef.current = true;
        if (replayWatchdogRef.current) clearTimeout(replayWatchdogRef.current);
        replayWatchdogRef.current = null;
      } else if (playerStatus.error) {
        const fallbackText = pendingReplayTextRef.current;
        pendingReplayTextRef.current = null;
        replayStartedRef.current = false;
        if (replayWatchdogRef.current) clearTimeout(replayWatchdogRef.current);
        replayWatchdogRef.current = null;
        void speakAiAnswer(fallbackText).catch((error) => onErrorRef.current(error));
      } else if (playerStatus.didJustFinish && replayStartedRef.current) {
        pendingReplayTextRef.current = null;
        replayStartedRef.current = false;
        if (replayWatchdogRef.current) clearTimeout(replayWatchdogRef.current);
        replayWatchdogRef.current = null;
      }
    }

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

    if (playerStatus.error) {
      pendingPlaybackSessionRef.current = null;
      const fallbackText = pendingAnswerTextRef.current;
      pendingAnswerTextRef.current = "";
      playbackStartedRef.current = false;
      clearPlaybackWatchdog();
      void speakThenResume(sessionId, fallbackText);
      return;
    }

    if (playerStatus.didJustFinish && playbackStartedRef.current) {
      pendingPlaybackSessionRef.current = null;
      pendingAnswerTextRef.current = "";
      playbackStartedRef.current = false;
      clearPlaybackWatchdog();
      void resumeListening(sessionId);
    }
  }, [
    clearPlaybackWatchdog,
    isCurrentSession,
    playerStatus.didJustFinish,
    playerStatus.error,
    playerStatus.playing,
    resumeListening,
    speakThenResume,
  ]);

  useEffect(() => () => {
    activeRef.current = false;
    sessionIdRef.current += 1;
    clearSpeechDetection();
    clearPlaybackWatchdog();
    if (replayWatchdogRef.current) clearTimeout(replayWatchdogRef.current);
    pendingPlaybackSessionRef.current = null;
    pendingAnswerTextRef.current = "";
    pendingReplayTextRef.current = null;
    try {
      player.pause();
    } catch {
      // The player may already be released during navigation.
    }
    void Speech.stop().catch(() => {});
    stopRecorderOnUnmount(recorder, processingTurnRef.current);
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }, [clearPlaybackWatchdog, clearSpeechDetection, player, recorder]);

  return { isActive, phase, start, end, playAudio, stopAnswerPlayback };
}