---
name: EAS build quota
description: GitHub APK workflows can fail after a successful upload when the Expo account has exhausted its monthly Android cloud-build allowance.
---

An EAS cloud build quota failure is not a code, GitHub Actions, or EXPO_TOKEN failure: authentication, credentials, archive upload, and fingerprinting can all succeed before EAS rejects the build.

**Why:** The workflow reports only exit code 1 at the end, while the actionable message says the account's Android builds are exhausted until the monthly reset.

**How to apply:** Do not rerun repeatedly. Wait for the reset or use a separately configured local Android build environment; after reset, rerun the existing manual GitHub workflow without changing the APK configuration.