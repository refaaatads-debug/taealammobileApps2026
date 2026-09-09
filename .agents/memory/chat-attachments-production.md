---
name: Chat attachments in production
description: Production Supabase Storage behavior for chat uploads and attachment playback.
---

Chat attachments must be uploaded under `booking_id/...`, not `user_id/...`, because the production `storage.objects` INSERT policy validates booking participation and confirmed/completed status from the first path segment.

**Why:** Production `chat-files` is currently private even though an earlier migration created it as public. `getPublicUrl()` only constructs a URL; it does not grant access, and upload attempts using a user folder were rejected by Storage RLS.

**How to apply:** Insert the chat message with the object URL so the participant SELECT policy can identify the file, then resolve the object path with `createSignedUrl()` when rendering/opening attachments. Do not change the production bucket or policies without explicit approval.