import assert from "node:assert/strict";
import test from "node:test";

// Mirrors the whitelist rule in lib/queryClient.ts (kept tiny and dependency free).
const PERSIST_PREFIXES = ["/api/me", "/api/sessions", "/api/booking-requests", "/api/student/dashboard", "/api/assignments", "/api/notifications"];
const shouldPersist = (key) => typeof key[0] === "string" && PERSIST_PREFIXES.some((p) => key[0] === p || key[0].startsWith(`${p}/`));

test("persists only the user's own lists", () => {
  assert.equal(shouldPersist(["/api/sessions", { view: "past" }]), true);
  assert.equal(shouldPersist(["/api/booking-requests"]), true);
  assert.equal(shouldPersist(["/api/push-tokens"]), false);
  assert.equal(shouldPersist(["/api/payments"]), false);
});
