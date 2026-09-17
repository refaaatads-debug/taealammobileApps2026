---
name: OpenAPI integer generation compatibility
description: A code-generation compatibility constraint between the workspace's Orval output and its installed Zod version.
---

The current OpenAPI-to-Zod generator combination must not emit `type: integer`; it generates `zod.int()`, which is unavailable in the installed Zod API and breaks library typechecking.

**Why:** A harmless contract tightening caused generated code to fail before application code was typechecked.

**How to apply:** Use a bounded numeric schema plus a clear whole-unit description for generated contracts, and enforce integer semantics in the runtime handler when needed.

Generated runtime Zod schemas are named from the OpenAPI `operationId` (for example, `SendUserNotificationBody`), while component schema names remain TypeScript interfaces in the generated types folder.

**Why:** Importing a component name as a runtime validator caused the API server typecheck to fail after a valid contract change.

**How to apply:** After codegen, inspect `lib/api-zod/src/generated/api.ts` for the runtime validator export before importing it into a route.