---
name: pnpm store version mismatch
description: Choose the package manager version used to link the workspace before changing dependencies.
---

When pnpm reports that the current virtual store is linked from a different store directory, check `node_modules/.modules.yaml` for the workspace's `packageManager` and `storeDir`. Use `corepack pnpm` when the shell's global `pnpm` is older; commands that spawn `pnpm` internally may still resolve the global binary.

**Why:** Dependency changes through an older global pnpm can fail before installation because its store version differs from the one already linking the workspace.

**How to apply:** Before package changes, compare `pnpm --version` with the workspace metadata and invoke the matching Corepack-managed version explicitly.
