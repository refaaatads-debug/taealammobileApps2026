---
name: Production push-token storage
description: Production schema constraint for Expo push-token registration and delivery.
---

The API's Expo push flow requires a public push_tokens table keyed by the Supabase user ID. The self-hosted production database contains profiles and auth.users but not the local Drizzle users table, so this table must remain independent and must not assume a users foreign key.

**Why:** Device token registration reached the API but failed with relation-not-found until the production table was created. A successful mobile token request and a populated production row are required before testing Expo delivery.

**How to apply:** Verify the table and row count in production before claiming push is fixed. Treat an installed APK that produces no /api/push-tokens request as an unverified/old build or a native notification-module/permission problem, not as a server delivery success.