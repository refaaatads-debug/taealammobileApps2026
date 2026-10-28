import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDeliveryMode, resolveSessionDeliveryMode } from "../sessionDeliveryMode.ts";

test("the booking row mode overrides stale dashboard and API session mode", () => {
  assert.equal(resolveSessionDeliveryMode("online", "in_person"), "in_person");
  assert.equal(resolveSessionDeliveryMode("in_person", "online"), "online");
});

test("normalizes the platform delivery mode without treating unknown values as online", () => {
  assert.equal(normalizeDeliveryMode("in-person"), "in_person");
  assert.equal(normalizeDeliveryMode("online"), "online");
  assert.equal(normalizeDeliveryMode("unknown"), undefined);
  assert.equal(resolveSessionDeliveryMode(undefined, undefined), undefined);
});
