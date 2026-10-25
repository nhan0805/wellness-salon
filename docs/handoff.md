# Handoff

Last updated: 2026-10-25

## Runtime

Wellness Salon is a tablet-first operations app for one nail shop. The only supported runtime is a Cloudflare Worker backed by D1 (SQLite). Local development and E2E use a disposable local D1 database; the Worker `DB` binding is required and a missing binding is a startup/health failure.

The deployed Worker is `https://wellness.n8l.workers.dev`. Source commit `227a5dc` was deployed by GitHub Actions run `39184956401`; remote migration `0005_free_quota_hardening.sql` is applied, the post-deploy `/api/health` check returned HTTP 200 with `status: ok`, and the authenticated/public read-only smoke passed 19/19 checks. Local tests must never mutate remote D1.

## Current status

- Kiosk, public turn board, protected staff actions, admin queue/payment/reports, customer/staff/service/account management, appointment history, and audited payment correction/refund records are implemented.
- The Worker auth boundary uses Web Crypto PBKDF2/HS256 and D1-backed session/lockout state. Bootstrap credentials remain environment-only.
- Critical mutation paths use D1 batches, predicates, leases, command receipts, and audit rows. D1 is not treated as a rollback transaction boundary; interruption and concurrency evidence remain release gates.
- The canonical database-backed gate is `npm run test:e2e:d1`: build Worker artifact, apply all five D1 migrations, generate the 101-statement disposable bootstrap, and run the Worker Playwright suite.
- The latest evidence includes 67/67 unit/integration tests, 47 Worker/D1 cases with one intentional desktop-project skip, and 61 cases across the combined Chromium/tablet/WebKit gate with two intentional skips. The disposable D1 recovery rehearsal and 19/19 remote read-only smoke also pass. Re-run the commands below after meaningful changes.
- The Admin loading reliability follow-up adds bounded client deadlines, cancellation of superseded loads, stale-response guards, Retry/error states, and a section-aware Dashboard snapshot. Prisma/D1 work is request-scoped, the former cross-request Promise queue and compatibility workaround are removed, and the E2E harness fails on runtime cancellation/cross-request I/O logs. The latest verification is 63/63 unit tests plus 37 passed and one intentional skip in the Worker/D1 E2E gate.

## 2026-10-25 Local responsive and CPU follow-up

- The board Staff availability overflow action now opens the Staff attendance tab and is keyboard accessible; the board queue actions and tab labels remain inside 320px, 360px, and 390px viewports.
- Historical review actions remain available inside a contained table scroll region at 90% browser zoom. Admin and Board/Station both open the customer Kiosk in a separate tab, and the staff form regression confirms Full Name, Skills, and Assignment availability persist.
- The code audit covered `/api/sse/board`, `/api/board`, `/api/admin/dashboard`, and `/api/admin/appointments/past-unresolved`. It removed duplicate normal board bootstrap reads, narrowed board projections, and skipped unused Appointments report aggregation. Cloudflare dashboard/log access is still required to prove deployed CPU per invocation and D1 row/latency metrics.
- Final local checks for this follow-up: `npm run lint`, `npm run typecheck`, `npm test` (67/67), `npm run build`, production `npm audit` (0 vulnerabilities), and `npm run test:e2e:d1` (47 passed, 1 intentional skip). No deployment or remote D1 mutation was performed before the Git-based release workflow.

## 2026-10-18 Git-based release

- The release updates the Worker/D1 read paths, completes the historical appointment reconciliation workflow, keeps four-digit PIN entry auto-submitting, and replaces the technical wrong-PIN response with `Incorrect PIN. Please try again.` without exposing a request reference to the user.
- The historical production queue was independently verified at zero open records across unserved, assignment-gap, interrupted-service, and payment-review categories. Collect records were recorded as card payments with zero tip; review and unfinished `IN_SERVICE` records were cancelled with reason `ok`.
- The temporary historical bulk endpoint and reconciliation script were removed after the one-time data operation. The GitHub Actions workflow is the authoritative deployment path for this release and runs only after the verified commit is pushed to `main`.
- Local verification completed with `npm run lint`, `npm run typecheck`, the API-response unit test (4 passed), and `npm run test:e2e:d1` (41 passed, 1 intentional skip).

## 2026-10-19 Free-demo quota hardening

- Commit `e4ec299` adds bounded D1 routing/reconciliation batches, atomic kiosk rate limiting, indexed service-count filtering, chunked report refund lookups, counter-based appointment codes, lifecycle-aware SSE reconnects, catalog cache headers, and quiet routine-read observability.
- Migration `0005_free_quota_hardening.sql` adds `service_count`, appointment counters, and a report-supporting audit index; it is applied to remote D1 for this release.

