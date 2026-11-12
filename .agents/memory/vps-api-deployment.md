---
name: VPS API deployment
description: Operational constraints for updating the production API checkout on the Ajyal VPS.
---

The production API checkout keeps an untracked `.env` file and systemd runs the built `dist` bundle directly with Node. Its deployment branch can diverge from `replit-dev` with production-specific commits, so do not merge or reset the whole branch by assumption. Preserve `.env`, apply only the reviewed API files, build with Corepack pnpm because noninteractive SSH PATH may not expose pnpm, then restart the service.

**Why:** A normal dirty-tree guard correctly stopped before touching production, and the first build attempt failed only because `pnpm` was absent from the SSH session PATH. A full branch merge can also bring unrelated mobile or production-specific history into the live API checkout.

**How to apply:** Confirm the running systemd checkout, treat `.env` as expected local configuration, abort on other dirty files, fetch and compare the requested API paths, and apply only those files when branch histories diverge. Build with `corepack pnpm --filter @workspace/api-server run build`, restart the service, check its actual listening port, and verify local plus public `/api/healthz`; do not apply migrations unless separately authorized.