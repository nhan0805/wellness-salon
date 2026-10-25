# Implementation progress

Last updated: 2026-10-25

## Active target

Cloudflare Worker + D1 (SQLite) is the only runtime and database-backed test target. Local E2E state is disposable. The Worker is deployed at `https://wellness.n8l.workers.dev`; public and authenticated read-only smoke passed, while business-mutation evidence, failure-injection, live capacity observation, physical-device review, and final production approval remain open.

## Delivered

- Kiosk check-in, public board, station/admin authentication, staff verification, attendance, routing, payments, reports, customer/staff/service/account management, appointment history, and retention/closing jobs.
- D1 schema and migrations under `prisma/d1/`, generated `@prisma/d1-client`, Worker query-compiler WASM loading, and `DB` binding validation.
- D1 guarded batches, leases, command receipts, request-hash conflict checks, audit events, session-version revalidation, and database-backed lockouts.
- Worker-compatible PBKDF2 credential verification and HS256 sessions.
- Repeatable local bootstrap and Worker E2E harness through `scripts/seed-d1-bootstrap.ts` and `scripts/run-d1-e2e.mjs`.
- Tablet/PWA layout, SSE reconnect, bounded polling, public redaction, service categories/icons, multi-skill routing, payment history, and audited corrections/refunds.
- Admin loading resilience: 10/15-second client deadlines, superseded-request cancellation, stale-response protection, a section-aware Dashboard snapshot, narrow live projections, direct D1 Attendance reads, and response timing diagnostics.
- Worker/D1 lifecycle hardening: Prisma clients and D1 bindings are request-scoped, the cross-request Prisma Promise queue and compatibility workaround are removed, and the E2E harness rejects runtime cancellation/cross-request I/O signatures.
- Operational follow-up: the remote read-only smoke, disposable D1 export/restore rehearsal, six-hour public smoke workflow, and optional WebKit/iPad E2E project are now repeatable.
- 2026-10-25 UI/CPU follow-up: Staff availability expansion, contained historical review scrolling, 320/360/390px queue actions, Admin/Board Kiosk entry points, and staff-form semantics/persistence are covered by the local gate. Board bootstrap/projection and Admin Appointments report work were reduced without changing business rules.

## Verification evidence

| Check | Result |
| --- | --- |
| `npm run lint` | PASS in the recorded local gate |
| `npm run typecheck` | PASS on 2026-10-25 after D1 client generation |
| `npm test` | 67/67 PASS |
| `npm run build:vinext` | PASS on 2026-10-25 |
| `npm run test:e2e:d1` | 47 passed; one intentional skip |
| `npm run test:e2e:d1:webkit` | 61 passed; two intentional skips across Chromium, tablet, and WebKit projects |
| `npm run smoke:remote` | 19/19 public and authenticated read-only checks passed |
| `npm run d1:recovery:rehearsal` | PASS; representative table counts matched after export/restore |
| Local D1 migrations/bootstrap | PASS; five migrations and 101 bootstrap statements |
| Local Worker route/command smoke | PASS for health, auth, kiosk, board, admin, payments, closing, retention, and resilience scope |
| `npx cf deploy --dry-run` | PASS in the recorded deployment gate |
| Remote workers.dev read-only smoke | PASS for health, catalog, board, and kiosk |

## Open gates

- D1 crash/interruption and broader concurrent mutation assertions.
- Approved deployed Worker mutation/scheduler smoke and Free-tier CPU/latency observation.
- Physical iPad, real Wi-Fi interruption, offline submission, Dynamic Type, and VoiceOver review. WebKit emulation now passes locally.
- Protected remote export/restore, scheduler alerting, domain/TLS, and owner approval.

## Operating rule

Keep local checks on `wrangler.local.jsonc` and disposable D1 state. Do not mutate remote D1 from local tests, print `.env`, or introduce a second database runtime without an explicit architecture decision.
