import assert from "node:assert/strict";
import test from "node:test";
import { extractEdgeFunctionError } from "../edgeFunctionError.ts";

test("extracts a safe error and status without consuming the original response", async () => {
  const response = new Response(JSON.stringify({
    error: "AI grading is unavailable",
    debug: "Bearer secret-value",
  }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });

  const details = await extractEdgeFunctionError({
    message: "Edge Function returned a non-2xx status code",
    context: response,
  });

  assert.deepEqual(details, { status: 503, message: "AI grading is unavailable" });
  assert.match(await response.text(), /secret-value/);
});

test("strips control characters, redacts API credentials, and bounds the message", async () => {
  const response = new Response(JSON.stringify({
    message: `\u0000Service rejected api_key=secret-key-123 ${"x".repeat(500)}`,
  }), { status: 500 });

  const details = await extractEdgeFunctionError({ context: response });

  assert.equal(details.status, 500);
  assert.ok(details.message);
  assert.ok(details.message.length <= 240);
  assert.doesNotMatch(details.message, /secret-key-123/);
  assert.doesNotMatch(details.message, /[\u0000-\u001f\u007f-\u009f]/);
});

test("does not expose unallowlisted or non-JSON response content", async () => {
  const response = new Response("Bearer top-secret-token", { status: 502 });

  assert.deepEqual(
    await extractEdgeFunctionError({ context: response }),
    { status: 502, message: null },
  );
});