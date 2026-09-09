---
name: Workspace TypeScript project references
description: Why standalone package typechecks can fail when workspace libraries expose generated source but have stale declaration outputs.
---

When an app's standalone `tsc --noEmit` check uses a TypeScript project reference to a workspace library, TypeScript may require that library's emitted declarations and report missing or stale exports even when the source exports are correct.

**Why:** The root workspace check builds referenced libraries first, but a package-level check does not necessarily do so; stale `dist` declarations can hide newly generated API hooks and make downstream values become `any`.

**How to apply:** Prefer direct workspace package source resolution for standalone app checks, or explicitly build the referenced libraries as part of the check. After OpenAPI changes, regenerate the React client and Zod schemas before validating consumers.