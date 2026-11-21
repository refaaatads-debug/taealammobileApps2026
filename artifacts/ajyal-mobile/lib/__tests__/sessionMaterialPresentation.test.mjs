import assert from "node:assert/strict";
import test from "node:test";
import {
  configureSessionRecordingWebVideo,
  getSessionRecordingObjectPath,
  resolveSessionMaterialRecordingUrl,
} from "../sessionMaterialPresentation.ts";

test("disables eager WebM metadata loading before attaching the recording URL", () => {
  const writes = [];
  const video = {
    _preload: "",
    _src: "",
    set preload(value) {
      this._preload = value;
      writes.push("preload");
    },
    get preload() {
      return this._preload;
    },
    set src(value) {
      this._src = value;
      writes.push("src");
    },
    get src() {
      return this._src;
    },
  };

  configureSessionRecordingWebVideo(video, "https://storage.example/recording.webm");

  assert.equal(video.preload, "none");
  assert.equal(video.src, "https://storage.example/recording.webm");
  assert.deepEqual(writes, ["preload", "src"]);
});

test("prefers the recording linked directly to the material", () => {
  assert.equal(
    resolveSessionMaterialRecordingUrl("https://storage.example/material.webm", "https://storage.example/session.webm"),
    "https://storage.example/material.webm",
  );
});

test("falls back to the session recording when the material has no URL", () => {
  assert.equal(
    resolveSessionMaterialRecordingUrl(null, "https://storage.example/session.webm"),
    "https://storage.example/session.webm",
  );
  assert.equal(
    resolveSessionMaterialRecordingUrl("  ", "https://storage.example/session.webm"),
    "https://storage.example/session.webm",
  );
});

test("returns no recording when neither platform source has a usable URL", () => {
  assert.equal(resolveSessionMaterialRecordingUrl(undefined, null), null);
  assert.equal(resolveSessionMaterialRecordingUrl(42, ""), null);
});

test("extracts and decodes a private bucket path from a signed storage URL", () => {
  assert.equal(
    getSessionRecordingObjectPath(
      "https://storage.example/storage/v1/object/sign/session-recordings/teacher%2Flesson%20one.mp4?token=private",
    ),
    "teacher/lesson one.mp4",
  );
});

test("accepts bucket-prefixed relative recording paths", () => {
  assert.equal(
    getSessionRecordingObjectPath("/session-recordings/teacher/lesson.mp4"),
    "teacher/lesson.mp4",
  );
  assert.equal(
    getSessionRecordingObjectPath("session-recordings/teacher/lesson.mp4"),
    "teacher/lesson.mp4",
  );
});

test("does not treat unrelated absolute URLs as private storage paths", () => {
  assert.equal(
    getSessionRecordingObjectPath("https://media.example/lesson.mp4"),
    null,
  );
});
