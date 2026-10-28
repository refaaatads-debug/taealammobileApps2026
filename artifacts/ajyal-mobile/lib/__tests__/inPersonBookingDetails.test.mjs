import test from "node:test";
import assert from "node:assert/strict";
import { getInPersonBookingIds } from "../inPersonBookingDetails.ts";

test("loads accepted request bookings alongside upcoming in-person sessions", () => {
  assert.deepEqual(
    getInPersonBookingIds(
      ["session-a", "session-b"],
      [{ booking_id: "session-b" }, { booking_id: "request-booking" }],
    ),
    ["session-a", "session-b", "request-booking"],
  );
});

test("ignores missing or blank booking IDs", () => {
  assert.deepEqual(
    getInPersonBookingIds([], [{ booking_id: null }, {}, { booking_id: "  " }]),
    [],
  );
});
