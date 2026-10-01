import assert from "node:assert/strict";
import test from "node:test";
import {
  audioUploadDescriptor,
  createWebAudioUpload,
} from "../voiceAudioUpload.ts";

test("native audio URIs keep the matching multipart filename and MIME type", () => {
  assert.deepEqual(audioUploadDescriptor("file:///cache/student-question.3gp"), {
    name: "ai-tutor-question.3gp",
    type: "audio/3gpp",
  });
});

test("web recordings become actual multipart files with the recorder MIME type", async () => {
  const prepared = await createWebAudioUpload(
    "blob:https://preview.example/recording-id",
    async () => new Response(
      new Blob(["recorded audio"], { type: "audio/webm;codecs=opus" }),
    ),
  );
  const formData = new FormData();
  formData.append("audio", prepared.blob, prepared.name);

  const request = new Request("https://example.test/transcribe", {
    method: "POST",
    body: formData,
  });
  const receivedAudio = (await request.formData()).get("audio");

  assert.ok(receivedAudio instanceof Blob);
  assert.equal(receivedAudio.name, "ai-tutor-question.webm");
  assert.equal(receivedAudio.type, "audio/webm");
  assert.equal(receivedAudio.size, "recorded audio".length);
});

test("rejects empty browser recordings instead of submitting an invalid form", async () => {
  await assert.rejects(
    createWebAudioUpload(
      "blob:https://preview.example/empty-recording",
      async () => new Response(new Blob([], { type: "audio/webm" })),
    ),
    /التسجيل الصوتي فارغ/,
  );
});