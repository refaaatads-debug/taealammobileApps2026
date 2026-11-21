import assert from "node:assert/strict";
import test from "node:test";
import {
  setActiveChatBookingIds,
  setActiveSupportTicketId,
  shouldSuppressActiveConversationNotification,
} from "../activeChatNotifications.ts";

test("suppresses a message push for the conversation currently open in the foreground", () => {
  setActiveChatBookingIds(["booking-1", "booking-2"]);

  assert.equal(shouldSuppressActiveConversationNotification({
    type: "chat_message",
    bookingId: "booking-2",
  }, "active"), true);
});

test("keeps message pushes for other conversations visible", () => {
  setActiveChatBookingIds(["booking-1"]);

  assert.equal(shouldSuppressActiveConversationNotification({
    type: "chat_message",
    bookingId: "booking-2",
  }, "active"), false);
});

test("does not suppress messages while the app is backgrounded or inactive", () => {
  setActiveChatBookingIds(["booking-1"]);
  const notification = { type: "chat_message", bookingId: "booking-1" };

  assert.equal(shouldSuppressActiveConversationNotification(notification, "background"), false);
  assert.equal(shouldSuppressActiveConversationNotification(notification, "inactive"), false);
});

test("does not suppress platform notifications or messages without a booking", () => {
  setActiveChatBookingIds(["booking-1"]);

  assert.equal(shouldSuppressActiveConversationNotification({
    type: "booking_accepted",
    bookingId: "booking-1",
  }, "active"), false);
  assert.equal(shouldSuppressActiveConversationNotification({ type: "chat_message" }, "active"), false);
});

test("suppresses support replies only for the support ticket open in the foreground", () => {
  setActiveSupportTicketId("ticket-1");

  assert.equal(shouldSuppressActiveConversationNotification({
    type: "support_reply",
    supportTicketId: "ticket-1",
  }, "active"), true);
  assert.equal(shouldSuppressActiveConversationNotification({
    type: "support_message",
    ticket_id: "ticket-2",
  }, "active"), false);
  assert.equal(shouldSuppressActiveConversationNotification({
    type: "support_reply",
  }, "active"), false);
});

test("does not suppress other support notifications while a ticket is open", () => {
  setActiveSupportTicketId("ticket-1");

  assert.equal(shouldSuppressActiveConversationNotification({
    type: "support_ticket",
    supportTicketId: "ticket-1",
  }, "active"), false);
});
