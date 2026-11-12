export type SecureKeyValueStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

const LEGACY_CHUNKS_PREFIX = 'ajyal-secure-chunks:v1:';
const CHUNKS_PREFIX = 'ajyal-secure-chunks:v2:';
const MAX_CHUNK_LENGTH = 400;

type ChunkMarker =
  | { version: 1; count: number }
  | { version: 2; generation: string; count: number };

function parseChunkMarker(value: string | null): ChunkMarker | null {
  if (value?.startsWith(LEGACY_CHUNKS_PREFIX)) {
    const count = Number(value.slice(LEGACY_CHUNKS_PREFIX.length));
    return Number.isInteger(count) && count > 0 ? { version: 1, count } : null;
  }

  if (value?.startsWith(CHUNKS_PREFIX)) {
    const [generation, rawCount] = value.slice(CHUNKS_PREFIX.length).split(':');
    const count = Number(rawCount);
    return generation && Number.isInteger(count) && count > 0
      ? { version: 2, generation, count }
      : null;
  }

  return null;
}

function getChunkKey(key: string, marker: ChunkMarker, index: number): string {
  return marker.version === 1
    ? `${key}.chunk.${index}`
    : `${key}.chunk.${marker.generation}.${index}`;
}

async function deleteChunks(
  store: SecureKeyValueStore,
  key: string,
  marker: ChunkMarker,
): Promise<void> {
  await Promise.all(
    Array.from({ length: marker.count }, (_, index) =>
      store.deleteItemAsync(getChunkKey(key, marker, index)),
    ),
  );
}

export function createChunkedSecureStorage(
  store: SecureKeyValueStore,
  maxChunkLength = MAX_CHUNK_LENGTH,
) {
  const operations = new Map<string, Promise<void>>();

  const serialize = <T>(key: string, operation: () => Promise<T>): Promise<T> => {
    const previous = operations.get(key) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    const settled = next.then(() => undefined, () => undefined);
    operations.set(key, settled);
    return next.finally(() => {
      if (operations.get(key) === settled) operations.delete(key);
    });
  };

  const waitForPendingWrite = async (key: string): Promise<void> => {
    await operations.get(key);
  };

  const cleanupInterruptedWrite = async (
    key: string,
    activeMarker: ChunkMarker | null,
  ): Promise<void> => {
    const pendingKey = `${key}.chunk-pending`;
    const pendingValue = await store.getItemAsync(pendingKey);
    if (!pendingValue) return;
    let pending: {
      generation?: unknown;
      count?: unknown;
      previousMarker?: ChunkMarker | null;
    } = {};
    try {
      pending = JSON.parse(pendingValue);
    } catch {
      await store.deleteItemAsync(pendingKey);
      return;
    }
    const pendingGeneration =
      typeof pending.generation === 'string' ? pending.generation : null;
    const pendingCount = Number(pending.count);
    const committed =
      activeMarker?.version === 2 &&
      activeMarker.generation === pendingGeneration;

    if (!committed) {
      if (pendingGeneration && Number.isInteger(pendingCount) && pendingCount > 0) {
        await deleteChunks(store, key, {
          version: 2,
          generation: pendingGeneration,
          count: pendingCount,
        });
      }
    } else if (pending.previousMarker) {
      await deleteChunks(store, key, pending.previousMarker);
    }
    await store.deleteItemAsync(pendingKey);
  };

  return {
    async getItem(key: string): Promise<string | null> {
      await waitForPendingWrite(key);
      const stored = await store.getItemAsync(key);
      const marker = parseChunkMarker(stored);
      if (!marker) return stored;

      const chunks = await Promise.all(
        Array.from({ length: marker.count }, (_, index) =>
          store.getItemAsync(getChunkKey(key, marker, index)),
        ),
      );
      return chunks.every((chunk): chunk is string => chunk !== null)
        ? chunks.join('')
        : null;
    },

    async setItem(key: string, value: string): Promise<void> {
      return serialize(key, async () => {
        const pendingKey = `${key}.chunk-pending`;
        const previousValue = await store.getItemAsync(key);
        const previousMarker = parseChunkMarker(previousValue);
        await cleanupInterruptedWrite(key, previousMarker);

        if (value.length <= maxChunkLength) {
          await store.setItemAsync(key, value);
          if (previousMarker) await deleteChunks(store, key, previousMarker);
          return;
        }

        const generation = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        const chunks = Array.from(
          { length: Math.ceil(value.length / maxChunkLength) },
          (_, index) => value.slice(index * maxChunkLength, (index + 1) * maxChunkLength),
        );
        const nextMarker: ChunkMarker = {
          version: 2,
          generation,
          count: chunks.length,
        };

        await store.setItemAsync(
          pendingKey,
          JSON.stringify({ generation, count: chunks.length, previousMarker }),
        );
        try {
          const writes = await Promise.allSettled(
            chunks.map((chunk, index) =>
              store.setItemAsync(getChunkKey(key, nextMarker, index), chunk),
            ),
          );
          const failedWrite = writes.find((result) => result.status === 'rejected');
          if (failedWrite?.status === 'rejected') throw failedWrite.reason;

          await store.setItemAsync(
            key,
            `${CHUNKS_PREFIX}${generation}:${chunks.length}`,
          );
        } catch (error) {
          await deleteChunks(store, key, nextMarker).catch(() => undefined);
          await store.deleteItemAsync(pendingKey).catch(() => undefined);
          throw error;
        }

        if (previousMarker) await deleteChunks(store, key, previousMarker);
        await store.deleteItemAsync(pendingKey);
      });
    },

    async removeItem(key: string): Promise<void> {
      return serialize(key, async () => {
        const stored = await store.getItemAsync(key);
        const marker = parseChunkMarker(stored);
        await store.deleteItemAsync(key);
        if (marker) await deleteChunks(store, key, marker);
        await cleanupInterruptedWrite(key, null);
      });
    },
  };
}