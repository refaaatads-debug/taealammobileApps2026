---
name: Supabase runtime verification
description: Verify publishable keys against the live custom Supabase domain before testing authenticated data.
---

The app must validate the publishable key against the live Supabase auth/settings endpoint before claiming live-data verification. A secret can exist in Replit while still being invalid for the configured custom domain.

**Why:** An initially stored value returned `Invalid authentication credentials` despite the secret existing. Re-entering the correct publishable key through the secure flow resolved the issue.

**How to apply:** Never copy credentials from the VPS or chat into source. Use the secure secrets flow, confirm auth/settings and a harmless public query return success from the API runtime itself, then restart API and Expo before authenticated tests. A browser-side login result is not enough if the API runtime cannot reach the custom domain.