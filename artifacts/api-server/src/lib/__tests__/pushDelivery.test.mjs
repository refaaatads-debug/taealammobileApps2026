import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  decodePushTokenBundle,
  encodePushTokenBundle,
  mergePushTokenBundle,
} from "../pushTokenBundle.ts";
import { pushDedupeKey } from "../pushDedupe.ts";
import { __testing, sendApnsVoipPush } from "../apnsVoip.ts";
import { sendExpoPushMessage } from "../expoPush.ts";
import { buildChatPushNotification } from "../pushOutbox.ts";

const expoToken = "ExpoPushToken[unit-test-token]";
const voipToken = "ab".repeat(32);

test("message notifications dedupe by message, not by the whole booking", () => {
  const firstMessage = pushDedupeKey("recipient", {
    type: "chat_message",
    bookingId: "booking-1",
    messageId: "message-1",
  });
  const secondMessage = pushDedupeKey("recipient", {
    type: "chat_message",
    bookingId: "booking-1",
    messageId: "message-2",
  });

  assert.notEqual(firstMessage, secondMessage);
  assert.equal(
    pushDedupeKey("recipient", {
      type: "chat_message",
      bookingId: "booking-1",
      messageId: "message-1",
    }),
    firstMessage,
  );
});

test("platform push calls dedupe against the persisted notification identity", () => {
  const first = pushDedupeKey("recipient", {
    type: "admin_announcement",
    notificationId: "notification-1",
  });
  const sameNotification = pushDedupeKey("recipient", {
    type: "admin_announcement",
    notificationId: "notification-1",
  });
  const nextNotification = pushDedupeKey("recipient", {
    type: "admin_announcement",
    notificationId: "notification-2",
  });

  assert.equal(sameNotification, first);
  assert.notEqual(nextNotification, first);
});

test("chat push identifies the sender and includes text content in the notification", () => {
  const notification = buildChatPushNotification("chat-message:message-1", {
    messageId: "message-1",
    bookingId: "booking-1",
    recipientId: "recipient-1",
    senderName: "أحمد",
    kind: "voice",
    messageText: "لن يظهر هذا النص ضمن إشعار الرسالة الصوتية",
  });

  assert.deepEqual(notification, {
    recipientId: "recipient-1",
    notification: {
      title: "رسالة من أحمد",
      body: "لديك رسالة صوتية جديدة في المحادثة.",
      data: {
        type: "chat_message",
        bookingId: "booking-1",
        messageId: "message-1",
        eventId: "chat-message:message-1",
        route: "/messages",
      },
    },
  });
  const textNotification = buildChatPushNotification("chat-message:text-1", {
    messageId: "text-1",
    bookingId: "booking-1",
    recipientId: "recipient-1",
    senderName: "أحمد",
    kind: "text",
    messageText: "هل يناسبك موعد الحصة يوم غد؟",
  });
  assert.equal(textNotification?.notification.body, "هل يناسبك موعد الحصة يوم غد؟");
  assert.equal(
    buildChatPushNotification("chat-message:file-1", {
      messageId: "file-1",
      bookingId: "booking-1",
      recipientId: "recipient-1",
      senderName: "أحمد",
      kind: "file",
      messageText: "لن يظهر محتوى المرفق في الإشعار",
    })?.notification.body,
    "لديك مرفق جديد في المحادثة.",
  );
  assert.equal(
    buildChatPushNotification("chat-message:long-text", {
      messageId: "long-text",
      bookingId: "booking-1",
      recipientId: "recipient-1",
      kind: "text",
      messageText: "أ".repeat(200),
    })?.notification.body.length,
    160,
  );
  assert.equal(
    buildChatPushNotification("missing-message-id", {
      bookingId: "booking-1",
      recipientId: "recipient-1",
    }),
    null,
  );
});

