# Implementation final report

Last updated: 2026-10-19

## Decision

Cloudflare Worker + D1 (SQLite) is the only supported runtime. Local development and database-backed verification use disposable local D1. The Worker is deployed at `https://wellness.n8l.workers.dev`; public and authenticated read-only production smoke passed, but full unattended production approval remains open.

## Delivered

- Worker-compatible vinext build, fetch/scheduled entrypoint, assets, `DB` binding, and D1 query-compiler WASM loading.
- Sole D1 schema/migration source under `prisma/d1/`, generated `@prisma/d1-client`, and repeatable 101-statement bootstrap.
- Web Crypto PBKDF2 credentials, HS256 sessions, session-version revalidation, verified staff sessions, and D1-backed lockouts.
- D1 batch/guard/lease/receipt orchestration for kiosk check-in, routing, staff actions, payments, appointment changes, reconciliation, closing, retention, and admin management.
- Kiosk, public board, staff attendance/actions, admin queue, customers, staff, services/categories/icons/skills, accounts, payments, reports, appointment history, SSE/polling recovery, and tablet/PWA UI.
- Audit-backed idempotency, payment correction/refund records, public data redaction, and Worker cron timezone handling.
- Admin loading resilience with bounded client deadlines, cancellation/stale-response guards, a section-aware Dashboard snapshot, narrow live projections, direct D1 Attendance reads, response timing diagnostics, and an Attendance Worker/D1 E2E smoke.
- Request-safe Worker/D1 lifecycle: no module-global Prisma client/binding/Promise queue, default Cloudflare cross-request handling, and an E2E guard for runtime cancellation/cross-request I/O errors.

## Evidence

| Check | Result |
| --- | --- |
| `npm run lint` | PASS in the recorded local gate |
| `npm run typecheck` | PASS on 2026-10-15 after D1 client generation |
| `npm test` | 54/54 PASS |
| `npm run build:vinext` | PASS in the recorded Worker gate |
| `npm run test:e2e:d1` | 41 passed; one intentional skip |
| `npm run test:e2e:d1:webkit` | 61 passed; two intentional skips across Chromium, tablet, and WebKit |
| `npm run smoke:remote` | 19/19 public and authenticated read-only checks passed |
| `npm run d1:recovery:rehearsal` | PASS; representative counts matched after local export/restore |
| Local D1 migrations/bootstrap | PASS; two migrations and 101 bootstrap statements |
| Local Worker/D1 smoke | PASS for public routes, auth, kiosk, board, admin, payments, jobs, and resilience scope |
| `npx cf deploy --dry-run` | PASS in the recorded deployment gate |
| Remote workers.dev smoke | PASS for read-only health, catalog, board, and kiosk |

## Known limitations

- D1 statements are not a rollback transaction boundary. Failure-injection and broader concurrent mutation evidence are still required.
- Remote business mutation, scheduler-event, CPU/latency, and Free-tier capacity evidence is incomplete; the deployed read-only SSE initial snapshot passes.
- Physical iPad, real Wi-Fi interruption, offline submission, Dynamic Type, VoiceOver, and full modal interaction review remain open; WebKit emulation passes.
- Disposable D1 export/restore rehearsal and required Worker secret presence pass. Protected remote export/restore, scheduler alerting, production domain/TLS, and owner approval remain open.

## Next actions

1. Run the D1 failure-injection/concurrency and money-review matrix.
2. Run approved authenticated remote Worker/D1 auth, mutation, SSE, and scheduler checks.
3. Measure deployed Worker/D1 capacity and complete the physical tablet run sheet.
4. Complete D1 backup/restore, secret/domain/scheduler review, then request production approval.

Local checks must remain disposable and must not mutate remote D1 or print `.env`.
