---
name: VPS API deployment
description: Operational constraints for updating the production API checkout on the Ajyal VPS.
---

The production API checkout keeps an untracked `.env` file and the systemd service runs the built `dist` bundle directly with Node. Preserve `.env`, update with a fast-forward Git pull, build with Corepack pnpm because noninteractive SSH PATH may not expose pnpm, then restart the service.

**Why:** A normal dirty-tree guard correctly stopped before touching production, and the first build attempt failed only because `pnpm` was absent from the SSH session PATH.

**How to apply:** Treat `.env` as expected local configuration, abort on any other dirty files, use Corepack for the build, and verify both service state and the public `/api/healthz` response after restart.