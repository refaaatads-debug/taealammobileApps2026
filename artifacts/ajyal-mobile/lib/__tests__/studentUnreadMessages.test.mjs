import assert from "node:assert/strict";
import test from "node:test";
import { getStudentUnreadChatMessageCount } from "../studentUnreadMessages.ts";

function createClient({ bookings = [], messages = [], errorByTable = {} } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const filters = {};
      calls.push({ table, filters });
      const query = {
        select(columns) {
          filters.columns = columns;
          return query;
        },
        eq(column, value) {
          filters[column] = value;
          return query;
        },
        in(column, values) {
          filters[column] = values;
          return query;
        },
        then(resolve, reject) {
          if (errorByTable[table]) {
            return Promise.resolve({ data: null, error: errorByTable[table] }).then(resolve, reject);
          }
          const source = table === "bookings" ? bookings : messages;
          const data = source.filter((row) => {
            if (table === "bookings") return row.student_id === filters.student_id;
            return filters.booking_id.includes(row.booking_id);
          });
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test("counts only incoming messages that are not in the local read set", async () => {
  const client = createClient({
    bookings: [
      { id: "booking-1", student_id: "student-1" },
      { id: "booking-2", student_id: "student-1" },
      { id: "other-booking", student_id: "student-2" },
    ],
    messages: [
      { id: "unread-1", booking_id: "booking-1", sender_id: "teacher-1" },
      { id: "read-1", booking_id: "booking-1", sender_id: "teacher-1" },
      { id: "sent-1", booking_id: "booking-1", sender_id: "student-1" },
      { id: "unread-2", booking_id: "booking-2", sender_id: "teacher-2" },
      { id: "other-user", booking_id: "other-booking", sender_id: "teacher-3" },
    ],
  });

  const count = await getStudentUnreadChatMessageCount(
    client,
    "student-1",
    new Set(["read-1"]),
  );

  assert.equal(count, 2);
  assert.equal(client.calls[0].filters.student_id, "student-1");
  assert.equal(client.calls[1].filters.booking_id.length, 2);
});

test("batches booking IDs to stay within PostgREST query limits", async () => {
  const bookings = Array.from({ length: 41 }, (_, index) => ({
    id: `booking-${index}`,
    student_id: "student-1",
  }));
  const client = createClient({ bookings });

  const count = await getStudentUnreadChatMessageCount(client, "student-1", new Set());

  const messageQueries = client.calls.filter((call) => call.table === "chat_messages");
  assert.equal(count, 0);
  assert.deepEqual(messageQueries.map((call) => call.filters.booking_id.length), [40, 1]);
});

test("does not hide unread-message query failures", async () => {
  const client = createClient({
    errorByTable: { bookings: new Error("Bookings request failed") },
  });

  await assert.rejects(
    getStudentUnreadChatMessageCount(client, "student-1", new Set()),
    /Bookings request failed/,
  );
});