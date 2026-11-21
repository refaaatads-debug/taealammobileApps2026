export function resolveSessionMaterialRecordingUrl(
  materialUrl: unknown,
  sessionUrl: unknown,
): string | null {
  for (const candidate of [materialUrl, sessionUrl]) {
    if (typeof candidate !== "string") continue;
    const url = candidate.trim();
    if (url) return url;
  }
  return null;
}

export function configureSessionRecordingWebVideo(
  video: { preload: string; src: string },
  url: string,
) {
  video.preload = "none";
  video.src = url;
}

export function getSessionRecordingObjectPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url) return null;

  const marker = "/session-recordings/";
  const markerIndex = url.indexOf(marker);
  let path: string | null = markerIndex >= 0
    ? url.slice(markerIndex + marker.length)
    : null;

  if (
    path === null &&
    !/^[a-z][a-z0-9+.-]*:/i.test(url) &&
    !url.startsWith("//")
  ) {
    const relativePath = url.split(/[?#]/, 1)[0].replace(/^\/+/, "");
    path = relativePath.startsWith("session-recordings/")
      ? relativePath.slice("session-recordings/".length)
      : null;
  }

  if (!path) return null;
  const cleanPath = path.split(/[?#]/, 1)[0];
  if (!cleanPath) return null;

  try {
    return decodeURIComponent(cleanPath);
  } catch {
    return cleanPath;
  }
}
