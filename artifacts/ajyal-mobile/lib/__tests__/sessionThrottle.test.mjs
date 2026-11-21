import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimitedQueue } from "../sessionThrottle.ts";

function createClock() {
  let currentTime = 0;
  let nextId = 0;
  const timers = [];
  return {
    now: () => currentTime,
    schedule(callback, delay) {
      const timer = { id: ++nextId, at: currentTime + delay, callback, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel(timer) {
      timer.cancelled = true;
    },
    advance(milliseconds) {
      const target = currentTime + milliseconds;
      while (true) {
        timers.sort((left, right) => left.at - right.at);
        const next = timers.find((timer) => !timer.cancelled && timer.at <= target);
        if (!next) break;
        next.cancelled = true;
        currentTime = next.at;
        next.callback();
      }
      currentTime = target;
    },
  };
}

test("whiteboard messages are sent in order no more often than every 120ms", () => {
  const clock = createClock();
  const sent = [];
  const queue = createRateLimitedQueue((value) => sent.push({ value, at: clock.now() }), 120, clock.now, clock.schedule, clock.cancel);

  queue.enqueue("first");
  queue.enqueue("second");
  queue.enqueue("third");
  clock.advance(0);
  assert.deepEqual(sent, [{ value: "first", at: 0 }]);
  clock.advance(119);
  assert.equal(sent.length, 1);
  clock.advance(1);
  assert.deepEqual(sent[1], { value: "second", at: 120 });
  clock.advance(120);
  assert.deepEqual(sent, [
    { value: "first", at: 0 },
    { value: "second", at: 120 },
    { value: "third", at: 240 },
  ]);
});

test("clearing the whiteboard queue cancels unsent actions", () => {
  const clock = createClock();
  const sent = [];
  const queue = createRateLimitedQueue((value) => sent.push(value), 120, clock.now, clock.schedule, clock.cancel);
  queue.enqueue("discard");
  queue.clear();
  clock.advance(500);
  assert.deepEqual(sent, []);
});
