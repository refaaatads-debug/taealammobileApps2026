import test from "node:test";
import assert from "node:assert/strict";

import { readWaitingAcceptanceExpiryMinutes } from "../waitingAcceptanceExpiry.ts";

test("expiry stays disabled until a TTL is explicitly configured", () => {
  assert.equal(readWaitingAcceptanceExpiryMinutes(undefined), null);
  assert.equal(readWaitingAcceptanceExpiryMinutes(""), null);
});

test("expiry accepts only bounded positive integers", () => {
  assert.equal(readWaitingAcceptanceExpiryMinutes("30"), 30);
  for (const bad of ["0", "-5", "1.5", "abc", "999999"]) assert.equal(readWaitingAcceptanceExpiryMinutes(bad), null);
});
