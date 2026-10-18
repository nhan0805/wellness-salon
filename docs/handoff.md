# Handoff

Last updated: 2026-10-18

## Runtime

Wellness Salon is a tablet-first operations app for one nail shop. The only supported runtime is a Cloudflare Worker backed by D1 (SQLite). Local development and E2E use a disposable local D1 database; the Worker `DB` binding is required and a missing binding is a startup/health failure.

The deployed Worker is `https://wellness.n8l.workers.dev`. The latest recorded version is `1a2b699a-e573-450c-bdd6-b82cda87e81e` from documentation-sync commit `7fb7f55` on application commit `6f379c0`; migrations `0003` and `0004` are applied to remote D1 with no pending migrations, and the post-deploy `/api/health` check returned `status: ok`. Remote auth, mutation, scheduler, capacity, and final production approval remain explicit gates. Local tests must never mutate remote D1.

## Current status

- Kiosk, public turn board, protected staff actions, admin queue/payment/reports, customer/staff/service/account management, appointment history, and audited payment correction/refund records are implemented.
- The Worker auth boundary uses Web Crypto PBKDF2/HS256 and D1-backed session/lockout state. Bootstrap credentials remain environment-only.
- Critical mutation paths use D1 batches, predicates, leases, command receipts, and audit rows. D1 is not treated as a rollback transaction boundary; interruption and concurrency evidence remain release gates.
- The canonical database-backed gate is `npm run test:e2e:d1`: build Worker artifact, apply all four D1 migrations, generate the 101-statement disposable bootstrap, and run the Worker Playwright suite.
- The latest evidence includes 63/63 unit tests and 37/38 Worker/D1 cases, with one intentional desktop-project skip. Re-run the commands below after meaningful changes.
- The Admin loading reliability follow-up adds bounded client deadlines, cancellation of superseded loads, stale-response guards, Retry/error states, and a section-aware Dashboard snapshot. Prisma/D1 work is request-scoped, the former cross-request Promise queue and compatibility workaround are removed, and the E2E harness fails on runtime cancellation/cross-request I/O logs. The latest verification is 63/63 unit tests plus 37 passed and one intentional skip in the Worker/D1 E2E gate.

## 2026-10-18 Git-based release

- The release updates the Worker/D1 read paths, completes the historical appointment reconciliation workflow, keeps four-digit PIN entry auto-submitting, and replaces the technical wrong-PIN response with `Incorrect PIN. Please try again.` without exposing a request reference to the user.
- The historical production queue was independently verified at zero open records across unserved, assignment-gap, interrupted-service, and payment-review categories. Collect records were recorded as card payments with zero tip; review and unfinished `IN_SERVICE` records were cancelled with reason `ok`.
- The temporary historical bulk endpoint and reconciliation script were removed after the one-time data operation. The GitHub Actions workflow is the authoritative deployment path for this release and runs only after the verified commit is pushed to `main`.
- Local verification completed with `npm run lint`, `npm run typecheck`, the API-response unit test (4 passed), and `npm run test:e2e:d1` (41 passed, 1 intentional skip).

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

`.github/workflows/ci.yml` runs verification for every push and deploys the Worker only after a successful push to `main`. All deployment inputs must be committed and pushed through Git; verify the working tree is clean and the deployed revision matches the intended commit before release. This workspace has no in-tree `.git`; the attached metadata lives at `/private/tmp/wellness-salon-git`, with `origin` configured for `nhan0805/wellness-salon`. Push the verified commit to `main` to trigger CI and the production Worker job. Do not point local E2E at remote D1 and do not print `.env`.

## Environment and safety

Use `.env.example` as the variable inventory and keep actual `.env` values private. Do not print credentials, tokens, or the contents of `.env`. Local E2E uses disposable state and must not be pointed at production D1. Remote migration, secret changes, deploys, scheduler activation, and data recovery require explicit owner approval.

## Open gates

- Physical iPad/WebKit, real-network interruption, Dynamic Type/VoiceOver, and offline behavior.
- D1 interruption/failure-injection and broader concurrency evidence for queue, payment, closing, retention, and session paths.
- Deployed Worker authentication/mutation/SSE/scheduler smoke and Free-tier capacity observation.
- D1 export/restore rehearsal, production secret handling, domain/TLS, scheduler alerting, and final approval.

## Framework note

Read `AGENTS.md` before framework changes. This repository uses the installed Next.js guidance under `node_modules/next/dist/docs/`, but the application is built and verified through the Worker-compatible vinext path.
