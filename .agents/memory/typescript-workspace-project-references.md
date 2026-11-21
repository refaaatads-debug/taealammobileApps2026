---
name: Workspace TypeScript project references
description: Why standalone package typechecks can fail when workspace libraries expose generated source but have stale declaration outputs.
---

When an app's standalone `tsc --noEmit` check uses a TypeScript project reference to a workspace library, TypeScript may require that library's emitted declarations and report missing or stale exports even when the source exports are correct.

**Why:** The root workspace check builds referenced libraries first, but a package-level check does not necessarily do so; stale `dist` declarations can hide newly generated API hooks and make downstream values become `any`.

**How to apply:** Prefer direct workspace package source resolution for standalone app checks, or explicitly build the referenced libraries as part of the check. After OpenAPI changes, regenerate the React client and Zod schemas before validating consumers.

After a major dependency-type change in a referenced library, an incremental project build can still reuse declarations generated against the old dependency. Downstream inference errors may therefore be stale-output symptoms rather than application regressions.

**Why:** Changing the workspace's Zod major left the API schema declaration output stale until its project reference was force-built; the consumer typecheck then passed without source changes.

**How to apply:** Force-build the affected referenced library before changing consumer code to address new implicit-`any` or inference errors after a major dependency update.