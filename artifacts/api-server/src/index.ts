import app from "./app";
import { logger } from "./lib/logger";
import { startPushOutboxWorker } from "./lib/pushOutbox";
import { startSessionReminderScheduler } from "./lib/sessionReminderScheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // PUSH_OUTBOX_WORKER=external means a separate worker process (dist/worker.mjs) sends pushes.
  // Default (unset) keeps today's behavior: the worker runs inside this process.
  if (process.env["PUSH_OUTBOX_WORKER"] !== "external") void startPushOutboxWorker();
  void startSessionReminderScheduler();
});
