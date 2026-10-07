import assert from "node:assert/strict";
import test from "node:test";
import {
  setActiveChatBookingIds,
  shouldSuppressActiveChatMessage,
} from "../activeChatNotifications.ts";

test("suppresses a message push for the conversation currently open in the foreground", () => {
  setActiveChatBookingIds(["booking-1", "booking-2"]);

  assert.equal(shouldSuppressActiveChatMessage({
    type: "chat_message",
    bookingId: "booking-2",
  }, "active"), true);
});

test("keeps message pushes for other conversations visible", () => {
  setActiveChatBookingIds(["booking-1"]);

  assert.equal(shouldSuppressActiveChatMessage({
    type: "chat_message",
    bookingId: "booking-2",
  }, "active"), false);
});

test("does not suppress messages while the app is backgrounded or inactive", () => {
  setActiveChatBookingIds(["booking-1"]);
  const notification = { type: "chat_message", bookingId: "booking-1" };

  assert.equal(shouldSuppressActiveChatMessage(notification, "background"), false);
  assert.equal(shouldSuppressActiveChatMessage(notification, "inactive"), false);
});

test("does not suppress platform notifications or messages without a booking", () => {
  setActiveChatBookingIds(["booking-1"]);

  assert.equal(shouldSuppressActiveChatMessage({
    type: "booking_accepted",
    bookingId: "booking-1",
  }, "active"), false);
  assert.equal(shouldSuppressActiveChatMessage({ type: "chat_message" }, "active"), false);
});
