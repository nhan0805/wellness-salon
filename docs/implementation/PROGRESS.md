# Implementation progress

Last updated: 2026-10-14

## Active target

Cloudflare Worker + D1 (SQLite) is the only runtime and database-backed test target. Local E2E state is disposable. The Worker is deployed at `https://wellness.n8l.workers.dev`; read-only smoke passed, while authenticated remote behavior, failure-injection, capacity, and final production approval remain open.

## Delivered

- Kiosk check-in, public board, station/admin authentication, staff verification, attendance, routing, payments, reports, customer/staff/service/account management, appointment history, and retention/closing jobs.
- D1 schema and migrations under `prisma/d1/`, generated `@prisma/d1-client`, Worker query-compiler WASM loading, and `DB` binding validation.
- D1 guarded batches, leases, command receipts, request-hash conflict checks, audit events, session-version revalidation, and database-backed lockouts.
- Worker-compatible PBKDF2 credential verification and HS256 sessions.
- Repeatable local bootstrap and Worker E2E harness through `scripts/seed-d1-bootstrap.ts` and `scripts/run-d1-e2e.mjs`.
- Tablet/PWA layout, SSE reconnect, bounded polling, public redaction, service categories/icons, multi-skill routing, payment history, and audited corrections/refunds.

## Verification evidence

| Check | Result |
| --- | --- |
| `npm run lint` | PASS in the recorded local gate |
| `npm run typecheck` | PASS on 2026-10-14 after D1 client generation |
| `npm test -- --run` | 51/51 PASS, no database skips |
| `npm run build:vinext` | PASS in the recorded Worker gate |
| `npm run test:e2e:d1` | 25/26 PASS; one intentional desktop-project skip |
| Local D1 migrations/bootstrap | PASS; two migrations and 101 bootstrap statements |
| Local Worker route/command smoke | PASS for health, auth, kiosk, board, admin, payments, closing, retention, and resilience scope |
| `npx cf deploy --dry-run` | PASS in the recorded deployment gate |
| Remote workers.dev read-only smoke | PASS for health, catalog, board, and kiosk |

## Open gates

- D1 crash/interruption and broader concurrent mutation assertions.
- Deployed Worker auth/mutation/SSE/scheduler smoke and Free-tier CPU/latency observation.
- Physical iPad/WebKit, real Wi-Fi interruption, offline submission, Dynamic Type, and VoiceOver review.
- D1 export/restore rehearsal, scheduler alerting, production secrets/domain/TLS, and owner approval.

## Operating rule

Keep local checks on `wrangler.local.jsonc` and disposable D1 state. Do not mutate remote D1 from local tests, print `.env`, or introduce a second database runtime without an explicit architecture decision.
