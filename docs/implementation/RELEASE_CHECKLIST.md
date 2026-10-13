# Release checklist

This checklist distinguishes implementation evidence from release verification that still requires D1 failure/remote evidence and a real tablet review. The Worker + D1 E2E gate is the active database-backed test path; PostgreSQL is compatibility/rollback only.

## Implementation evidence

- [x] Additive Prisma migrations were created for lifecycle, audit, idempotency, configuration, lockout, exclusion, and support-release fields/indexes.
- [x] Seed data includes active default skip reasons and default shop opening time.
- [x] Account status/role changes increment session material version and revoke verified staff sessions.
- [x] Kiosk lookup/check-in and public board responses were reviewed for unnecessary customer data exposure; public board customer identity/skip details are redacted.
- [x] Kiosk privacy decision recorded as option A: a matching phone may show the stored full name for guest confirmation; lookup response is limited, marked `no-store`, and covered by returning-guest E2E.
- [x] Mutation endpoints use origin checks, role checks, schema validation, and idempotency for operations that can be retried.
- [x] No production database reset, custom domain, or Docker infrastructure change was made; the first workers.dev Worker deployment is recorded in the Cloudflare deployment guide.
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

- [x] Apply and review the active D1 migrations/bootstrap on disposable local state — two migrations and 101 bootstrap statements applied successfully.
- [x] Run the canonical Worker/D1 E2E gate — `npm run test:e2e:d1` passed 25/26 cases with one intentional desktop-project skip.
- [ ] Verify existing appointment, turn, attendance, payment, and customer history against a representative backup or fixture — a representative 20,000-appointment read fixture is measured, but it is not a production backup and does not cover every operational entity.
- [x] Run authenticated protected mutating Worker/D1 Playwright workflows with disposable bootstrap admin/station accounts — included in the canonical gate.
- [x] Historical authenticated HTTP load profiles — standard 3 role flows × 10 cycles and pool-constrained 3 role flows × 50 cycles completed with zero errors; retained as legacy compatibility evidence only.
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
- [x] `npm test -- --run` — 51 passed, no database skips
- [x] `npm run test:coverage` — 14.21% statements/lines, 69.29% branches, 22.95% functions; broad report, not a release threshold
- [x] `npx prisma validate`
- [x] `npm run build`
- [x] Full Worker/D1 tablet E2E — included in the canonical 25/26 gate
- [x] Browser resilience E2E — included in the canonical Worker/D1 gate; physical/offline network remains
- [x] Kiosk returning-guest E2E — included in the canonical Worker/D1 gate; approved full-name behavior is read-only
- [x] Disposable D1 migrations/bootstrap and Worker E2E — 25 passed, 1 intentional project-specific skip
- [x] Historical PostgreSQL migrations and DB checks — retained as legacy compatibility evidence, not an active release gate
- [x] Disposable service-layer read/write load profile — 120 operations, zero errors; lock-wait telemetry captured
- [x] Chromium portrait/landscape screenshot + DOM review — pass with physical-device limitation
