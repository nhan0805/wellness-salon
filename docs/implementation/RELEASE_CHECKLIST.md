# Release checklist

This checklist distinguishes implementation evidence from release verification that still requires a disposable migrated database and a real tablet review.

## Implementation evidence

- [x] Additive Prisma migrations were created for lifecycle, audit, idempotency, configuration, lockout, exclusion, and support-release fields/indexes.
- [x] Seed data includes active default skip reasons and default shop opening time.
- [x] Account status/role changes increment session material version and revoke verified staff sessions.
- [x] Kiosk lookup/check-in and public board responses were reviewed for unnecessary customer data exposure; public board customer identity/skip details are redacted.
- [x] Kiosk privacy decision recorded as option A: a matching phone may show the stored full name for guest confirmation; lookup response is limited, marked `no-store`, and covered by returning-guest E2E.
- [x] Mutation endpoints use origin checks, role checks, schema validation, and idempotency for operations that can be retried.
- [x] No production database, deployment, or infrastructure was changed during implementation.
- [x] Closing job respects configured timezone/closing time and blocks staff with active operational work.
- [x] Retention cleanup is documented and exposed as an admin/cron-protected job; scheduler configuration remains an operator responsibility.
- [x] Queue reconciliation is an explicit manager action rather than a side effect of board reads.
- [x] Request IDs, structured API completion timings, mutation receipts, board version signals, and audit events are available in the implemented paths.
- [x] Critical-path telemetry records rejected mutating commands, advisory-lock waits ≥10ms, board snapshot version/time, and closing/retention job outcomes; Admin/API operational routes now use the shared request wrapper, while deployment dashboards/alerts remain open.
- [x] Admin appointment history uses server-side filters, bounded 25-row pagination, period summaries, deterministic ordering, and a lean response projection; the disposable fixture measured 34,360 bytes/p95 6.34ms for the page path.
- [x] Service categories are restored as ordered/archivable catalog data with migration backfill, Admin CRUD/filtering, and grouped kiosk presentation; active services block category archive.
- [x] Appointment turn history is append-only and stores actor/assigned-staff snapshots, reasons, and event times.
- [x] Payment history, amount/method/tip adjustment, bookkeeping correction, and full/partial refund commands are admin-only, validated, retry-safe, and audit-backed; refund execution remains external to the app.

## Release verification still required

- [x] Apply and review migrations on a disposable PostgreSQL database — 14 migrations and seed passed on isolated native PostgreSQL.
- [x] Run the current BR-01 through BR-06 database-backed integration tests — postgres 3/3, admin access 1/1, critical workflows 5/5 when run sequentially.
- [ ] Verify existing appointment, turn, attendance, payment, and customer history against a representative backup or fixture — a representative 20,000-appointment read fixture is measured, but it is not a production backup and does not cover every operational entity.
- [x] Run authenticated protected mutating Playwright workflows with seeded admin/station accounts — tablet project 7/7 on a clean test DB.
- [x] Run authenticated HTTP load profiles — standard 3 role flows × 10 cycles (70 operations) and pool-constrained 3 role flows × 50 cycles (350 operations), both zero errors; local disposable DB/app only.
- [x] Verify service changes, cancellation, payment completion, and support release through the current DB/UI matrix; queue reconciliation/closing/retention still need broader fixture coverage.
- [x] Verify management tablet in Chromium portrait and landscape viewport emulation — no horizontal overflow observed; physical iPad remains.
- [ ] Verify staff turn display readability from a distance and touch interaction on deployed hardware.
- [ ] Verify kiosk keyboard, refresh, interrupted submission, duplicate tap, and reset behavior — same-key duplicate submission is covered by `tests/e2e/resilience.spec.ts`; physical keyboard/refresh/offline cases remain.
- [ ] Verify modal focus, Escape, focus restore, disabled states, loading/empty/error states, and stale sync messaging.
- [x] Run read-only DB benchmarks and disposable concurrent read/write/profile checks — seed and 20,000-appointment fixtures measured; 3 clients × 10 cycles completed with zero errors and seven advisory-lock waits ≥10ms (maximum 56.87ms); authenticated HTTP and local pool-constrained profiles completed. Staging/deployed pool/network SLOs remain.
- [ ] Configure and test an external schedule for `/api/jobs/retention` using the job secret — DEFERRED by product decision; no scheduler/alerting changes made in this batch.
- [ ] Re-run `npm audit --omit=dev --omit=optional --audit-level=high` when registry access is available; the pre-change baseline passed with 0 high-severity vulnerabilities.
- [ ] Run dedicated disposable DB/E2E checks for category lifecycle, turn-history rendering, and payment adjustment/correction/refund semantics before closing the follow-up release gate.

## Passing local gates

- [x] `npx prisma generate`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test -- --run` — 31 passed, 9 DB-gated tests skipped without DB env
- [x] `npm run test:coverage` — 24.88% statements/lines, 68.75% branches, 11.39% functions
- [x] `npx prisma validate`
- [x] `npm run build`
- [x] Full tablet E2E — 7/7 on isolated app/test DB
- [x] Browser resilience E2E — 3/3 on isolated app/test DB, including deterministic board-network interruption/Retry recovery; physical/offline network remains
- [x] Kiosk returning-guest E2E — 2/2; approved full-name behavior is read-only
- [x] Disposable PostgreSQL migrations and DB-gated tests — sequential pass
- [x] Disposable service-layer read/write load profile — 120 operations, zero errors; lock-wait telemetry captured
- [x] Chromium portrait/landscape screenshot + DOM review — pass with physical-device limitation
