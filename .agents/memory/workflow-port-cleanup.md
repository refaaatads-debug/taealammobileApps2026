---
name: Workflow port cleanup
description: Fixed-port conflicts that can make a managed API or Expo restart look like an application failure.
---

When a managed workflow reports `EADDRINUSE` or asks to move to another port after a restart, inspect the process tree and remove the stale child process before judging the application. Restart the exact managed workflow afterward.

**Why:** A prior process can continue listening after a failed or interrupted managed restart, so the new workflow fails before application code is evaluated and can make unrelated UI issues appear persistent.

**How to apply:** Treat a port conflict as environment/process cleanup first; do not change application ports or duplicate workflows as a workaround.