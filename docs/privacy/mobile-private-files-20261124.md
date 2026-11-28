# Mobile private-file URL changes (draft only)

Base: `replit-dev` at `cdd3ab74531b01ea8ad1cd7bc8e3541b67141e9c`.

## Changes

- Withdrawal attachments open only a newly signed `support-files` URL. Missing storage, signing errors and unsupported URLs fail closed. No public/original URL fallback.
- Chat accepts object paths or same-origin HTTPS storage URLs for `chat-files`, never foreign hosts or arbitrary external URLs. Legacy public/signed URLs become paths and are signed again.
- Chat URLs last five minutes and refresh after four minutes. Foreground and authentication changes clear old URLs. Request generations prevent late responses from restoring an old account's URL. Signing also checks the session before and after the request.
- Certificates accept only `certificates/` paths in `support-files` or matching same-origin storage URLs. Arbitrary external URLs are rejected. Certificate links last five minutes; the preview closes after four minutes or on foreground/authentication changes. Reopen and PDF retry sign again instead of reusing the previous URL.
- No persistent signed-URL cache was added. The current storage origin comes from `EXPO_PUBLIC_SUPABASE_URL`, falling back to the existing project default.

## Intentional limits

This is client-side preparation, not the privacy cutover. Existing public buckets and storage policies are unchanged. A signed link remains a bearer credential until expiry; clearing it from the UI cannot revoke a URL already copied or bytes already downloaded. Previously downloaded OS/image/audio data is not erased by this patch. Unknown legacy hosts and ambiguous object names fail closed and require inventory/review rather than an automatic allowlist exception.

No merge, APK build, Expo export, OTA, store release, database operation, bucket/policy change, payment, provider notification, mail or push call was performed.

## Verification

- `npm run test:private-files`: focused parser, signer, session-race, certificate and existing profile-storage tests. Hook/screen wiring checks are source assertions, not a device simulation.
- Broad Node test suite compared against the unchanged base. The existing `ajyalDirectData.test.mjs` test runner cannot resolve the `@/lib` alias under plain Node; it also fails on the base.
- Full TypeScript check compared against the unchanged base. Both have the same three existing errors: the profile `trash-2` icon union and two nullable-Supabase errors in `app/delete-account.tsx`. No new TypeScript diagnostics.
- `git diff --check`.
- No visual or installed-device acceptance was run. No build/export was authorized. Required before release: actual Android image/voice/file access, expiry/foreground, account switch/logout, PDF retry, external-host denial and error UI, against private-policy staging fixtures.
