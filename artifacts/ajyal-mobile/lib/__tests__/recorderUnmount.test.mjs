import test from 'node:test';
import assert from 'node:assert/strict';
import { stopRecorderOnUnmount } from '../recorderUnmount.ts';

test('does not let a released recorder getter break route cleanup', () => {
  const recorder = {
    get isRecording() {
      throw new Error('recorder already released');
    },
    stop() {
      assert.fail('stop should not run when the state getter throws');
    },
  };

  assert.doesNotThrow(() => stopRecorderOnUnmount(recorder, false));
});

test('best-effort stops an active recorder without blocking unmount', async () => {
  let stopCount = 0;
  const recorder = {
    isRecording: true,
    stop() {
      stopCount += 1;
      return Promise.reject(new Error('native stop failed'));
    },
  };

  assert.doesNotThrow(() => stopRecorderOnUnmount(recorder, false));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stopCount, 1);
});

test('leaves a recorder alone while a voice-processing turn is running', () => {
  let stopCount = 0;
  stopRecorderOnUnmount(
    { isRecording: true, stop: async () => { stopCount += 1; } },
    true,
  );

  assert.equal(stopCount, 0);
});