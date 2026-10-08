import assert from "node:assert/strict";
import test from "node:test";
import { leaveTutorAfterVoiceCleanup } from "../tutorBackNavigation.ts";

test("stops tutor audio before returning through navigation history", async () => {
  const events = [];

  await leaveTutorAfterVoiceCleanup({
    async stopVoice() { events.push("stop"); },
    canGoBack() { return true; },
    goBack() { events.push("back"); },
    replaceDashboard() { events.push("dashboard"); },
  });

  assert.deepEqual(events, ["stop", "back"]);
});

test("uses the dashboard fallback when the tutor has no navigation history", async () => {
  const events = [];

  await leaveTutorAfterVoiceCleanup({
    async stopVoice() { events.push("stop"); },
    canGoBack() { return false; },
    goBack() { events.push("back"); },
    replaceDashboard() { events.push("dashboard"); },
  });

  assert.deepEqual(events, ["stop", "dashboard"]);
});

test("still leaves the tutor screen if audio cleanup rejects", async () => {
  const events = [];

  await leaveTutorAfterVoiceCleanup({
    async stopVoice() {
      events.push("stop");
      throw new Error("audio cleanup failed");
    },
    canGoBack() { return true; },
    goBack() { events.push("back"); },
    replaceDashboard() { events.push("dashboard"); },
  });

  assert.deepEqual(events, ["stop", "back"]);
});