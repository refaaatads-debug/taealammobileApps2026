import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBookingRequestStatusUpdate,
  filterBookingRequestGroupsByStatus,
  filterUnbookedAcceptedRequestGroups,
  groupBookingRequests,
  isPendingBookingRequest,
} from "../bookingRequestPresentation.ts";

const slot = "2026-11-15T10:00:00.000Z";

function request(id, status, overrides = {}) {
  return {
    id,
    groupId: null,
    status,
    subject: "رياضيات",
    scheduledAt: slot,
    durationMinutes: 60,
    ...overrides,
  };
}

test("accepted requests leave pending and disappear once a confirmed upcoming session exists", () => {
  const groups = groupBookingRequests([
    request("open", "open"),
    request("matched", "accepted", { scheduledAt: slot }),
    request("waiting-booking", "accepted", { id: "waiting-booking", scheduledAt: "2026-11-15T11:00:00.000Z" }),
  ]);
  const sessions = [{
    id: "booking-1",
    subject: "رياضيات",
    scheduledAt: slot,
    duration: "٦٠ دقيقة",
    status: "upcoming",
  }];

  assert.deepEqual(
    filterBookingRequestGroupsByStatus(groups, ["open"]).map((group) => group.request.id),
    ["open"],
  );
  assert.deepEqual(
    filterUnbookedAcceptedRequestGroups(groups, sessions).map((group) => group.request.id),
    ["waiting-booking"],
  );
});

test("a partially confirmed group shows only the slots without matching bookings", () => {
  const groups = groupBookingRequests([
    request("group-1", "accepted", { groupId: "group-a" }),
    request("group-2", "accepted", { id: "group-2", groupId: "group-a", scheduledAt: "2026-11-15T11:00:00.000Z" }),
  ]);
  const remaining = filterUnbookedAcceptedRequestGroups(groups, [{
    id: "booking-1",
    subject: "رياضيات",
    scheduledAt: slot,
    duration: "60 دقيقة",
    status: "upcoming",
  }]);

  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].count, 1);
  assert.deepEqual(remaining[0].items.map((item) => item.id), ["group-2"]);
});

test("a booked lesson stays out of requests after completion but does not match an in-person lesson", () => {
  const groups = groupBookingRequests([request("accepted", "accepted")]);
  const completed = filterUnbookedAcceptedRequestGroups(groups, [{
    id: "booking-done",
    subject: "رياضيات",
    scheduledAt: slot,
    duration: "60 دقيقة",
    status: "done",
    deliveryMode: "online",
  }]);
  const unrelatedInPerson = filterUnbookedAcceptedRequestGroups(groups, [{
    id: "in-person",
    subject: "رياضيات",
    scheduledAt: slot,
    duration: "60 دقيقة",
    status: "upcoming",
    deliveryMode: "in_person",
  }]);

  assert.equal(completed.length, 0);
  assert.equal(unrelatedInPerson.length, 1);
});

test("realtime confirmation moves the student request out of pending and removes teacher requests immediately", () => {
  const requests = [
    request("a", "open", { groupId: "group-a" }),
    request("b", "open", { id: "b", groupId: "group-a" }),
    request("other", "open"),
  ];
  const update = { id: "a", group_id: "group-a", status: "confirmed", accepted_by: "teacher-1" };

  const studentRequests = applyBookingRequestStatusUpdate(requests, update, "student");
  assert.ok(studentRequests);
  assert.deepEqual(studentRequests.map((item) => item.status), ["accepted", "accepted", "open"]);
  assert.deepEqual(
    filterBookingRequestGroupsByStatus(groupBookingRequests(studentRequests), ["open"]).map((group) => group.request.id),
    ["other"],
  );

  const teacherRequests = applyBookingRequestStatusUpdate(requests, update, "teacher");
  assert.deepEqual(teacherRequests?.map((item) => item.id), ["other"]);
});

test("resolved booking and ended session states never appear in pending requests", () => {
  const requests = groupBookingRequests([
    request("plain-open", "open"),
    request("accepted-booking", "open", { booking_status: "accepted" }),
    request("confirmed-booking", "open", { bookingStatus: "confirmed" }),
    request("completed-booking", "open", { booking_status: "completed" }),
    request("ended-session", "open", { session_status: "ended" }),
  ]);

  assert.deepEqual(
    filterBookingRequestGroupsByStatus(requests, ["open"]).map((group) => group.request.id),
    ["plain-open"],
  );
  assert.equal(isPendingBookingRequest({ status: "confirmed" }), false);
  assert.equal(isPendingBookingRequest({ status: "completed" }), false);
  assert.equal(isPendingBookingRequest({ status: "open", session_status: "ended" }), false);
  assert.equal(isPendingBookingRequest({ status: "open", request_status: "confirmed" }), false);
  assert.equal(isPendingBookingRequest({ status: "open", session_status: "completed" }), false);
  assert.equal(isPendingBookingRequest({}), true);
});

test("an open request matching an existing booking is not shown as pending again", () => {
  const groups = groupBookingRequests([
    request("stale-open-request", "open"),
    request("unrelated-open-request", "open", { scheduledAt: "2026-11-15T11:00:00.000Z" }),
  ]);
  const sessions = [{
    id: "confirmed-booking",
    subject: "رياضيات",
    scheduledAt: slot,
    duration: "60 دقيقة",
    status: "upcoming",
  }];

  assert.deepEqual(
    filterBookingRequestGroupsByStatus(groups, ["open"], sessions).map((group) => group.request.id),
    ["unrelated-open-request"],
  );
});
