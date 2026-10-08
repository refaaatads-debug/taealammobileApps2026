import type { AudioSource } from "expo-audio";

export function normalizeAiAnswerAudio(audio: string | null | undefined): AudioSource | null {
  const value = audio?.trim();
  if (!value) return null;

  if (/^data:audio\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*;base64,/i.test(value)) {
    const payload = value.slice(value.indexOf(",") + 1);
    return payload ? value : null;
  }

  // expo-audio's AudioSource accepts string URLs as well as data URIs.
  if (/^https?:\/\/[^\s]+$/i.test(value)) return value;

  const base64 = value.replace(/\s+/g, "");
  if (!/^[a-z0-9+/_-]+={0,2}$/i.test(base64)) return null;
  const standardBase64 = base64.replace(/-/g, "+").replace(/_/g, "/");
  return `data:audio/mpeg;base64,${standardBase64}`;
}

export function shouldUseAiSpeechFallback(
  audio: string | null | undefined,
  playbackFailed = false,
): boolean {
  return playbackFailed || normalizeAiAnswerAudio(audio) === null;
}