# Cloudflare Migration Test Report

**Date:** 2026-10-13  
**Overall status:** Local Worker/D1 build, scheduler authorization, realtime recovery, and capacity model verified; remote account authentication and workers.dev smoke remain the only deployment gates.

## Checks

| Check | Status | Result |
| --- | --- | --- |
| npm run lint | PASS | Completed with no lint errors after the Worker wrapper and bootstrap script changes. |
| npm run typecheck | PASS | Completed after generating both PostgreSQL and D1 Prisma clients. |
| npm test -- --run | PASS | 17 test files passed; 51 tests passed and 9 DB-gated tests were intentionally skipped. Skipped tests are not counted as passes. |
| Prisma schema validation | PASS | PostgreSQL and D1 clients generate successfully; Prisma emits its existing package.json configuration deprecation warning. |
| npm run build | PASS | Final Next.js production build completed successfully; the Prisma query-compiler WASM bundling emitted a non-fatal broad-pattern warning. |
| npm run build:vinext | PASS | Cloudflare Build Output completed with the D1 query-compiler WASM asset; the local plugin emitted a non-fatal Docker socket warning. |
| npx cf build | PASS | Build Output completed with the Worker wrapper, assets, D1 DB binding, and nodejs_compat; the local plugin emitted a non-fatal Docker socket warning. |
| npx vinext check | PASS WITH PARTIALS | 94% compatible: all imports and detected libraries pass; only the known `typedRoutes` and `reactStrictMode` partial-support notices remain. |
| Local D1 migrations | PASS | 0001_init.sql and 0002_auth_login_lockouts.sql applied successfully to disposable Wrangler state. |
| D1 bootstrap generator | PASS | 101 idempotent bootstrap statements generated with disposable credentials and applied successfully to local D1. No demo appointment or payment data was added by the bootstrap; operational smoke rows were removed afterward while the bootstrap catalog/admin/staff rows and two migration records were retained. |
| Direct vinext page/data smoke | PASS for smoke scope | Public pages, health, catalog, board, and SSE initial snapshot returned successfully on local port 3001. |
| D1 check-in | PASS for smoke scope | First check-in returned 201, replay returned the same result, conflicting payload was rejected, and three concurrent requests received unique appointment codes. |
| D1 authentication | PASS for smoke scope | PBKDF2 login returned a session user, session retrieval succeeded, and wrong credentials returned a generic failure. |
| D1 payment confirmation | PASS for smoke scope | Payment confirmation returned the completed appointment, replay was idempotent, and a conflicting payment key was rejected. |
| D1 staff/appointment command smoke | PASS for smoke scope | Local HTTP smoke exercised staff check-in/out, accept, finish, add-support, continue-with-me, skip/exclusion, service change, reassignment, cancellation, reconciliation, and PIN failure counting. |
| D1 admin mutation smoke | PASS for smoke scope | Local HTTP smoke exercised skills, skip reasons, customers, categories, services, staff, accounts, attendance, ShopConfig, and related audit/receipt paths. |
| D1 admin read smoke | PASS for smoke scope | Config, catalog, staff, accounts, customers, appointments, appointment search, customer search, reports, board, and services returned HTTP 200 after the D1 search compatibility fix. |
| D1 job mutation smoke | PASS for smoke scope | Retention returned a successful cleanup result; closing correctly returned `SHIFT_CLOSING_BLOCKED` with blockers, then closed four present staff after local smoke visits were resolved. |
| cf dev data/page smoke | BLOCKED | Current Cloudflare plugin Build Output mode cannot initialize the SSR child environment required by vinext. |
| Docker Compose health | PASS | Rebuilt the local production image with the explicit `.env` file; `app` and PostgreSQL are healthy and `/api/health` returned `status: ok`. No `.env` contents were printed and no volumes were reset. |
| D1 full integration tests | BLOCKED | The command branches and local HTTP smoke are broader now, but full D1 batch/rollback/interruption evidence, concurrency coverage, and remote Worker validation remain incomplete. |
| Owner timezone decision | PASS | Owner confirmed `Asia/Ho_Chi_Minh`; the repository `.env` matches and `.env.example` now uses the same IANA value. |
| Confirmed timezone seasonal-offset unit test | PASS | `Asia/Ho_Chi_Minh` evaluates as UTC+7 on representative January and July instants; this does not replace simulated Cloudflare cron authorization tests. |
| Scheduler mapping/authorization | PASS (local) | Unit tests cover IANA validation, DST refusal for static mappings, the dynamic D1 timezone/closing-time decision, unknown cron rejection, disabled gate, and protected secret forwarding. One `*/15 * * * *` trigger is configured. |
| Realtime browser recovery | PASS (local reference runtime) | Existing Playwright resilience coverage exercises SSE reconnect, board retry, and idempotent check-in; the Cloudflare remote stream still needs the first workers.dev smoke. |
| Free-tier capacity model | PASS (planning gate) | Scenarios for 50/100/200 customers/day remain below current Workers/D1 Free limits with the 15-second polling budget; remote metrics and 10 ms CPU accounting remain unmeasured. |
| npx cf deploy --dry-run | PASS | Build Output and binding inventory validated; dry-run exited before any upload. |
| npm audit --omit=dev --omit=optional | PASS (last successful run) | The Docker production-prune scope previously reported 0 vulnerabilities and the image contains 90 packages after pruning. A repeat on 2026-10-13 could not reach `registry.npmjs.org` (`ENOTFOUND`); no dependency files changed after the successful audit. |
| Remote deploy / production smoke | BLOCKED | Wrangler auth has expired and the Cloudflare auth server was unreachable from this environment; no remote D1 or Worker was changed. |

## Interpretation

The successful builds, local D1 smoke, scheduler tests, realtime browser tests, and capacity model prove that the artifact is prepared for the remote deployment sequence. They do not replace remote D1/Worker behavior, Cloudflare CPU accounting, or the final production smoke.

## Required next test run

Next: authenticate Wrangler securely, confirm the target account remains on Workers Free, create the fresh production D1, apply migrations/bootstrap, set `AUTH_SECRET` and `CRON_SECRET` through Wrangler secrets, deploy the workers.dev Worker, and run the non-destructive remote smoke in `DEPLOYMENT_GUIDE.md`. Changing timezone or closing time in Admin later uses the D1 value directly; no code change is required.
