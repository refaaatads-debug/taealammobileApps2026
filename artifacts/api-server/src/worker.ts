import { logger } from "./lib/logger";
import { startPushOutboxWorker } from "./lib/pushOutbox";

// Standalone push worker: sends queued push notifications and nothing else
// (no HTTP server, no reminder scheduler). Run it only together with
// PUSH_OUTBOX_WORKER=external on the API process so the two do not both poll.
// The queue claim uses FOR UPDATE SKIP LOCKED, so an overlap would not send
// the same event twice, it would only waste work.
async function main(): Promise<void> {
  await startPushOutboxWorker();
  logger.info("Standalone push worker running");
  // Keep the process alive; the worker's timer is unref'd on purpose.
  setInterval(() => undefined, 60_000);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "Standalone push worker stopping");
    process.exit(0);
  });
}

void main();
