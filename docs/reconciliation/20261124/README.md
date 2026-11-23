# VPS API source reconciliation, 24 November 2026

DRAFT review only, based on current replit-dev `cdd3ab74531b01ea8ad1cd7bc8e3541b67141e9c`. No merge/deployment requested. App files unchanged.

## Imported

Current running API checkout is `5ad318049d22a7ddb653e4aca69f7b937376636a` on `api-deploy-9b2`, with local push-image modifications. Its runtime application source reconciles cleanly with current replit-dev. Imported trusted admin attachment resolver, small public JPEG derivatives, bounded cache and image route, original attachment retained, outbox integration, exact sharp dependency/lockfile additions from existing PR33 and its tests. Six old-base changed API paths already matched current source. A complete tracked-file hash comparison also found two newer GitHub route fixes, deliberately retained: safeReturnTo redirect validation in auth.ts, and normalized booking-request status in learning.ts. Therefore the whole API tree is not byte-identical to live.

`api-live-hashes.json` records all 11 captured changed/new VPS files. All nine application-source files match exactly; the captured pushOutbox test is extended by one additional PR32 regression test, and remaining captured test matches. This is source equality, not proof a rebuilt bundle matches current dist byte-for-byte.

Included existing PR32 SQL guard and rollback-contained fixture under ops. The guard was observed live. Neither SQL file was executed here. No queue, notifications or provider service was exercised; tests use mocks, generated synthetic images and an unreachable local-only dummy DB connection string. No real credentials/data included.

## Relationship to existing PRs

This draft consolidates source of PR32 then PR33 against the current release base, without merging either or changing their branches. Do not merge all three independently. Review this replacement path, then decide whether to supersede the old stacked PRs. PR31 phone auth and all live-voice candidates are excluded.

## Checks

- 71 API unit tests pass, including attachment allowlist, narrow dedupe, no image on ordinary pushes, size/format/concurrency/cache/path guards, original-byte preservation and existing contracts.
- API TypeScript check passes.
- API build succeeds locally. No local build output committed or uploaded to VPS.
- Existing app source/native settings remain byte-identical to replit-dev.
- Source hash parity covers the nine runtime source files captured from the VPS, not the entire historical API directory. Complete tracked-file comparison leaves exactly six known differences: those two newer route fixes, two extended regression tests, package.json and pnpm-lock.yaml. Metadata retains current Express 5.3.0 rather than old VPS source declaration 5.2.1; the running installed dependency version was not validated. These are deliberate source-vs-live differences, not deployed changes.

## Not done

No VPS file/service/config/login changes, database mutation, production push, merge, store release or OTA. Production dist remains untouched. Capture excluded env/secrets/staging directories. Current VPS dist hash at audit: `c81b55d1e5694d61f814a7c11f0275444b4b2de0a8954bed8fa77b04d918d69c`.
