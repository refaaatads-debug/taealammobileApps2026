import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchPushOutboxEvent,
  isCallEventCurrent,
  retryDelaySeconds,
} from "../pushOutbox.ts";

test("incoming-call outbox events are ignored after timeout or status change", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  assert.equal(isCallEventCurrent("incoming_call", "ringing", "2026-10-05T12:00:30Z", now), true);
  assert.equal(isCallEventCurrent("incoming_call", "ringing", "2026-10-05T11:59:59Z", now), false);
  assert.equal(isCallEventCurrent("incoming_call", "ended", null, now), false);
});

test("call status pushes are valid only for matching lifecycle states", () => {
  assert.equal(isCallEventCurrent("call_accepted", "connecting", null), true);
  assert.equal(isCallEventCurrent("call_accepted", "ended", null), false);
  assert.equal(isCallEventCurrent("call_ended", "rejected", null), true);
  assert.equal(isCallEventCurrent("call_ended", "ringing", null), false);
});

test("outbox retries use bounded exponential-like delays", () => {
  assert.equal(retryDelaySeconds(1), 2);
  assert.equal(retryDelaySeconds(2), 5);
  assert.equal(retryDelaySeconds(8), 600);
  assert.equal(retryDelaySeconds(20), 600);
});

test("outbox dispatch routes one chat event through its stable message identity", async () => {
  let captured = null;
  const result = await dispatchPushOutboxEvent({
    event_key: "chat-message:message-1",
    event_type: "chat_message",
    payload: {
      messageId: "message-1",
      bookingId: "booking-1",
      recipientId: "recipient-1",
      kind: "file",
    },
  }, {
    sendMessage: async (recipientId, notification) => {
      captured = { recipientId, notification };
      return true;
    },
    sendCall: async () => {
      throw new Error("chat events must not use the call sender");
    },
  });

  assert.equal(result, true);
  assert.equal(captured.recipientId, "recipient-1");
  assert.equal(captured.notification.data.eventId, "chat-message:message-1");
  assert.equal(captured.notification.body, "لديك مرفق جديد في المحادثة.");
});

test("malformed outbox events are skipped without attempting provider delivery", async () => {
  let calls = 0;
  const result = await dispatchPushOutboxEvent({
    event_key: "internal-call:call-1:incoming",
    event_type: "incoming_call",
    payload: { callId: "call-1" },
  }, {
    sendMessage: async () => {
      calls += 1;
      return true;
    },
    sendCall: async () => {
      calls += 1;
      return true;
    },
  });

  assert.equal(result, "skip");
  assert.equal(calls, 0);
});
