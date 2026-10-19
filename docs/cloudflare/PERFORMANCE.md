# Cloudflare Performance Plan

**Date:** 2026-10-19
**Status:** Worker/D1 functional E2E and a 19-check authenticated read-only production smoke are measured; production CPU/quota capacity is still not established.

## Implemented performance pass (2026-10-16)

The following changes are now in the Worker/D1 code path:

- Split the Admin client into on-demand chunks for settings, master data, appointment actions, access management, and payment keypad. The main Admin page chunk is about 118 KB raw (down from about 209 KB before the split); deferred modules load only when their surfaces are opened.
- Removed the blocking remote Google Fonts import and use a local system font stack for first paint. If exact brand typography is required later, self-host the selected WOFF2 files instead of restoring a third-party CSS import.
- Added board version-aware polling. Once a client has a full API snapshot, unchanged `/api/board` reads return `304` after a cheap `state_version` lookup instead of rebuilding the relation-heavy board payload. The SSE bootstrap now carries the same viewer metadata, and the first API load remains full so an auth race cannot hide protected actions.
- Reused one request-local Prisma runtime across catalog, admin appointments, reports, and past-unresolved reads. This avoids repeatedly initializing the Worker query compiler for parallel reads while preserving request isolation.
- Narrowed board/dashboard projections, skipped skip-reason reads for public viewers, and added the date/created-at appointment index in migration `0003_appointment_read_indexes.sql`.

The local production build reports a 244.86 KB raw / 37.13 KB gzip global CSS asset and a 219.27 KB raw / 68.40 KB gzip shared framework chunk; these remain the next client-side measurement targets rather than assumed regressions.

## Remaining scale follow-ups

- `DURATION_DESC` and payment-date appointment sorts still load matching IDs and sort in memory. Move these to indexed SQL/denormalized sort keys when appointment history grows materially.
- Customer history and some service-count/search filters still have broad result scans. Keep the existing page limits and add query-level pagination/indexes before high-volume rollout.
- Measure deployed Worker CPU, D1 latency, response sizes, and 15-second board fallback behavior on representative data. Local loopback E2E proves correctness, not production capacity.

The 2026-10-19 read-only production sample returned HTTP 200 for all 19 checks. Observed wall-clock timings were approximately 66–861 ms, with health at the high end on a cold/remote request. This is a smoke sample, not an SLO or a substitute for Cloudflare CPU/D1 row metrics.

## Build evidence

- Direct `npm run build:vinext` completed successfully.
- `npx cf build` completed successfully and emitted the Cloudflare Build Output Worker.
- The direct vinext server bundle was approximately 291.5 KB raw / 74.5 KB gzip for the server entry; the security chunk was approximately 29.9 KB raw / 12.2 KB gzip. These are local build artifacts, not a deployment SLO.
- The generated Worker path contains the D1 query-compiler WASM asset and no native Argon2 loader markers; new Worker credentials use Web Crypto PBKDF2 and legacy Argon2 verification remains only for compatibility.

## Workload constraints

The local `npm run test:e2e:d1` gate now covers the main Worker/D1 functional workflows, but it does not establish end-to-end D1 latency, CPU, subrequest, or production concurrency limits. On the deployed Worker, measure separately:

- public board read and the 15-second SSE/polling refresh fallback;
- kiosk lookup and check-in;
- authenticated admin reads and mutations;
- queue-routing and payment commands under retries/concurrency;
- login and PBKDF2 verification cost;
- closing/retention cron execution;
- representative history/report result sizes.

Keep queries indexed and projections narrow. Bound page sizes, SSE lifetimes, polling intervals, request bodies, and retry counts. Measure Worker CPU and wall time in the actual runtime; local loopback numbers do not transfer directly to deployed D1.

## Known risks

- Workers Free HTTP/Cron CPU is limited to 10 ms per invocation.
- PBKDF2 intentionally consumes CPU and may need a login-specific capacity decision.
- D1 row writes include index maintenance and can exhaust the daily write budget faster than row counts suggest.
- A route that accidentally imports a non-Worker database client can fail at runtime even when the Worker bundle builds.

## Gate

Performance remains a release gate until representative deployed command latency and error behavior are measured. Do not tune by increasing paid limits; the requested target is the Free plan.

