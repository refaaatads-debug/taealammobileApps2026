export const PRIVATE_FILE_TTL_SECONDS = 300;
export const PRIVATE_FILE_REFRESH_MS = 240_000;

export function privateStoragePath(value: string, bucket: string, storageUrl: string): string | null {
  if (!value || value !== value.trim() || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  if (/(?:^|\/)(?:\.|%2e){1,2}(?:\/|%2f|[?#]|$)/i.test(value)) return null;
  let path = value;
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//")) {
    try {
      const url = new URL(value);
      const base = new URL(storageUrl);
      if (url.protocol !== "https:" || url.origin !== base.origin || url.username || url.password || url.hash) return null;
      const prefix = `/storage/v1/object/`;
      if (!url.pathname.startsWith(prefix)) return null;
      const match = url.pathname.slice(prefix.length).match(/^(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
      if (!match || match[1] !== bucket) return null;
      path = decodeURIComponent(match[2]);
    } catch {
      return null;
    }
  }
  // Reject ambiguous encodings, traversal and URL-like input rather than repair it.
  if (/[\\%?#:\u0000-\u001f\u007f]/.test(path)) return null;
  const segments = path.split("/");
  return segments.some((part) => !part || part === "." || part === "..") ? null : path;
}

type SigningClient = {
  auth: { getSession: () => PromiseLike<{ data: { session: { access_token: string; user: { id: string } } | null }; error: unknown }> };
  storage: { from: (bucket: string) => {
    createSignedUrl: (path: string, ttl: number) => PromiseLike<{
      data: { signedUrl?: string } | null;
      error: { message?: string } | null;
    }>;
  } };
};

export async function signPrivateFile(client: SigningClient | null, value: string, bucket: string, storageUrl: string): Promise<string> {
  const path = privateStoragePath(value, bucket, storageUrl);
  if (!path || !client) throw new Error("تعذر إعداد رابط آمن للمرفق");
  const before = await client.auth.getSession();
  const session = before.data.session;
  if (before.error || !session) throw new Error("Private attachment requires an active session.");
  const result = await client.storage.from(bucket).createSignedUrl(path, PRIVATE_FILE_TTL_SECONDS);
  if (result.error || !result.data?.signedUrl) throw new Error(result.error?.message || "تعذر إعداد رابط آمن للمرفق");
  const after = await client.auth.getSession();
  if (after.error || after.data.session?.user.id !== session.user.id || after.data.session?.access_token !== session.access_token) {
    throw new Error("Attachment session changed. Try again.");
  }
  return result.data.signedUrl;
}

// Each refresh/identity change invalidates pending work immediately.
export function createPrivateFileRequestGate() {
  let generation = 0;
  return {
    invalidate: () => ++generation,
    begin: () => ++generation,
    isCurrent: (request: number) => request === generation,
  };
}
