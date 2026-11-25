import test from "node:test";
import assert from "node:assert/strict";
import { withTimeout } from "../asyncTimeout.ts";

test("withTimeout resolves before the deadline", async () => {
  const result = await withTimeout(Promise.resolve("ok"), 25, "timed out");
  assert.equal(result, "ok");
});

test("withTimeout rejects after the deadline", async () => {
  const pending = new Promise(() => {});
  await assert.rejects(() => withTimeout(pending, 5, "deadline reached"), /deadline reached/);
});
