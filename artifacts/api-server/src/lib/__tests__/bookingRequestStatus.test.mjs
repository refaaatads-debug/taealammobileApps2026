import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBookingRequestStatus } from "../bookingRequestStatus.ts";

test("a confirmed request is exposed to clients as accepted, never as pending", () => {
  assert.equal(normalizeBookingRequestStatus("confirmed", false), "accepted");
});

test("expired open requests remain expired and accepted requests stay accepted", () => {
  assert.equal(normalizeBookingRequestStatus("open", true), "expired");
  assert.equal(normalizeBookingRequestStatus("accepted", true), "accepted");
});

test("unknown statuses do not break the response contract", () => {
  assert.equal(normalizeBookingRequestStatus("unknown", false), "open");
});
