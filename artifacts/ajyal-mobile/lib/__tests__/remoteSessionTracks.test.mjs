import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeRemoteSessionTracks,
  removeRemoteSessionTrack,
} from '../remoteSessionTracks.ts';

function stream(...tracks) {
  return { getTracks: () => tracks };
}

function videoIds(tracks) {
  return tracks.filter((track) => track.kind === 'video').map((track) => track.id);
}

test('promotes a renegotiated screen-share video track ahead of camera', () => {
  const audio = { id: 'teacher-audio', kind: 'audio' };
  const camera = { id: 'teacher-camera', kind: 'video' };
  const screen = { id: 'teacher-screen-1', kind: 'video' };

  const withCamera = mergeRemoteSessionTracks([], stream(audio, camera), camera);
  const withScreen = mergeRemoteSessionTracks(withCamera, stream(audio, camera, screen), screen);

  assert.deepEqual(videoIds(withCamera), ['teacher-camera']);
  assert.deepEqual(videoIds(withScreen), ['teacher-screen-1', 'teacher-camera']);
});

test('removes stopped screen share and promotes a restarted screen track', () => {
  const camera = { id: 'teacher-camera', kind: 'video' };
  const firstScreen = { id: 'teacher-screen-1', kind: 'video' };
  const restartedScreen = { id: 'teacher-screen-2', kind: 'video' };

  const sharing = mergeRemoteSessionTracks([camera], stream(camera, firstScreen), firstScreen);
  const cameraOnly = removeRemoteSessionTrack(sharing, firstScreen);
  const sharingAgain = mergeRemoteSessionTracks(cameraOnly, stream(camera, restartedScreen), restartedScreen);

  assert.deepEqual(videoIds(cameraOnly), ['teacher-camera']);
  assert.deepEqual(videoIds(sharingAgain), ['teacher-screen-2', 'teacher-camera']);
});

test('matches track identity by id when native wrappers create a new object', () => {
  const camera = { id: 'teacher-camera', kind: 'video' };
  const screen = { id: 'teacher-screen-1', kind: 'video' };
  const wrappedScreen = { id: 'teacher-screen-1', kind: 'video' };

  const tracks = mergeRemoteSessionTracks([camera, screen], undefined, wrappedScreen);

  assert.deepEqual(videoIds(tracks), ['teacher-screen-1', 'teacher-camera']);
  assert.equal(tracks[0], screen);
});

test('the Android renderer sees the promoted screen track as its first video track', () => {
  const camera = { id: 'teacher-camera', kind: 'video' };
  const screen = { id: 'teacher-screen-1', kind: 'video' };
  const tracks = mergeRemoteSessionTracks([camera], stream(camera, screen), screen);
  const rendererStream = { getVideoTracks: () => tracks.filter((track) => track.kind === 'video') };

  assert.equal(rendererStream.getVideoTracks()[0].id, 'teacher-screen-1');
});

test('replaces an ended wrapper when a stop/start cycle reuses the track id', () => {
  const endedScreen = { id: 'teacher-screen', kind: 'video', readyState: 'ended' };
  const freshScreen = { id: 'teacher-screen', kind: 'video', readyState: 'live' };

  const tracks = mergeRemoteSessionTracks([endedScreen], undefined, freshScreen);

  assert.equal(tracks[0], freshScreen);
});