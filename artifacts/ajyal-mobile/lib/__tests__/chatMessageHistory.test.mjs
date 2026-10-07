import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingMessageRealtimeFilters,
  CHAT_HISTORY_BOOKING_BATCH_SIZE,
  loadParticipantChatHistory,
  mergeChatMessageRows,
} from "../chatMessageHistory.ts";

test("builds one supported equality filter per unique booking", () => {
  assert.deepEqual(
    bookingMessageRealtimeFilters(["booking-1", "booking-2", "booking-1", ""]),
    ["booking_id=eq.booking-1", "booking_id=eq.booking-2"],
  );
});

test("merges realtime rows with fetched history once and in chronological order", () => {
  const history = [
    { id: "earlier", created_at: "2026-10-06T10:00:00.000Z", content: "old" },
    { id: "latest", created_at: "2026-10-06T10:02:00.000Z", content: "original" },
  ];
  const merged = mergeChatMessageRows(history, [
    { id: "latest", created_at: "2026-10-06T10:02:00.000Z", content: "updated" },
    { id: "new", created_at: "2026-10-06T10:03:00.000Z", content: "new" },
  ]);

  assert.deepEqual(merged.map((row) => row.id), ["earlier", "latest", "new"]);
  assert.equal(merged[1].content, "updated");
});

test("loads history across every booking for one participant in bounded, deduplicated batches", async () => {
  const bookingIds = Array.from(
    { length: CHAT_HISTORY_BOOKING_BATCH_SIZE + 1 },
    (_, index) => `booking-${index}`,
  );
  bookingIds.push("booking-0");
  const requestedBatches = [];

  const history = await loadParticipantChatHistory(bookingIds, async (batch) => {
    requestedBatches.push(batch);
    return {
      data: batch.map((bookingId, index) => ({
        id: `${bookingId}-${index}`,
        booking_id: bookingId,
        created_at: bookingId === "booking-0" ? "2026-01-02T00:00:00.000Z" : "2026-01-01T00:00:00.000Z",
      })),
      error: null,
    };
  });

  assert.deepEqual(requestedBatches.map((batch) => batch.length), [40, 1]);
  assert.equal(requestedBatches.flat().filter((id) => id === "booking-0").length, 1);
  assert.equal(history.length, CHAT_HISTORY_BOOKING_BATCH_SIZE + 1);
  assert.equal(history.at(-1).booking_id, "booking-0");
});

test("rejects history query failures instead of returning an empty conversation", async () => {
  let requests = 0;
  const bookingIds = Array.from({ length: CHAT_HISTORY_BOOKING_BATCH_SIZE + 1 }, (_, index) => `booking-${index}`);

  await assert.rejects(
    loadParticipantChatHistory(bookingIds, async () => {
      requests += 1;
      return requests === 1
        ? { data: [{ id: "partial", created_at: "2026-01-01T00:00:00.000Z" }], error: null }
        : { data: null, error: new Error("Chat history is unavailable") };
    }),
    /Chat history is unavailable/,
  );
  assert.equal(requests, 2);
});

test("treats an empty successful history response as a valid empty conversation", async () => {
  let requests = 0;
  const history = await loadParticipantChatHistory(["booking-1"], async () => {
    requests += 1;
    return { data: [], error: null };
  });

  assert.deepEqual(history, []);
  assert.equal(requests, 1);
});