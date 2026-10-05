export type ChatHistoryRow = Record<string, unknown>;

type ChatHistoryQueryResult<Row extends ChatHistoryRow> = {
  data: Row[] | null;
  error: unknown | null;
};

export const CHAT_HISTORY_BOOKING_BATCH_SIZE = 40;

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