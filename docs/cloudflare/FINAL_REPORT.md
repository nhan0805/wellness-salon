# Cloudflare Free Migration Final Report

**Date:** 2026-10-13  
**Decision:** WORKER DEPLOYED; production sign-off remains open. The first workers.dev deployment is reachable and passed a scoped read-only smoke, but the remaining release gates still prevent a full production-readiness claim.

## Delivered in this phase

- Added the official vinext/Cloudflare build path with a typed Worker config, D1 binding, assets, and a Worker wrapper exposing fetch plus a timezone-gated scheduled handler.
- Added separate SQLite/D1 schema history with the auth login-lockout migration and an adapter-compatible WASM runtime.
- Replaced the Worker auth dependency on Auth.js with a custom HS256 session boundary and Web Crypto PBKDF2 password/PIN verification, while retaining legacy Argon2 verification for reference data.
- Added exact integer-minor-unit money parsing and validation at the application boundary.
- Ported critical D1 command branches to explicit batches with idempotency receipts and guards: kiosk check-in; staff attendance/actions; payment confirmation/adjustment/correction/refund; appointment cancellation/reassignment/exclusion override/service change; reconciliation; closing/retention; and catalog/account/customer/staff/admin-management writes.
- Fixed direct D1 DateTime writes to match Prisma adapter query serialization.
- Added a clean D1 bootstrap SQL generator for catalog, staff, accounts, skip reasons, and ShopConfig. It deliberately creates no demo appointments or imports real data.
- Verified local migrations, the 101-statement bootstrap, public routes, check-in concurrency/idempotency, Worker login/session behavior, staff/appointment/admin/payment HTTP smoke, retention and closing blocker/success behavior, unit tests, typecheck, lint, vinext build, local Worker/D1 health, and Cloudflare Build Output.
- Added the canonical `npm run test:e2e:d1` gate: two D1 migrations, disposable 101-statement bootstrap, Worker artifact execution, 25 passed and 1 intentional project-specific skip across 26 Playwright cases, including auth, staff/admin workflows, payments, resilience, and the tablet queue layout regression.
- Fixed and reverified D1 admin appointment/customer search by removing unsupported case-insensitive query options from the D1 branch; the full admin read-only smoke returned HTTP 200.
- Final compatibility scan reports 94% vinext compatibility with no library issues; `cf deploy --dry-run` validated the Build Output and D1/assets/environment bindings without uploading anything.
- Removed all disposable local D1 bootstrap/smoke operational rows after verification, restored local ShopConfig to `09:00`–`21:00` with `Asia/Ho_Chi_Minh`, and retained the two migration records plus bootstrap catalog/admin/staff rows.
- Moved Cloudflare/build/seed-only packages out of runtime dependencies. The last successful dependency audit reported 0 vulnerabilities; a repeat was unavailable because the npm registry DNS endpoint was unreachable.

## Release blockers

1. The critical D1 branches are now explicit batch/guard/receipt paths, but no fault-injection or crash/interruption matrix has proved their behavior under partial execution. Full BR-01–BR-06 concurrency evidence and remote Worker/D1 smoke are still required.
2. The D1 schema keeps compatibility numeric money columns; financial reporting and storage representation require owner review before release.
3. The owner has confirmed `Asia/Ho_Chi_Minh` as the initial salon IANA timezone. The Admin UI remains authoritative for future timezone changes; one guarded `*/15 * * * *` UTC trigger reads D1 before choosing closing or retention.
4. Local scheduler mapping/authorization and realtime recovery tests now pass. The deployed Worker passed read-only health/catalog/page smoke, but remote auth/mutation/SSE recovery, deployed CPU/latency evidence, and final production approval remain incomplete.
5. cf dev remains blocked by the current plugin/SSR child-environment interaction, but the canonical direct Worker/D1 E2E gate, Cloudflare Build Output, and the final dry-run pass.

## Owner decisions still required

- Approve the guarded scheduler behavior and retention/closing policy. The trigger is intentionally timezone-agnostic; it reads the Admin UI configuration from D1.
- Review and approve the D1 command/concurrency and money design.
- Approve the remaining remote auth/mutation/SSE/scheduler checks, deployed capacity evidence, failure-injection/rollback review, and final production cutover decision.

## Deployment state

The Worker was deployed to `https://wellness.n8l.workers.dev` on 2026-10-13 as version `ca6490a9-345d-4a25-b69a-be93ecd6a8ce`, with the configured `*/15 * * * *` trigger. Read-only `/api/health`, `/api/services`, `/board`, and `/kiosk` smoke passed. The existing remote D1 schema/data and Wrangler secrets were preserved; no D1 reset, custom domain, or production-data import was performed.

## Recommendation

Treat Worker + D1 as the only runtime and test target. Complete the failure/concurrency, money, scheduler, capacity, and remaining remote evidence gates, rerun the final matrix, and keep the workers.dev deployment under supervised-pilot status until the owner approves production cutover.
