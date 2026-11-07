---
name: Platform parity reference
description: The canonical web platform source used to verify mobile feature behavior and latest policy.
---

For app-to-platform parity, use `refaaatads-debug/taealam` on its `main` branch as the current source of truth. Check the relevant source files and recent commits before implementing mobile behavior.

**Why:** Platform changes can land ahead of the mobile app, so local snapshots may not reflect the current display or data-linking policy.

**How to apply:** Compare the platform’s current data query, eligibility filters, and fallback behavior with the mobile implementation. Keep production mutations separate from parity work.
