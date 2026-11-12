export type AudioUploadDescriptor = {
  name: string;
  type: string;
};

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  webm: "audio/webm",
  "3gp": "audio/3gpp",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  aac: "audio/aac",
};

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/webm": "webm",
  "audio/3gpp": "3gp",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
};

function normalizeAudioMimeType(value?: string | null): string | null {
  const mimeType = value?.split(";")[0]?.trim().toLowerCase();
  return mimeType?.startsWith("audio/") ? mimeType : null;
}

function extensionFromUri(uri: string): string | null {
  return uri.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase() ?? null;
}

export function audioUploadDescriptor(
  uri: string,
  detectedMimeType?: string | null,
): AudioUploadDescriptor {
  const mimeType = normalizeAudioMimeType(detectedMimeType);
  const extension = (mimeType && EXTENSION_BY_MIME_TYPE[mimeType])
    || extensionFromUri(uri)
    || "m4a";

  return {
    name: `ai-tutor-question.${extension}`,
    type: mimeType || MIME_TYPE_BY_EXTENSION[extension] || "audio/mp4",
  };
}

export async function createWebAudioUpload(
  uri: string,
  fetchAudio: (input: string) => Promise<Response> = (input) => fetch(input),
): Promise<AudioUploadDescriptor & { blob: Blob }> {
  const response = await fetchAudio(uri);
  if (!response.ok) {
    throw new Error("تعذر قراءة التسجيل الصوتي من الجهاز.");
  }

  const sourceBlob = await response.blob();
  if (!sourceBlob.size) {
    throw new Error("التسجيل الصوتي فارغ. سجّل السؤال مرة أخرى.");
  }

  const mimeType = normalizeAudioMimeType(sourceBlob.type) || "audio/webm";
  const descriptor = audioUploadDescriptor(uri, mimeType);
  const blob = sourceBlob.type === descriptor.type
    ? sourceBlob
    : new Blob([sourceBlob], { type: descriptor.type });

  return { ...descriptor, blob };
}