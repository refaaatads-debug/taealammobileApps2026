export type SessionChatInsertResult<T> =
  | { ok: true; message: T }
  | { ok: false };

export async function attemptSessionChatInsert<T>(
  insert: () => PromiseLike<{ data: T | null; error: unknown | null }>,
): Promise<SessionChatInsertResult<T>> {
  try {
    const result = await insert();
    if (result.error || !result.data) return { ok: false };
    return { ok: true, message: result.data };
  } catch {
    return { ok: false };
  }
}
