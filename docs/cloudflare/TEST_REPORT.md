# Cloudflare Migration Test Report

**Date:** 2026-10-19
**Overall status:** Local Worker/D1 build, the Chromium/tablet/WebKit E2E gate, disposable D1 recovery rehearsal, and authenticated read-only production smoke are verified. Source commit `227a5dc` is deployed to workers.dev, all five migrations are applied to remote D1 with no pending migrations, and the post-deploy `/api/health` check returned `status: ok`; business mutation/scheduler evidence, failure-injection, live capacity, physical-device review, and final production approval remain open. The historical rows below retain their original dates; the follow-up section records the current evidence.

## 2026-10-25 local follow-up evidence

| Check | Result |
| --- | --- |
| `npm run lint` | PASS; no lint errors. |
| `npm run typecheck` | PASS; D1 Prisma client generated before checking. |
| `npm test` | PASS; 21 files and 67 tests passed. |
| `npm run build` | PASS; Worker/vinext output prepared successfully. |
| `npm run test:e2e:d1` | PASS; 47 Playwright cases passed and one desktop-project case was intentionally skipped. |
| Responsive fixes | PASS locally at 320/360/390px queue sizes and 90% zoom historical review; Admin/Board Kiosk entry and staff-form persistence regressions pass. |
| Cloudflare CPU investigation | Code-level causes and safeguards documented in [PERFORMANCE.md](PERFORMANCE.md); deployed per-invocation CPU, D1 row/latency, and quota evidence still require dashboard/log access. |
| Deployment | Not performed for this follow-up; no remote D1 was targeted. |

## 2026-10-19 follow-up evidence

| Check | Result |
| --- | --- |
| WebKit/iPad emulation | PASS; combined Chromium/tablet/WebKit gate passed 61 cases with two intentional skips. |
| Disposable D1 export/restore | PASS; `npm run d1:recovery:rehearsal` restored `services=12`, `staff=6`, `auth_users=2`, and `shop_config=1`. |
| Remote read-only smoke | PASS; `npm run smoke:remote` passed 19/19 public and authenticated admin checks, including the SSE initial snapshot. |
| Worker secrets | PASS; `AUTH_SECRET` and `CRON_SECRET` are present as secret text names; values were not read or printed. |
| Scheduled public smoke | ADDED; GitHub Actions runs the public read-only smoke every six hours. Authenticated checks are enabled only when optional repository secrets are configured. |

## Checks

| Check | Status | Result |
| --- | --- | --- |
| npm run lint | PASS | Completed with no lint errors after the Worker wrapper and bootstrap script changes. |
| npm run typecheck | PASS | Completed after generating the D1 Prisma client. |
| npm test -- --run | PASS | 20 test files passed; 63/63 tests passed with no database skips. |
| npm run test:e2e:d1 | PASS | Worker artifact + disposable local D1 migrations/bootstrap; 37 passed and 1 intentional project-specific skip across 38 Playwright cases. |
| Prisma schema validation | PASS | The D1 client generates successfully; Prisma emits its existing package.json configuration deprecation warning. |
| npm run build | PASS | Final Next.js production build completed successfully; the Prisma query-compiler WASM bundling emitted a non-fatal broad-pattern warning. |
| npm run build:vinext | PASS | Cloudflare Build Output completed with the D1 query-compiler WASM asset. |
| npx cf build | PASS | Build Output completed with the Worker wrapper, assets, D1 DB binding, and nodejs_compat. |
| npx vinext check | PASS WITH PARTIALS | 94% compatible: all imports and detected libraries pass; only the known `typedRoutes` and `reactStrictMode` partial-support notices remain. |
| Local D1 migrations | PASS | 0001 through 0004 applied successfully to disposable Wrangler state. |
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
| D1 full integration tests | PASS (local E2E scope) | The Worker/D1 Playwright gate covers auth, kiosk, board, staff/admin workflows, payment paths, resilience, and responsive queue behavior. Fault-injection/rollback, broader concurrency, and remote Worker validation remain incomplete. |
| Owner timezone decision | PASS | Owner confirmed `Asia/Ho_Chi_Minh`; the repository `.env` matches and `.env.example` now uses the same IANA value. |
| Confirmed timezone seasonal-offset unit test | PASS | `Asia/Ho_Chi_Minh` evaluates as UTC+7 on representative January and July instants; this does not replace simulated Cloudflare cron authorization tests. |
| Scheduler mapping/authorization | PASS (local) | Unit tests cover IANA validation, DST refusal for static mappings, the dynamic D1 timezone/closing-time decision, unknown cron rejection, disabled gate, and protected secret forwarding. One `*/15 * * * *` trigger is configured. |
| Realtime browser recovery | PASS (local reference runtime) | Existing Playwright resilience coverage exercises SSE reconnect, board retry, and idempotent check-in; the deployed remote SSE/recovery path still needs an approved remote smoke. |
| Free-tier capacity model | PASS (planning gate) | Scenarios for 50/100/200 customers/day remain below current Workers/D1 Free limits with the 15-second polling budget; remote metrics and 10 ms CPU accounting remain unmeasured. |
| npx cf deploy --dry-run | PASS | Build Output and binding inventory validated; dry-run exited before any upload. |
| npm audit --omit=dev --omit=optional | PASS (last successful run) | The last successful dependency audit reported 0 vulnerabilities. A repeat on 2026-10-13 could not reach `registry.npmjs.org` (`ENOTFOUND`); no dependency files changed after the successful audit. |
| Remote migration/deploy / production smoke | PASS with scope limit | Worker `1a2b699a-e573-450c-bdd6-b82cda87e81e` deployed at `https://wellness.n8l.workers.dev`; remote D1 reports no pending migrations and read-only `/api/health` returned `status: ok`. Full remote auth/mutation/scheduler/capacity evidence was not run. |

## Interpretation

The successful builds, canonical local D1 E2E gate, local scheduler/realtime tests, capacity model, and scoped remote smoke prove that the deployed artifact is reachable and that the public read paths respond. They do not replace D1 fault-injection/rollback evidence, remote auth/mutation behavior, deployed SSE recovery, Cloudflare CPU accounting, scheduler-event verification, or the final production approval.

## Required next test run

Next: complete the D1 failure-injection/concurrency and money-review gates, run the remaining approved remote auth/mutation/SSE/scheduler checks against the deployed Worker, measure deployed capacity, and obtain final production approval. The existing D1 schema/data and Wrangler secrets were preserved during this deployment; do not recreate or reset them. Changing timezone or closing time in Admin later uses the D1 value directly; no code change is required.
