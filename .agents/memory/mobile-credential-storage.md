---
name: Mobile credential storage
description: Security rule for login persistence in the native and web clients
---

The mobile client must persist only the Supabase session and must never persist the user's password, even in SecureStore. Legacy remembered-login values are cleared during app bootstrap.

**Why:** Session persistence is sufficient for returning users, while storing a reusable password increases the impact of device compromise and is unnecessary for the platform authentication flow.

**How to apply:** Keep login forms transient, use Supabase session restoration for returning users, and remove any old credential-storage keys during startup when upgrading from an older release.