import test from 'node:test';
import assert from 'node:assert/strict';
import { createChunkedSecureStorage } from '../chunkedSecureStorage.ts';

function makeStore() {
  const values = new Map();
  let failNextChunkWrite = false;

  return {
    values,
    storage: {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => {
        if (failNextChunkWrite && key.includes('.chunk.') && !key.endsWith('.chunk-pending')) {
          failNextChunkWrite = false;
          throw new Error('simulated SecureStore write failure');
        }
        values.set(key, value);
      },
      deleteItemAsync: async (key) => {
        values.delete(key);
      },
      failNextChunkWrite() {
        failNextChunkWrite = true;
      },
    },
  };
}

test('round-trips a chunked session and removes the old generation after commit', async () => {
  const store = makeStore();
  const storage = createChunkedSecureStorage(store.storage, 4);
  const first = 'first-session-value';
  const second = 'second-session-value-is-longer';

  await storage.setItem('auth', first);
  const oldMarker = store.values.get('auth');
  await storage.setItem('auth', second);

  assert.equal(await storage.getItem('auth'), second);
  assert.match(store.values.get('auth'), /^ajyal-secure-chunks:v2:/);
  assert.notEqual(store.values.get('auth'), oldMarker);
  assert.equal(
    [...store.values.keys()].some((key) => key.startsWith('auth.chunk-pending')),
    false,
  );
});

test('keeps the previous session readable when writing the replacement fails', async () => {
  const store = makeStore();
  const storage = createChunkedSecureStorage(store.storage, 4);
  const previousSession = 'previous-session-is-readable';

  await storage.setItem('auth', previousSession);
  const previousMarker = store.values.get('auth');
  store.storage.failNextChunkWrite();

  await assert.rejects(
    storage.setItem('auth', 'replacement-session-that-is-long'),
    /simulated SecureStore write failure/,
  );

  assert.equal(store.values.get('auth'), previousMarker);
  assert.equal(await storage.getItem('auth'), previousSession);
  assert.equal(store.values.has('auth.chunk-pending'), false);
});

test('reads the previous v1 marker format so existing logins survive migration', async () => {
  const store = makeStore();
  const storage = createChunkedSecureStorage(store.storage, 4);
  store.values.set('auth', 'ajyal-secure-chunks:v1:2');
  store.values.set('auth.chunk.0', 'old-');
  store.values.set('auth.chunk.1', 'session');

  assert.equal(await storage.getItem('auth'), 'old-session');
  await storage.setItem('auth', 'new-session-value');
  assert.equal(await storage.getItem('auth'), 'new-session-value');
  assert.equal(store.values.has('auth.chunk.0'), false);
});

test('serializes overlapping session writes in call order', async () => {
  const store = makeStore();
  const storage = createChunkedSecureStorage(store.storage, 4);

  await Promise.all([
    storage.setItem('auth', 'first-overlapping-session'),
    storage.setItem('auth', 'second-overlapping-session'),
  ]);

  assert.equal(await storage.getItem('auth'), 'second-overlapping-session');
});