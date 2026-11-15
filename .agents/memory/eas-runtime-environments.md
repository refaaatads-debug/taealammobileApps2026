---
name: EAS runtime environments
description: Distinguishes Replit project secrets from EAS cloud build environment variables for Expo runtime configuration.
---

EAS Preview and Production do not inherit Replit Secrets automatically. A mobile build that requires a public Supabase key must have that key configured in each selected EAS environment; profile `env` entries only cover literal non-secret values.

On 2026-11-15, the user confirmed that `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is configured in both EAS Preview and Production. This is user-reported state and was not independently inspected in the Expo account.

**Why:** A Replit secret can exist and local Expo bundles can pass while `eas env:list` reports no project variables, producing an APK whose Supabase client is null at startup.

**How to apply:** Audit Replit secret existence and EAS environment names separately. Keep public URL/domain literals in `eas.json`, select `preview`/`production` explicitly, and require the publishable key in both EAS environments without committing or printing its value. Re-check the EAS setting before a future build if it may have changed.