## 2026-10-19 Operational verification follow-up

- Added `npm run smoke:remote` for public and authenticated admin read-only production checks; it does not create appointments or payments.
- Added `npm run d1:recovery:rehearsal` for a disposable D1 export/restore rehearsal.
- Added optional WebKit/iPad E2E coverage and blocked service workers in route-interception tests so Safari-like retry/error assertions are deterministic.
- Added a six-hour public smoke workflow and [OBSERVABILITY.md](cloudflare/OBSERVABILITY.md) for quota, Worker log, D1 metrics, and scheduler review.

## Local workflow

```bash
npm install
npm run db:generate
npm run dev
```

Open `http://127.0.0.1:3001`. For the disposable full gate:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build:vinext
npm run test:e2e:d1
```

The local D1 configuration is `wrangler.local.jsonc`. Schema and migrations live under `prisma/d1/`; the generated client is `@prisma/d1-client`. The bootstrap generator is `scripts/seed-d1-bootstrap.ts`, and the closing helper is `scripts/trigger-closing.sh`.

## Important paths

- `src/server/db.ts` — Worker D1 binding, adapter, lease, and batch boundary.
- `src/server/auth.ts` and `src/server/security.ts` — Worker-compatible sessions, PBKDF2 verification, and D1 lockouts.
- `src/server/services/prisma-operations.ts` — D1 reads and guarded mutation orchestration.
- `src/server/services/admin-operations.ts` — D1-backed catalog, account, customer, staff, and configuration operations.
- `src/client/fetch-with-timeout.ts` — shared client deadline and cancellation helper for Admin data requests.
- `prisma/d1/schema.prisma` and `prisma/d1/migrations/` — the only schema/migration source of truth.
- `scripts/run-d1-e2e.mjs` and `playwright.d1.config.ts` — local Worker/D1 E2E harness.
- `tests/e2e/admin-attendance.spec.ts` — authenticated Attendance loading smoke.
- `wrangler.local.jsonc` and `wrangler.production.jsonc` — local/remote binding and deployment configuration.

## Loading and timeout guardrails

Admin reads have a 10-second client deadline and mutations have a 15-second deadline. A deadline prevents an indefinite spinner; it does not make a slow Worker healthy. On timeout, the UI keeps the current data where possible, marks the section stale, and exposes Retry. Starting a newer load aborts the older one, and stale responses cannot overwrite the current section.

Attendance uses a direct D1 read path for a small, predictable read. Dashboard refreshes use a section-aware snapshot endpoint, `Promise.allSettled`, an in-flight guard, and a narrow live projection; background polling does not rerun reports/settings. Prisma clients and D1 bindings never cross request boundaries, and the E2E gate rejects the previous Worker cancellation/cross-request I/O signatures.

## Git and deployment handoff

`.github/workflows/ci.yml` runs verification for every push and deploys the Worker only after a successful push to `main`. All deployment inputs must be committed and pushed through Git; verify the working tree is clean and the deployed revision matches the intended commit before release. This workspace has no in-tree `.git`; the attached metadata lives at `/private/tmp/wellness-salon-git`, with `origin` configured for `nhan0805/wellness-salon`. Push the verified commit to `main` to trigger CI and the production Worker job. The remote D1 migration must be applied before the Worker job activates the schema-dependent release. Do not point local E2E at remote D1 and do not print `.env`.

## Environment and safety

Use `.env.example` as the variable inventory and keep actual `.env` values private. Do not print credentials, tokens, or the contents of `.env`. Local E2E uses disposable state and must not be pointed at production D1. Remote migration, secret changes, deploys, scheduler activation, and data recovery require explicit owner approval.

## Open gates

- Physical iPad, real-network interruption, Dynamic Type/VoiceOver, and offline behavior. WebKit emulation passes locally.
- D1 interruption/failure-injection and broader concurrency evidence for queue, payment, closing, retention, and session paths.
- One approved deployed Worker business mutation, scheduled-event review, and Free-tier capacity observation. Read-only auth/SSE smoke passes.
- Protected remote export/restore, production domain/TLS, scheduler alerting, money representation review, and final approval. Required Worker secret names are present.

## Framework note

Read `AGENTS.md` before framework changes. This repository uses the installed Next.js guidance under `node_modules/next/dist/docs/`, but the application is built and verified through the Worker-compatible vinext path.
