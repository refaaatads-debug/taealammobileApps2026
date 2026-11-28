import assert from "node:assert/strict";
import test from "node:test";
import { sendExpoPushMessages } from "../expoPush.ts";
import { __testing } from "../pushOutbox.ts";

const msg = (i) => ({ to: `ExponentPushToken[t${i}]`, data: {}, priority: "high", ttl: 60 });

function fakeFetch(plan) {
  const calls = [];
  const impl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.length);
    const out = plan(body, calls.length);
    return { ok: out.ok ?? true, status: out.status ?? 200, json: async () => out.json };
  };
  return { impl, calls };
}

test("250 messages go out as 3 requests of 100/100/50, results keep order", async () => {
  const f = fakeFetch((body) => ({ json: { data: body.map((_, i) => ({ status: "ok", id: `id${i}` })) } }));
  const results = await sendExpoPushMessages(Array.from({ length: 250 }, (_, i) => msg(i)), undefined, f.impl);
  assert.deepEqual(f.calls, [100, 100, 50]);
  assert.equal(results.length, 250);
  assert.ok(results.every((r) => r.ok));
});

test("per-ticket errors only fail their own message", async () => {
  const f = fakeFetch((body) => ({
    json: { data: body.map((_, i) => (i === 1 ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "x" })) },
  }));
  const results = await sendExpoPushMessages([msg(0), msg(1), msg(2)], undefined, f.impl);
  assert.deepEqual(results.map((r) => r.ok), [true, false, true]);
  assert.equal(results[1].providerCode, "DeviceNotRegistered");
});

test("a failed request fails only that chunk; the next chunk still goes out", async () => {
  const f = fakeFetch((body, n) => (n === 1
    ? { ok: false, status: 503, json: {} }
    : { json: { data: body.map(() => ({ status: "ok", id: "x" })) } }));
  const results = await sendExpoPushMessages(Array.from({ length: 150 }, (_, i) => msg(i)), undefined, f.impl);
  assert.equal(results.slice(0, 100).filter((r) => r.ok).length, 0);
  assert.equal(results.slice(100).filter((r) => r.ok).length, 50);
});

test("a ticket list with the wrong length is never trusted", async () => {
  const f = fakeFetch(() => ({ json: { data: [{ status: "ok", id: "only-one" }] } }));
  const results = await sendExpoPushMessages([msg(0), msg(1)], undefined, f.impl);
  assert.deepEqual(results.map((r) => r.ok), [false, false]);
});

const ev = (n) => ({ id: `e${n}`, event_key: `platform-notification:n${n}`, event_type: "platform_notification", attempt_count: 1,
  payload: { notificationId: `n${n}`, recipientId: `u${n}` } });

test("processPlatformBatch: ok and skip are marked done, retry goes to the retry schedule", async () => {
  const done = []; const retried = [];
  await __testing.processPlatformBatch([ev(1), ev(2), ev(3), ev(4)], {
    load: async (p) => (p.recipientId === "u4" ? null : { title: "t", body: "b", type: "admin_broadcast" }),
    send: async (items) => { assert.equal(items.length, 3); return ["ok", "skip", "retry"]; },
    markDone: async (ids) => { done.push(...ids); },
    retry: async (e, reason) => { retried.push([e.id, reason]); },
  });
  assert.deepEqual(done.sort(), ["e1", "e2", "e4"]);
  assert.deepEqual(retried, [["e3", "provider_not_accepted"]]);
});

test("processPlatformBatch: if the whole send throws, every event is retried, none marked done", async () => {
  const done = []; const retried = [];
  await __testing.processPlatformBatch([ev(1), ev(2)], {
    load: async () => ({ title: "t", body: "b", type: "x" }),
    send: async () => { throw new Error("boom"); },
    markDone: async (ids) => { done.push(...ids); },
    retry: async (e) => { retried.push(e.id); },
  });
  assert.deepEqual(done, []);
  assert.deepEqual(retried.sort(), ["e1", "e2"]);
});