test("Expo push delivery accepts both single-ticket and ticket-array response shapes", async () => {
  const originalFetch = globalThis.fetch;
  const message = {
    to: expoToken,
    data: { type: "chat_message" },
    priority: "high",
    ttl: 60,
  };

  try {
    for (const data of [{ status: "ok" }, [{ status: "ok" }]]) {
      let requestBody;
      globalThis.fetch = async (_url, init) => {
        requestBody = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ data }),
        };
      };

      await sendExpoPushMessage(message);
      assert.deepEqual(requestBody, [message]);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("push token bundles round-trip Expo and APNs metadata", () => {
  const encoded = encodePushTokenBundle({
    expoToken,
    apnsVoipToken: voipToken,
    apnsVoipEnvironment: "sandbox",
  });
  assert.notEqual(encoded, expoToken);
  assert.deepEqual(decodePushTokenBundle(encoded), {
    expoToken,
    apnsVoipToken: voipToken,
    apnsVoipEnvironment: "sandbox",
  });
});

test("legacy raw Expo tokens remain readable", () => {
  assert.deepEqual(decodePushTokenBundle(expoToken), { expoToken });
  assert.equal(decodePushTokenBundle("not-a-token"), null);
});

test("same Expo token registration preserves its existing VoIP token", () => {
  const existing = encodePushTokenBundle({
    expoToken,
    apnsVoipToken: voipToken,
    apnsVoipEnvironment: "sandbox",
  });
  assert.deepEqual(
    decodePushTokenBundle(mergePushTokenBundle(existing, { expoToken })),
    {
      expoToken,
      apnsVoipToken: voipToken,
      apnsVoipEnvironment: "sandbox",
    },
  );
});

test("a different Expo token does not inherit another device's VoIP token", () => {
  const existing = encodePushTokenBundle({
    expoToken,
    apnsVoipToken: voipToken,
    apnsVoipEnvironment: "sandbox",
  });
  const nextExpoToken = "ExpoPushToken[next-device]";
  assert.deepEqual(
    decodePushTokenBundle(mergePushTokenBundle(existing, { expoToken: nextExpoToken })),
    { expoToken: nextExpoToken },
  );
});

test("APNs JWT is a three-part token without exposing key material", () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwt = __testing.createApnsJwt(
    "KEY123",
    "TEAM123",
    privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    1700000000,
  );
  assert.equal(jwt.split(".").length, 3);
  assert.match(jwt, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test("APNs VoIP delivery uses the VoIP topic and injected transport", async () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const previous = {
    keyId: process.env.APNS_VOIP_KEY_ID,
    teamId: process.env.APNS_TEAM_ID,
    privateKey: process.env.APNS_VOIP_PRIVATE_KEY,
    bundleId: process.env.APNS_VOIP_BUNDLE_ID,
  };
  process.env.APNS_VOIP_KEY_ID = "KEY123";
  process.env.APNS_TEAM_ID = "TEAM123";
  process.env.APNS_VOIP_PRIVATE_KEY =
    privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.env.APNS_VOIP_BUNDLE_ID = "com.ajyalalmaerifa.app";
  let captured;
  try {
    await sendApnsVoipPush(
      voipToken,
      "sandbox",
      {
        aps: { "content-available": 1 },
        type: "incoming_call",
        callId: "call-id",
        callUuid: "call-uuid",
        uuid: "call-uuid",
        handle: "caller-id",
        callerId: "caller-id",
        callerName: "Caller",
        callerRole: "teacher",
        roomId: "room-id",
      },
      async (...args) => { captured = args; },
    );
    assert.equal(captured[0], voipToken);
    assert.equal(captured[1], "sandbox");
    assert.equal(captured[4], "com.ajyalalmaerifa.app.voip");
    assert.equal(captured[2].aps["content-available"], 1);
    await sendApnsVoipPush(
      voipToken,
      "sandbox",
      {
        aps: { "content-available": 1 },
        type: "call_ended",
        callId: "call-id",
        uuid: "call-id",
      },
      async (...args) => { captured = args; },
    );
    assert.equal(captured[2].type, "call_ended");
    assert.equal(captured[2].uuid, "call-id");
    await sendApnsVoipPush(
      voipToken,
      "sandbox",
      {
        aps: { "content-available": 1 },
        type: "call_accepted",
        callId: "call-id",
        uuid: "call-id",
      },
      async (...args) => { captured = args; },
    );
    assert.equal(captured[2].type, "call_accepted");
  } finally {
    for (const [key, value] of [
      ["APNS_VOIP_KEY_ID", previous.keyId],
      ["APNS_TEAM_ID", previous.teamId],
      ["APNS_VOIP_PRIVATE_KEY", previous.privateKey],
      ["APNS_VOIP_BUNDLE_ID", previous.bundleId],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});