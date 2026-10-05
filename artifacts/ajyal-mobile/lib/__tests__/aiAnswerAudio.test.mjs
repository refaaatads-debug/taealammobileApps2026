import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAiAnswerAudio,
  shouldUseAiSpeechFallback,
} from "../aiAnswerAudio.ts";

test("raw MP3 base64 keeps the existing audio/mpeg data URI behavior", () => {
  assert.equal(
    normalizeAiAnswerAudio("  QUJDRA==  "),
    "data:audio/mpeg;base64,QUJDRA==",
  );
});

test("audio data URIs are preserved instead of being prefixed a second time", () => {
  const dataUri = "data:audio/mpeg;base64,QUJDRA==";
  assert.equal(normalizeAiAnswerAudio(dataUri), dataUri);
});

test("HTTP(S) answer URLs are supported by expo-audio AudioSource", () => {
  assert.equal(
    normalizeAiAnswerAudio("https://cdn.example.test/answer.mp3?token=abc"),
    "https://cdn.example.test/answer.mp3?token=abc",
  );
  assert.equal(normalizeAiAnswerAudio("http://cdn.example.test/answer.wav"), "http://cdn.example.test/answer.wav");
});

test("invalid or missing audio selects speech fallback, and playback failure selects it too", () => {
  assert.equal(shouldUseAiSpeechFallback(null), true);
  assert.equal(shouldUseAiSpeechFallback("<not-audio>"), true);
  assert.equal(shouldUseAiSpeechFallback("QUJDRA=="), false);
  assert.equal(shouldUseAiSpeechFallback("https://cdn.example.test/answer.mp3", true), true);
});