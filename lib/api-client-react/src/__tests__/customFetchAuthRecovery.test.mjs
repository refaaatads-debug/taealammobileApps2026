import test from "node:test";
import assert from "node:assert/strict";
import {
  customFetch,
  setAuthRecoveryHandler,
  setAuthTokenGetter,
  setBaseUrl,
} from "../custom-fetch.ts";

test("customFetch refreshes and retries an authenticated 401 once", async () => {
  const originalFetch = globalThis.fetch;
  let token = "expired-token";
  const calls = [];
  globalThis.fetch = async (_input, init) => {
    calls.push(new Headers(init?.headers).get("authorization"));
    if (calls.length === 1) {
      return new Response(JSON.stringify({ message: "expired" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    setBaseUrl("https://api.example.test");
    setAuthTokenGetter(() => token);
    setAuthRecoveryHandler(async () => {
      token = "fresh-token";
      return true;
    });

    const result = await customFetch("/sessions");
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls, ["Bearer expired-token", "Bearer fresh-token"]);
  } finally {
    globalThis.fetch = originalFetch;
    setBaseUrl(null);
    setAuthTokenGetter(null);
    setAuthRecoveryHandler(null);
  }
});

test("customFetch preserves the 401 when auth recovery fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "revoked" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });

  try {
    setBaseUrl("https://api.example.test");
    setAuthTokenGetter(() => "revoked-token");
    setAuthRecoveryHandler(async () => false);

    await assert.rejects(
      () => customFetch("/sessions"),
      (error) => error?.status === 401,
    );
  } finally {
    globalThis.fetch = originalFetch;
    setBaseUrl(null);
    setAuthTokenGetter(null);
    setAuthRecoveryHandler(null);
  }
});
