export type ReceiptMessage = { id?: unknown; sender_id?: unknown };

export function receiptMessageIds(userId: string, messages: ReceiptMessage[]) {
  const own = new Set<string>();
  const incoming = new Set<string>();
  if (!userId) return { own: [], incoming: [] };
  for (const m of messages) {
    if (typeof m.id !== 'string' || !m.id || typeof m.sender_id !== 'string' || !m.sender_id) continue;
    (m.sender_id === userId ? own : incoming).add(m.id);
  }
  return { own: [...own], incoming: [...incoming] };
}

export function receiptChunks(ids: string[], size = 100): string[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('Invalid batch size');
  const batches: string[][] = [];
  for (let start = 0; start < ids.length; start += size) batches.push(ids.slice(start, start + size));
  return batches;
}
