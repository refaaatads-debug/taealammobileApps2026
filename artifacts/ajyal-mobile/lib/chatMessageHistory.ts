export type ChatHistoryRow = Record<string, unknown>;

type ChatHistoryQueryResult<Row extends ChatHistoryRow> = {
  data: Row[] | null;
  error: unknown | null;
};

export const CHAT_HISTORY_BOOKING_BATCH_SIZE = 40;

export function bookingMessageRealtimeFilters(bookingIds: string[]): string[] {
  return [...new Set(bookingIds.map(String).map((id) => id.trim()).filter(Boolean))]
    .map((bookingId) => `booking_id=eq.${bookingId}`);
}

export function mergeChatMessageRows<Row extends ChatHistoryRow>(
  current: readonly Row[],
  incoming: readonly Row[],
): Row[] {
  const byId = new Map<string, Row>();
  const withoutId: Row[] = [];

  for (const row of [...current, ...incoming]) {
    const id = row.id;
    if (id === undefined || id === null || String(id).length === 0) {
      withoutId.push(row);
      continue;
    }
    const key = String(id);
    const previous = byId.get(key);
    byId.set(key, previous ? { ...previous, ...row } as Row : row);
  }

  return [...byId.values(), ...withoutId].sort((a, b) => {
    const aDate = typeof a.created_at === "string" ? Date.parse(a.created_at) : 0;
    const bDate = typeof b.created_at === "string" ? Date.parse(b.created_at) : 0;
    return (Number.isFinite(aDate) ? aDate : 0) - (Number.isFinite(bDate) ? bDate : 0);
  });
}

export async function loadParticipantChatHistory<Row extends ChatHistoryRow>(
  bookingIds: string[],
  fetchBatch: (bookingIdBatch: string[]) => Promise<ChatHistoryQueryResult<Row>>,
): Promise<Row[]> {
  const uniqueBookingIds = [...new Set(bookingIds.map(String).filter(Boolean))];
  const bookingIdBatches: string[][] = [];

  for (let index = 0; index < uniqueBookingIds.length; index += CHAT_HISTORY_BOOKING_BATCH_SIZE) {
    bookingIdBatches.push(uniqueBookingIds.slice(index, index + CHAT_HISTORY_BOOKING_BATCH_SIZE));
  }

  const results = await Promise.all(bookingIdBatches.map(fetchBatch));
  const failedResult = results.find((result) => result.error !== null && result.error !== undefined);
  if (failedResult) throw failedResult.error;

  return results
    .flatMap((result) => result.data ?? [])
    .sort((a, b) => {
      const aDate = typeof a.created_at === "string" ? Date.parse(a.created_at) : 0;
      const bDate = typeof b.created_at === "string" ? Date.parse(b.created_at) : 0;
      return aDate - bDate;
    });
}