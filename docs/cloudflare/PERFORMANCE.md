# Cloudflare Performance Plan

**Date:** 2026-10-13
**Status:** Worker/D1 functional E2E measured locally; production performance not established.

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

Keep queries indexed and projections narrow. Bound page sizes, SSE lifetimes, polling intervals, request bodies, and retry counts. Measure Worker CPU and wall time in the actual runtime; local loopback numbers from the PostgreSQL implementation do not transfer to D1.

## Known risks

- Workers Free HTTP/Cron CPU is limited to 10 ms per invocation.
- PBKDF2 intentionally consumes CPU and may need a login-specific capacity decision.
- D1 row writes include index maintenance and can exhaust the daily write budget faster than row counts suggest.
- A route that accidentally imports the PostgreSQL client can fail at runtime even when the Worker bundle builds.

## Gate

Performance remains a release gate until representative deployed command latency and error behavior are measured. Do not tune by increasing paid limits; the requested target is the Free plan.

