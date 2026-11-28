import test from "node:test";
import assert from "node:assert/strict";
import { joinAgoraWebSession } from "../sessionAgoraWeb.ts";

const transport = {
  provider: "agora",
  appId: "app-id",
  channel: "lesson-room",
  uid: "student-1",
  token: "opaque-token",
  expiresAt: 4_000_000_000,
};

function fakeRtc() {
  const events = new Map();
  const globalEvents = new Map();
  const client = {
    joined: null,
    published: null,
    subscribed: [],
    async join(...args) { this.joined = args; return "student-1"; },
    async publish(tracks) { this.published = tracks; },
    async subscribe(user, kind) { this.subscribed.push([user.uid, kind]); },
    async leave() {},
    on(name, callback) { events.set(name, callback); },
  };
  const mic = { close() {}, setEnabled: async () => {} };
  return {
    api: {
      checkSystemRequirements: () => true,
      createClient: () => client,
      createMicrophoneAudioTrack: async () => mic,
      resumeAudioContext: async () => {},
      on(name, callback) { globalEvents.set(name, callback); },
      off(name) { globalEvents.delete(name); },
    },
    client,
    mic,
    events,
    globalEvents,
  };
}

test("Agora web joins with the issued token and publishes the local microphone", async () => {
  const fake = fakeRtc();
  const session = await joinAgoraWebSession(transport, {}, fake.api);
  assert.deepEqual(fake.client.joined, ["app-id", "lesson-room", "opaque-token", "student-1"]);
  assert.deepEqual(fake.client.published, [fake.mic]);
  await session.leave();
});

test("Agora web subscribes to and plays remote audio and exposes remote video", async () => {
  const fake = fakeRtc();
  const audioEvents = [];
  let autoplayBlocked = false;
  let videoTrack = null;
  const session = await joinAgoraWebSession(transport, {
    onRemoteAudio: (state) => audioEvents.push(state),
    onRemoteVideo: (track) => { videoTrack = track; },
    onAutoplayBlocked: () => { autoplayBlocked = true; },
  }, fake.api);
  const audioTrack = { play() {}, stop() {} };
  const video = { play() {}, stop() {} };
  await fake.events.get("user-published")({ uid: "teacher-1", audioTrack }, "audio");
  await fake.events.get("user-published")({ uid: "teacher-1", videoTrack: video }, "video");
  assert.deepEqual(fake.client.subscribed, [["teacher-1", "audio"], ["teacher-1", "video"]]);
  assert.deepEqual(audioEvents, ["starting", "playing"]);
  assert.equal(videoTrack, video);
  fake.globalEvents.get("autoplay-failed")();
  assert.equal(autoplayBlocked, true);
  await session.leave();
});
