import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { privateStoragePath, signPrivateFile, createPrivateFileRequestGate, PRIVATE_FILE_TTL_SECONDS, PRIVATE_FILE_REFRESH_MS } from "../privateFiles.ts";
import { getCertificateOpenUrl } from "../profilePersistence.ts";

const origin = "https://ajyalalmaerifa.com";
const session = { access_token: "synthetic-token", user: { id: "synthetic-owner" } };
function fake({ error = null, signedUrl = "https://ajyalalmaerifa.com/synthetic-signed", after = session } = {}) {
  const calls = [];
  let checks = 0;
  return { calls, client: {
    auth: { getSession: async () => ({ data: { session: checks++ ? after : session }, error: null }) },
    storage: { from: (bucket) => ({ createSignedUrl: async (path, ttl) => {
      calls.push({ bucket, path, ttl });
      return { data: signedUrl ? { signedUrl } : null, error };
    } }) },
  } };
}

test("trusted legacy public, signed and authenticated URLs become paths, not bearer URLs", () => {
  for (const mode of ["public", "sign", "authenticated"]) {
    assert.equal(privateStoragePath(`${origin}/storage/v1/object/${mode}/chat-files/booking/name%20one.png?token=expired`, "chat-files", origin), "booking/name one.png");
  }
  assert.equal(privateStoragePath("booking/audio.m4a", "chat-files", origin), "booking/audio.m4a");
});

test("foreign hosts, alternate buckets, credentials and non-HTTPS URLs fail closed", () => {
  for (const value of [
    "https://foreign.test/storage/v1/object/public/chat-files/a/b",
    "https://ajyalalmaerifa.com.evil.test/storage/v1/object/sign/chat-files/a/b",
    "https://user:pass@ajyalalmaerifa.com/storage/v1/object/public/chat-files/a/b",
    "http://ajyalalmaerifa.com/storage/v1/object/public/chat-files/a/b",
    `${origin}/storage/v1/object/public/support-files/a/b`,
    `${origin}/anything.png`, "//foreign.test/a", "javascript:alert(1)", "data:text/plain,test",
  ]) assert.equal(privateStoragePath(value, "chat-files", origin), null, value);
});

test("malformed escapes, traversal and ambiguous object paths fail closed", () => {
  for (const value of ["", " a/b", "a//b", "/a/b", "a/../b", "a/./b", "a\\b", "a?token=old", "a#b", "a\n/b",
    `${origin}/storage/v1/object/public/chat-files/a/%GG`,
    `${origin}/storage/v1/object/public/chat-files/a/%2e%2e/b`,
    `${origin}/storage/v1/object/public/chat-files/a/%252e%252e/b`,
    `${origin}/storage/v1/object/public/chat-files/a/%2F/b`,
    `${origin}/storage/v1/object/public/chat-files/a/b#fragment`,
  ]) assert.equal(privateStoragePath(value, "chat-files", origin), null, value);
});

test("finance signing errors and missing URLs never return the original public URL", async () => {
  for (const options of [{ error: { message: "denied" } }, { signedUrl: null }]) {
    const { client, calls } = fake(options);
    await assert.rejects(signPrivateFile(client, `${origin}/storage/v1/object/public/support-files/withdrawals/one.pdf`, "support-files", origin));
    assert.equal(calls.length, 1);
  }
  await assert.rejects(signPrivateFile(null, "withdrawals/one.pdf", "support-files", origin));
});

test("signing uses the requested bucket and a five-minute expiry", async () => {
  const { client, calls } = fake();
  assert.match(await signPrivateFile(client, "booking/voice.m4a", "chat-files", origin), /synthetic-signed/);
  assert.deepEqual(calls, [{ bucket: "chat-files", path: "booking/voice.m4a", ttl: PRIVATE_FILE_TTL_SECONDS }]);
  assert.equal(PRIVATE_FILE_TTL_SECONDS, 300);
  assert.ok(PRIVATE_FILE_REFRESH_MS < PRIVATE_FILE_TTL_SECONDS * 1000);
});

test("foreign input never reaches the signing service", async () => {
  const { client, calls } = fake();
  await assert.rejects(signPrivateFile(client, "https://foreign.test/storage/v1/object/public/chat-files/a/b", "chat-files", origin));
  assert.equal(calls.length, 0);
});

test("logout, account switch or token replacement while signing rejects the pending bearer", async () => {
  for (const after of [null, { ...session, user: { id: "other-owner" } }, { ...session, access_token: "new-token" }]) {
    const { client } = fake({ after });
    await assert.rejects(signPrivateFile(client, "booking/voice.m4a", "chat-files", origin), /session changed/);
  }
});

test("request generation discards older refreshes and invalidated identity work", () => {
  const gate = createPrivateFileRequestGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(second), false);
});

test("certificate external hosts and non-certificate objects are rejected without signing", async () => {
  let attempts = 0;
  const client = { storage: { from: () => ({ createSignedUrl: async () => { attempts++; return { data: { signedUrl: "unused" } }; } }) } };
  for (const url of ["https://foreign.test/certificate.pdf", "https://foreign.test/storage/v1/object/public/support-files/certificates/one/a.pdf", "withdrawals/one.pdf", "javascript:alert(1)"]) {
    await assert.rejects(getCertificateOpenUrl(client, url), /Unsupported certificate/);
  }
  assert.equal(attempts, 0);
});

test("chat hook wires expiry, foreground, identity and stale-result protection", () => {
  const source = readFileSync(new URL("../usePrivateFileUrl.ts", import.meta.url), "utf8");
  for (const token of ["onAuthStateChange", "gate.isCurrent(request)", "AppState.addEventListener", "setTimeout(refresh", "result.key === key", "Date.now() < result.expiresAt", "clearTimeout(timer)"]) assert.ok(source.includes(token));
  const chat = readFileSync(new URL("../../components/MessagesScreen.tsx", import.meta.url), "utf8");
  assert.ok(chat.includes('usePrivateFileUrl(url, "chat-files")'));
  assert.ok(!chat.includes("if (!path) return url"));
  const finance = readFileSync(new URL("../../components/TeacherFinanceScreens.tsx", import.meta.url), "utf8");
  assert.ok(finance.includes("Linking.openURL(signedUrl)"));
  assert.ok(!finance.includes("signedUrl ?? value"));
});


test("certificate previews drop bearer URLs on identity, expiry and foreground; PDF retry signs again", () => {
  const source = readFileSync(new URL("../../app/(tabs)/profile.tsx", import.meta.url), "utf8");
  for (const token of ["certificateViewerState.ownerId === userId", "Date.now() < certificateViewerState.expiresAt", "certificateRequest.current += 1", "AppState.addEventListener", "setTimeout(() => setCertificateViewer(null)", "void openCertificate(certificateViewer.id, certificate.file_url"]) assert.ok(source.includes(token));
});
