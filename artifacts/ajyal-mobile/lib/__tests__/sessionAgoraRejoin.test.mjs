import test from "node:test";
import assert from "node:assert/strict";
import {
  AGORA_REJOIN_BASE_DELAY_MS,
  AGORA_REJOIN_MAX_ATTEMPTS,
  AGORA_REJOIN_MAX_DELAY_MS,
  agoraRejoinDelayMs,
  agoraRejoinExhausted,
} from "../sessionAgoraRejoin.ts";

test("rejoin backoff doubles per attempt and caps at the maximum", () => {
  assert.equal(agoraRejoinDelayMs(0), AGORA_REJOIN_BASE_DELAY_MS);
  assert.equal(agoraRejoinDelayMs(1), AGORA_REJOIN_BASE_DELAY_MS * 2);
  assert.equal(agoraRejoinDelayMs(2), AGORA_REJOIN_BASE_DELAY_MS * 4);
  assert.equal(agoraRejoinDelayMs(3), AGORA_REJOIN_MAX_DELAY_MS);
  assert.equal(agoraRejoinDelayMs(4), AGORA_REJOIN_MAX_DELAY_MS);
  assert.equal(agoraRejoinDelayMs(10), AGORA_REJOIN_MAX_DELAY_MS);
});

test("rejoin backoff tolerates invalid attempts", () => {
  assert.equal(agoraRejoinDelayMs(-3), AGORA_REJOIN_BASE_DELAY_MS);
  assert.equal(agoraRejoinDelayMs(Number.NaN), AGORA_REJOIN_BASE_DELAY_MS);
});

test("rejoin exhaustion follows the attempt cap", () => {
  assert.equal(agoraRejoinExhausted(0), false);
  assert.equal(agoraRejoinExhausted(AGORA_REJOIN_MAX_ATTEMPTS - 1), false);
  assert.equal(agoraRejoinExhausted(AGORA_REJOIN_MAX_ATTEMPTS), true);
  assert.equal(agoraRejoinExhausted(AGORA_REJOIN_MAX_ATTEMPTS + 5), true);
});
