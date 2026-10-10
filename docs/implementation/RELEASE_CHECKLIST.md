# Release checklist

This checklist distinguishes implementation evidence from release verification that still requires a disposable migrated database and a real tablet review.

## Implementation evidence

- [x] Additive Prisma migrations were created for lifecycle, audit, idempotency, configuration, lockout, exclusion, and support-release fields/indexes.
- [x] Seed data includes active default skip reasons and default shop opening time.
- [x] Account status/role changes increment session material version and revoke verified staff sessions.
- [x] Kiosk lookup/check-in and public board responses were reviewed for unnecessary customer data exposure; public board customer identity/skip details are redacted.
- [x] Mutation endpoints use origin checks, role checks, schema validation, and idempotency for operations that can be retried.
- [x] No production database, deployment, or infrastructure was changed during implementation.
- [x] Closing job respects configured timezone/closing time and blocks staff with active operational work.
- [x] Retention cleanup is documented and exposed as an admin/cron-protected job; scheduler configuration remains an operator responsibility.
- [x] Queue reconciliation is an explicit manager action rather than a side effect of board reads.
- [x] Request IDs, structured API completion timings, mutation receipts, board version signals, and audit events are available in the implemented paths.

## Release verification still required

- [x] Apply and review migrations on a disposable PostgreSQL database — 14 migrations and seed passed on isolated native PostgreSQL.
- [x] Run the current BR-01 through BR-06 database-backed integration tests — postgres 2/2, admin access 1/1, critical workflows 5/5 when run sequentially.
- [ ] Verify existing appointment, turn, attendance, payment, and customer history against a representative backup or fixture.
- [x] Run authenticated protected mutating Playwright workflows with seeded admin/station accounts — tablet project 7/7 on a clean test DB.
- [x] Verify service changes, cancellation, payment completion, and support release through the current DB/UI matrix; queue reconciliation/closing/retention still need broader fixture coverage.
- [x] Verify management tablet in Chromium portrait and landscape viewport emulation — no horizontal overflow observed; physical iPad remains.
- [ ] Verify staff turn display readability from a distance and touch interaction on deployed hardware.
- [ ] Verify kiosk keyboard, refresh, interrupted submission, duplicate tap, and reset behavior.
- [ ] Verify modal focus, Escape, focus restore, disabled states, loading/empty/error states, and stale sync messaging.
- [x] Run a small read-only DB benchmark and capture request-ID/API timing smoke; representative production-scale p95/lock waits remain.
- [ ] Configure and test an external schedule for `/api/jobs/retention` using the job secret.
- [ ] Re-run `npm audit --omit=dev --omit=optional --audit-level=high` when registry access is available; the pre-change baseline passed with 0 high-severity vulnerabilities.

## Passing local gates

- [x] `npx prisma generate`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test -- --run` — 28 passed, 8 DB-gated tests skipped without DB env
- [x] `npm run test:coverage` — 13.2% statements/lines, 65.93% branches, 12.87% functions
- [x] `npx prisma validate`
- [x] `npm run build`
- [x] Full tablet E2E — 7/7 on isolated app/test DB
- [x] Disposable PostgreSQL migrations and DB-gated tests — sequential pass
- [x] Chromium portrait/landscape screenshot + DOM review — pass with physical-device limitation
