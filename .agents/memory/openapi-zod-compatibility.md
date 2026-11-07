---
name: OpenAPI code generation compatibility
description: Compatibility constraints and generated-contract drift to check when changing Orval or OpenAPI schemas.
---

The current OpenAPI-to-Zod generator combination must not emit `type: integer`; it generates `zod.int()`, which is unavailable in the installed Zod API and breaks library typechecking.

**Why:** A harmless contract tightening caused generated code to fail before application code was typechecked.

**How to apply:** Use a bounded numeric schema plus a clear whole-unit description for generated contracts, and enforce integer semantics in the runtime handler when needed.

Generated runtime Zod schemas are named from the OpenAPI `operationId` (for example, `SendUserNotificationBody`), while component schema names remain TypeScript interfaces in the generated types folder.

**Why:** Importing a component name as a runtime validator caused the API server typecheck to fail after a valid contract change.

**How to apply:** After codegen, inspect `lib/api-zod/src/generated/api.ts` for the runtime validator export before importing it into a route.

Before accepting an Orval upgrade, compare generated runtime schemas and client types with the current contract. A same-major upgrade can change TanStack Query output and remove response fields that existing application code still expects but the OpenAPI schema does not describe.

**Why:** A trial generator update defaulted client hooks to the wrong React Query major and dropped existing response fields, creating unrelated compatibility risk.

**How to apply:** Regenerate in a clean diff, inspect semantic changes in generated schemas and hooks, and keep the known-compatible generator pinned until the contract and all consumers are deliberately updated.