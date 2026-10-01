import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  decodePushTokenBundle,
  encodePushTokenBundle,
  mergePushTokenBundle,
} from "../pushTokenBundle.ts";
import { __testing, sendApnsVoipPush } from "../apnsVoip.ts";

const expoToken = "ExpoPushToken[unit-test-token]";
const voipToken = "ab".repeat(32);

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