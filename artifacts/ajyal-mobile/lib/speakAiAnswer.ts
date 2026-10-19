import * as Speech from "expo-speech";
import { setAudioModeAsync } from "expo-audio";

const SPEECH_FALLBACK_TIMEOUT_MS = 60_000;

export async function speakAiAnswer(text: string): Promise<void> {
  const content = text.trim();
  if (!content) return;

  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  await Speech.stop().catch(() => {});

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(
      () => settle(new Error("انتهت مهلة تشغيل القراءة الصوتية.")),
      SPEECH_FALLBACK_TIMEOUT_MS,
    );

    try {
      Speech.speak(content, {
        language: /[\u0600-\u06ff]/.test(content) ? "ar-SA" : "en-US",
        volume: 1,
        onDone: () => settle(),
        onStopped: () => settle(),
        onError: (error) => settle(error),
      });
    } catch (error) {
      settle(error instanceof Error ? error : new Error("تعذر تشغيل القراءة الصوتية."));
    }
  });
}