---
name: Canvas preview host resolution
description: Resolve the Replit host used by mockup-sandbox Canvas iframe URLs.
---

When a Canvas mockup needs a preview iframe URL, the runtime-managed `REPLIT_DOMAINS` value may not appear through `viewEnvVars`, while it is available to the shell environment.

**Why:** The environment-variable callback returned no domain for this runtime, but the managed shell process had the host needed by the working mockup preview.

**How to apply:** Resolve the host through `shellExec` and use it only to form the preview URL; do not expose it in user-facing text.
