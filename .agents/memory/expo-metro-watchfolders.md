---
name: Expo Metro watch folders
description: The file-watcher constraint that affects clean Expo Web Preview rebuilds in this pnpm workspace.
---

Expo's automatic pnpm monorepo configuration can add the root node_modules tree and unrelated workspace artifacts to Metro's watch folders. A clean Web rebuild may then fail with ENOSPC before the first bundle is served, even though the app code has no runtime error.

**Why:** The workspace contains several long-running services and many pnpm packages; the combined watcher count can exceed the environment's inotify limit, especially after stale workflow processes remain.

**How to apply:** For this mobile Preview, keep Metro watchFolders limited to the app and the shared API client packages it imports. Keep the workspace and app node_modules in resolver.nodeModulesPaths for package resolution without watching unrelated artifacts. Clean stale service processes before judging a fresh Expo start.