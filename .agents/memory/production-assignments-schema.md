---
name: Production assignments schema
description: The production assignments relation does not expose progress as a selectable column.
---

The teacher student-directory flow must derive student membership from assignment links without selecting `assignments.progress`; use a verified progress source before displaying nonzero assignment progress.

**Why:** Supabase production rejected the directory query when it selected a column that exists in local assumptions but not in the live schema, hiding the entire teacher student list.

**How to apply:** Treat missing production columns as a contract mismatch, remove them from broad list queries, and keep the UI explicit about unavailable progress rather than failing the whole list.