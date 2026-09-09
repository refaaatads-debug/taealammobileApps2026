---
name: Mobile identity gates
description: The mobile app must treat unresolved Supabase identity and access state as a blocking condition.
---

The mobile client must not open learner or teacher routes until the authenticated Supabase user has a resolved `user_roles` role, and teacher approval and ban state have been checked from their authoritative tables.

**Why:** The original platform derives permissions from Auth user ID → `profiles` → `user_roles`, with teacher approval and ban checks outside the profile row. Falling back to a student view can expose the wrong data path and makes teacher testing look like a booking failure.

**How to apply:** Keep `/api/me` authoritative and fail visibly on missing or unreadable access state. In the mobile root gate, distinguish loading, unresolved/error, banned, pending teacher approval, unsupported role, and allowed student/teacher states.