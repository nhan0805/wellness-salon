# Wellness Salon MVP — Audit and Implementation Handoff

Date: 2026-10-10  
Repository: `/Users/hanhuynh/Downloads/Wellness Salon`  
Product scope: one-salon, operations-focused nail salon MVP for management, shared staff turn display, and customer self-check-in tablets.

This document records the approved hardening implementation after the read-only audit in [`docs/audits/2026-10-10-nail-salon-mvp-audit.md`](../audits/2026-10-10-nail-salon-mvp-audit.md). It does not claim database-backed or production behavior that could not be executed in this environment.

## 1. Executive summary

The approved reliability, workflow, synchronization, security, tablet-UX, observability, and measured-performance improvements are implemented in the current source tree. The production build, lint, typecheck, Prisma validation/generation, unit suite, DB-gated integration suite, full tablet E2E suite, visual/DOM viewport checks, and request-ID smoke checks pass within the stated environment limits.

The application should still be treated as a supervised pilot until physical iPad/WebKit review, network interruption testing, representative production-scale query/lock measurements, external job scheduling, and the kiosk lookup privacy decision are complete. No production database, deployment, infrastructure, or dependency was changed.

The five highest-risk audit findings were addressed in code:

1. Exact service/staff skip exclusions are now persistent and honored by routing, with manager-only audited override.
2. Account/session validity is rechecked server-side; staff PIN lockout and verified-session revocation are database-backed.
3. Checkout/closing blocks active assignments, and ACCEPT validates attendance and assignment inside the transaction.
4. Board reads are side-effect free; board state has a monotonic version, SSE reconnect/backoff, bounded polling, and visible stale states.
5. Kiosk, staff, payment, and admin mutation paths use stable receipts/request hashes where retry safety matters.

The remaining release gates are deliberately explicit: physical iPad/WebKit and real Wi-Fi review, network interruption/retry testing, production-sized query/lock measurements, external scheduling for retention/closing, and the kiosk lookup privacy decision.

## 2. Overall application health assessment

| Area | Current assessment | Evidence / qualification |
|---|---|---|
| Product concept fit | Good | The implementation remains focused on queue, attendance, skills, services, kiosk, staff board, and admin operations. No payment gateway, staff mobile app, payroll, inventory, loyalty, or multi-tenant expansion was added. |
| Core workflow correctness | Verified on disposable PostgreSQL fixture | Sequential DB integration tests pass: migration/seed 14/14, postgres 2/2, admin access 1/1, critical workflow safety 5/5. |
| Data integrity | Stronger, disposable migration/workflow verification passed | Unique receipts, request hashes, advisory locks, snapshots, audit events, and exclusion constraints are implemented in `prisma/schema.prisma:272-310,402-438`; production-scale/rollback verification remains open. |
| Three-tablet synchronization | Improved, live-network verification pending | Board version/recovery logic is implemented in `src/server/services/prisma-operations.ts:176-182` and `app/(board)/board/page.tsx:103-132`; no multi-device latency test was possible. |
| iPad UX foundation | Good foundation, viewport review passed with hardware limitation | Chromium checks at 810×1080 and 1080×810 found no horizontal overflow; primary interactive controls met 44px. Physical iPad/WebKit remains untested. |
| Security posture | Improved, privacy decision pending | Auth/session, origin, validation, lockout, and public-board redaction paths are implemented; kiosk phone lookup still needs a salon privacy decision. |
| Performance confidence | Measured on a small fixture; production scale unknown | `benchmark:db` records board p50 1.76ms/p95 3.26ms and 2,613-byte payload; this is not a production SLO. |
| QA confidence | Strong fixture confidence, hardware/network limits remain | Static suite 28 pass/8 DB-gated skip without env; DB suite passes sequentially; full tablet E2E is 7/7. |

## 3. Architecture and feature inventory

### 3.1 Technology and boundaries

| Layer | Actual implementation | Completion |
|---|---|---|
| Web/UI | Next.js 16.4 App Router, React 19.2, TypeScript, client components, shared CSS, lucide-react | Implemented |
| API | Next route handlers under `app/api` with server-side role/origin/schema checks | Implemented; protected mutation E2E passes 7/7 on test fixture |
| Domain | Pure appointment state machine and routing logic in `src/domain` | Implemented and unit-tested |
| Persistence | PostgreSQL through Prisma 6.19; additive migrations in `prisma/migrations` | Implemented and applied/seeded on isolated test cluster; production not touched |
| Authentication | Auth.js credentials, ADMIN/STATION roles, JWT session version, verified staff sessions | Implemented; protected admin/station E2E passes |
| Realtime | SSE initial snapshot/keepalive plus version-aware refresh/polling fallback | Implemented; no event broker and no offline-first queue |
| Jobs | Protected closing and retention endpoints; external scheduler remains required | Implemented, scheduler not configured/tested |
| Tests | Vitest unit/integration harness and Playwright Chromium/tablet projects | Implemented; DB-gated tests pass sequentially and tablet project passes 7/7 |

### 3.2 Module inventory

| Module | Screen/feature | Current implementation | Completeness | Relevant files |
|---|---|---|---|---|
| Entry/auth | Landing, sign-in, role routing | Shared tablet access and role routing; misleading static timezone/currency label removed | Implemented | `app/page.tsx`, `src/components/sign-in-panel.tsx:1-72`, `src/server/auth.ts` |
| Management tablet | Admin shell, overview, queue, appointments, payments, reports | Operational sections, dynamic currency/config, cancellation/change/reassign/override actions, queue repair | Implemented; protected E2E pass; portrait nav remains dense | `app/(admin)/admin/page.tsx:40-184,224-346` |
| Management master data | Customers, staff, services, skills, accounts | CRUD/validation plus skip-reason and shop-config management | Implemented; admin CRUD DB/E2E checks pass for exercised paths | `src/components/admin-management.tsx`, `src/components/admin-access.tsx`, `src/components/admin-operations.tsx` |
| Staff tablet | Turn board, attendance, accept/skip/finish/support | Shared board, staff actions, persistent skip reasons/exclusions, support lifecycle | Implemented; protected E2E and critical DB workflow pass | `app/(board)/board/page.tsx:1-280`, `src/server/services/prisma-operations.ts:844-980` |
| Customer kiosk | Service selection, customer lookup, check-in, ticket result | Dynamic open/closed/config, retry state, abortable lookup/catalog, stable check-in intent | Implemented; kiosk E2E and DB idempotency checks pass | `app/(kiosk)/kiosk/page.tsx:35-206`, `app/api/kiosk/check-in/route.ts` |
| Queue/routing | Skill, attendance, availability, fairness/exclusion routing | Required skill intersection, present/active/available filters, fair/stable order, repair command | Implemented; concurrent accept and exclusion workflow DB assertions pass | `src/domain/turn-routing.ts`, `src/server/services/prisma-operations.ts:676-780` |
| Exceptions | Cancel, reassign, service change, skip override | Admin-only, reasoned, audited, idempotent paths | Implemented; cancellation UI E2E and service/cancellation DB assertions pass | `app/api/admin/appointments/*/route.ts`, `src/server/services/prisma-operations.ts:447-621` |
| Operational jobs | Closing and retention | Time-aware close, active-work blocking, protected cleanup | Implemented; scheduler remains an operator/deployment task | `app/api/jobs/closing/route.ts`, `app/api/jobs/retention/route.ts`, `src/server/services/prisma-operations.ts:786-843` |
| Realtime | Cross-tablet board state | Pure reads, monotonic `ShopConfig.stateVersion`, SSE recovery, bounded polling | Implemented; real network interruption simulation pending | `app/api/board/route.ts`, `app/api/sse/board/route.ts`, `app/(board)/board/page.tsx:103-132` |

### 3.3 API surface added or materially changed

The build includes these operational endpoints: `/api/admin/appointments/cancel`, `/reassign`, `/change-service`, `/override-exclusion`, `/api/admin/queue/reconcile`, `/api/admin/skip-reasons`, `/api/admin/config`, and `/api/jobs/retention`. Existing board, kiosk, attendance, payment, reports, services, and SSE routes were hardened. The complete compiled route inventory is recorded by the successful `npm run build` output and can be inspected under `app/api`.

## 4. UI/UX audit and implementation status

### Management tablet

Implemented improvements:

- Dynamic shop currency and operational date defaults are used in dashboard, appointments, payments, reports, service management, and history (`app/(admin)/admin/page.tsx:44-110`, `src/components/admin-management.tsx:170-286`).
- Queue excludes cancelled work and exposes explicit “Repair assignments” manager action (`app/(admin)/admin/page.tsx:119-123,212-225`).
- Appointment actions expose cancellation scope/reason, service-change preview, reassignment, and skip override (`src/components/admin-appointment-actions.tsx:13-92`).
- Shared dialog focus behavior is applied to access, records, payment, and board actions (`src/components/use-dialog-focus.ts:7-53`).

Remaining UX risks: wide history/appointment tables and local-only section navigation. The management dashboard was reviewed at 810×1080 and 1080×810; portrait mode uses a horizontally scrollable module strip and should be validated on physical hardware for discoverability.

### Staff turn display tablet

Implemented improvements:

- Live/reconnecting/polling/stale status is visible in the board header (`app/(board)/board/page.tsx:103-132,219`).
- Refreshes are abortable/order-aware and SSE reconnects with bounded exponential backoff.
- Public board responses redact customer phone/name and skip/exclusion details (`src/server/services/prisma-operations.ts:217-235`).
- Skip reason selection is server-provided and the modal explains permanent exact-service exclusion.

Remaining UX risks: no full network-interruption browser test and no distance/readability review on deployed hardware. Protected actions were exercised in the 7/7 tablet E2E suite.

### Customer self-check-in tablet

Implemented improvements:

- Catalog and customer lookup requests are abortable and retryable; check-in keeps the same idempotency key for the intent (`app/(kiosk)/kiosk/page.tsx:74-99,163-195`).
- Shop open/closed status, opening/closing times, and currency are configuration-driven (`app/(kiosk)/kiosk/page.tsx:40,172-202`).
- Error, empty, loading, validation, success, and reset states are present.

Remaining UX/privacy risks: the visual pass used Chromium viewport emulation rather than physical iPad/WebKit, and the public phone lookup policy still allows a found/name response and needs an explicit salon decision (`src/server/services/prisma-operations.ts:212-215`).

Recommended low-fidelity layouts for the three tablet experiences are in the audit report section 4.2; they are recommendations, not implemented screenshots.

## 5. Business workflow audit

| Workflow | Current implementation | Expected/approved rule | Gap or risk | Evidence |
|---|---|---|---|---|
| Master data CRUD | Services, staff, customers, skills, accounts, skip reasons, and shop config have server routes/UI | Validate names, ranges, relationships, active state, and history | Exercised admin access CRUD passed; not every master-data permutation has an integration test | `app/api/admin`, `src/server/validation.ts:128-181` |
| Check-in and duplicate handling | Explicit service selection; same-day visits are not deduped; same idempotency key replays the receipt; request hash detects changed reuse | Distinct intentional visits; safe repeated submission | PostgreSQL migration/idempotency test passes; high-volume duplicate-tap load remains unmeasured | `src/server/services/prisma-operations.ts:355-386` |
| Assignment/routing | Skill, active, attendance, availability, fair/stable order, and exclusion checks | Never double-assign; skipped exact staff remains excluded; no candidate stays waiting | Critical DB workflow and concurrent accept test pass; real three-tablet load remains unmeasured | `src/server/services/prisma-operations.ts:676-780`, `src/domain/turn-routing.ts` |
| Attendance | ACCEPT validates current attendance/active/assignment; checkout/closing blocks ASSIGNED, IN_SERVICE, PAYMENT_PENDING | Checked-out staff cannot start; assigned staff cannot check out | Critical DB workflow verifies checkout blocking and release | `src/server/services/prisma-operations.ts:786-980` |
| Skip | Skip reason is persisted as relation plus name snapshot; permanent `TurnExclusion`; manager override is reasoned/audited/idempotent | Exact exclusion persists forever for that service/staff | Repeated-skip operational policy beyond permanent exclusion is not a separate rule | `prisma/schema.prisma:259-287`, `src/server/services/prisma-operations.ts:548-570,921-930` |
| Cancellation | Service/whole-visit cancellation with reason/actor/time; active turns are skipped and capacity released/rerouted; payment/completed boundaries reject | CANCELLED only; no NO_SHOW; in-service admin-only with reason; preserve history | Critical DB cancellation/idempotency test and management UI E2E pass | `src/domain/state-machines.ts`, `src/server/services/prisma-operations.ts:447-504` |
| Service change | Manager preview/apply, old/new snapshots, reason/actor audit, skill revalidation, reroute | Completed/paid history immutable; unqualified current technician cannot silently continue | Critical DB snapshot/skill-change test passes; full UI matrix remains limited | `src/server/services/prisma-operations.ts:572-621`, `prisma/schema.prisma:290-310` |
| Support technician | Present/active/available support can be added; no independent support finish; primary finish/cancel releases active support with `releasedAt` while preserving history | Atomic shared finish, no double assignment, no extra visit/payment | Critical DB support-release test passes; real concurrent support taps remain unmeasured | `prisma/schema.prisma:245-257`, `src/server/services/prisma-operations.ts:622-668,940-955` |
| Payment | Existing operational confirmation remains admin-only; cancelled services are excluded from payment items | No gateway/card-data handling | Protected E2E confirms a completed Nail Art visit; independent payment-retry load remains unmeasured | `app/api/admin/payments/confirm/route.ts`, `src/server/services/prisma-operations.ts` |
| Refresh/network interruption | Browser state is cache; board has SSE reconnect/polling/version; kiosk retains idempotency key during form session | Recover without duplicate mutation or stale destructive action | Protected E2E passes; actual offline/refresh/network-drop simulation remains not tested | `app/(board)/board/page.tsx:103-132`, `app/(kiosk)/kiosk/page.tsx:187-195` |
| Daily close/retention | Timezone-aware closing and protected retention route; no internal scheduler | Operator schedules jobs and observes results | DB unit/path coverage exists; external scheduler still not configured or exercised | `app/api/jobs/closing/route.ts`, `app/api/jobs/retention/route.ts` |

Confirmed code behavior and untested runtime behavior are intentionally separated above.

## 6. Missing features and improvement opportunities

### A — Must-have for MVP reliability/release

- Keep the sequential disposable-PostgreSQL verification job in CI; the current migration/seed, idempotency, admin, skip/override, concurrent accept, checkout/support release, cancellation, and service-change fixtures pass.
- Keep the protected mutating Playwright flows in CI; the current tablet project covers kiosk → assignment → accept → finish → payment and admin cancellation.
- Add real network/concurrent load tests for two check-ins, repeated FINISH/SKIP/payment retries, queue repair, and three simultaneous tablets; current DB assertions cover concurrent ACCEPT only.
- Configure external scheduling and alerting for closing and retention jobs.
- Extend the new request-ID/API timing logs with lock waits, sync freshness, command failures, and job-run telemetry before unattended operation.

### B — High-value operational improvement

- Push appointment date/status/search filters and pagination into Prisma instead of broad includes/client filtering (`src/server/services/prisma-operations.ts` appointment history path).
- Add a compact portrait-tablet mode with pinned identity/actions.
- Decide and implement kiosk phone lookup privacy/rate-limit behavior.
- Add a visible mutation conflict/retry status and stable client command lifecycle for admin attendance/action buttons.
- Add representative-volume fixtures and `EXPLAIN ANALYZE` thresholds before changing the same-day advisory-lock design.

### C — Nice-to-have post-MVP

- URL/deep-link state for admin sections and filters.
- Exportable operational reports, ETA/notifications, richer analytics, and historical dashboards after performance baselines exist.

### D — Avoid for now

- Merchant payment gateway/card processing, dedicated staff mobile apps, payroll/commission, inventory, loyalty, full offline-first sync, microservices/event sourcing, and multi-tenant expansion.

## 7. Frontend performance findings

| ID | Classification | Evidence | Impact | Recommendation | Priority / effort | Validation |
|---|---|---|---|---|---|---|
| FE-001 | Implemented | Board refresh uses abort/order/version guards; `app/(board)/board/page.tsx:103-132` | Reduces stale overwrites and overlapping recovery fetches | Keep version checks and add browser network test | P0 / S | Disconnect/reconnect Playwright test |
| FE-002 | Implemented | SSE reconnect/backoff and stale label are present at `app/(board)/board/page.tsx:103-132,219` | Board communicates degraded sync and can recover | Measure recovery time on real tablet Wi-Fi | P0 / S | Network throttling and multi-tab test |
| FE-003 | Confirmed code risk, not measured | Admin refresh requests dashboard data on a timer in `app/(admin)/admin/page.tsx:40-75` | Unnecessary database/payload load during idle operation | Pause hidden tabs and request only active section or add a consolidated read model | P1 / M | 30-minute network trace |
| FE-004 | Confirmed code risk, not measured | Appointment/history views still load broad records and filter some data client-side | Memory/payload/latency grow with history | Add server-side filters, pagination, and query-plan indexes | P1 / M | 1-day/month/year fixture with EXPLAIN |
| FE-005 | Confirmed code risk, not measured | Wide tables require overflow in `app/globals.css` | Slower portrait-tablet interaction | Add compact list/card mode and pin actions | P1 / M | Screenshot/interaction test at supported iPad sizes |
| FE-006 | Implemented and measured on small fixture | Board reads now use `boardAppointmentInclude` with only fields consumed by the board, and the benchmark reports a 2,613-byte private payload | Reduces repeated payload/serialization work across three polling tablets | Keep the lean read model separate from mutation includes; validate with representative queue volume | P1 / S | `npm run benchmark:db`; production-sized fixture still required |

Measured results in this run are test-fixture application timings, not production SLOs: board p50 1.76ms/p95 3.26ms, filtered appointments p50 1.66ms/p95 1.91ms, report-day p95 0.58ms, and report-month p95 0.50ms over 20 iterations plus 2 warmups.

## 8. Backend/database performance findings

| ID | Classification | Evidence | Impact | Recommendation | Priority / effort | Validation |
|---|---|---|---|---|---|---|
| BE-001 | Implemented | Board GET reads are side-effect free at `src/server/services/prisma-operations.ts:217-235`; reconciliation is explicit at `:716-734` | Avoids write contention on every board refresh | Measure lock waits after deployment | P0 / M | `pg_stat_activity`, request p95 |
| BE-002 | Implemented | Check-in/action paths lock shop/business date and use receipts at `src/server/services/prisma-operations.ts:355-366,844-872` | Serializes critical operations safely and makes retries deterministic | Confirm throughput under expected simultaneous tablet taps | P0 / M | PostgreSQL concurrency fixture |
| BE-003 | Implemented | Support active lookup now uses `releasedAt` and composite indexes (`prisma/schema.prisma:245-257`, migration `20261010173000_support_assignment_release`) | Prevents historical support rows from keeping staff busy | Verify query plans after migration | P1 / S | `EXPLAIN ANALYZE` |
| BE-004 | Hypothesis pending measurement | A shop/date advisory lock still serializes same-day mutations | Could become a bottleneck at higher volume | Do not shard/overengineer before measuring; narrow only if needed | P1 / M/L | Concurrent load test and lock-wait metrics |
| BE-005 | Confirmed code risk, not measured | Historical appointment/report paths can return broad included records | Payload and memory grow with range | Push filters/order/pagination to DB | P1 / M | Fixture benchmark |
| BE-006 | Implemented and measured on small fixture | `scripts/benchmark-db.ts` exercises board, filtered appointments, and day/month reports; current test cluster p95 is sub-4ms for board reads | Establishes a repeatable baseline and prevents performance claims without numbers | Add representative 1-day/month/year data and capture `EXPLAIN ANALYZE`, lock waits, and p95 before launch | P1 / S | `npm run benchmark:db` |

## 9. Realtime synchronization and concurrency

The current model is database-as-source-of-truth, SSE as a notification/snapshot channel, and bounded polling as recovery. It is not an event bus and is not full offline-first. `ShopConfig.stateVersion` increments on mutations, while clients reject stale/out-of-order board responses. Reads no longer reconcile assignments.

The following remain not tested: three simultaneous tablets on a real network, event ordering during reconnect, browser tab suspension, offline submission, and cross-process lock contention. These are release-test requirements, not claims of failure.

## 10. Security and code quality

Implemented controls:

- Auth requests revalidate active account/status/session version in `src/server/auth.ts` and account changes increment `AuthUser.sessionVersion`.
- Staff PIN failures use persistent `StaffPinLockout` data; verified sessions support revocation.
- Admin routes use role/origin/schema checks; mutation receipts include request hashes.
- Public board redacts customer identity and exclusion details; shared staff board still exposes staff operational status.
- Prisma constraints/indexes preserve historical snapshots, unique exclusions, unique receipts, and active-support lookup.
- The code remains a modular monolith appropriate for the MVP: App Router UI, route handlers, domain functions, Prisma operations, and one PostgreSQL source of truth.

Remaining security/quality work:

- Decide whether public kiosk lookup may reveal a matching name; this is a product/privacy decision, not an inferred bug.
- Request IDs and API completion timings now exist on the proxy and critical APIs (`proxy.ts`, `src/server/observability.ts`); lock-wait, sync-freshness, failed-command, and job-run telemetry remain deployment follow-up.
- Run a real dependency/security audit when registry access is available; the pre-change audit passed with 0 high-severity findings, while the post-change command could not reach npm due DNS failure.
- Repository has no `.git` directory, so the rollback snapshot is the primary pre-change artifact.

## 11. QA and test coverage gaps

### Executed and passing

| Command/check | Result |
|---|---|
| `npx prisma generate` | PASS; client generated; Prisma 7 package.json configuration deprecation warning |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test -- --run` | PASS: 9 files, 28 passed, 8 DB-gated tests skipped without DB env |
| `npm run test:coverage` | PASS: 13.2% statements/lines, 65.93% branches, 12.87% functions |
| `npx prisma validate` | PASS |
| `npm run build` | PASS after request-ID/lean-board changes; Next.js 16.4.0/Turbopack, all current routes compiled |
| Sequential DB-gated Vitest: `postgres.test.ts` | PASS: 2/2 on isolated PostgreSQL; migration/seed/idempotency |
| Sequential DB-gated Vitest: `admin-access.test.ts` | PASS: 1/1 on isolated PostgreSQL |
| Sequential DB-gated Vitest: `critical-workflows.test.ts` | PASS: 5/5 on isolated PostgreSQL; skip exclusion/override, concurrent accept, checkout/support release, cancellation, service change |
| `npx playwright test --project=tablet --workers=1` with test app on 3100 | PASS: 7/7 from clean seeded test DB; public authorization, kiosk, admin CRUD, protected payment, protected cancellation |
| iPad viewport screenshot/DOM review | PASS with limitation: 810×1080 and 1080×810; no horizontal overflow, primary controls ≥44px; WebKit/physical device unavailable. Details: [`VIEWPORT_QA.md`](VIEWPORT_QA.md) |
| `npm run benchmark:db` | PASS: 20 iterations + 2 warmups; board p50 1.76ms/p95 3.26ms, 2,613-byte payload; report day/month p95 0.58/0.50ms on small fixture |
| Request-ID smoke (`/api/health`, `/api/board`) | PASS: supplied ID echoed; generated ID returned; structured `api.request.completed` log emitted |

### Not run or not verified

- Physical iPad/WebKit review, distance/readability on deployed hardware, and Dynamic Type/largest text-size review were not run.
- Network interruption/reconnect, browser refresh during mutation, three simultaneous tablet load, and offline submission scenarios remain pending.
- Production-scale `EXPLAIN ANALYZE`, p95 latency, lock-wait, bundle-size, and memory measurements remain pending; current benchmark uses a small disposable fixture.
- External scheduling/alerting for `/api/jobs/closing` and `/api/jobs/retention` remains deployment work.
- Migration rollback rehearsal was not run; the additive migrations have no down migration and production rollback requires backup/restore or a reviewed forward migration.
- Post-implementation `npm audit`: registry endpoint failed with `ENOTFOUND`; no dependencies were changed in this batch.

The detailed matrix is in [`TEST_MATRIX.md`](TEST_MATRIX.md).

## 12. Top 10 highest-impact improvements

Scores are 1–5; effort uses `5 = larger effort`; confidence reflects evidence quality.

| # | Recommendation | Status | Business | UX | Reliability | Effort | Confidence | Priority |
|---:|---|---|---:|---:|---:|---:|---:|---|
| 1 | Persist exact service/staff skip exclusion and manager override | Implemented | 5 | 4 | 5 | 3 | 5 | P0 |
| 2 | Revalidate/revoke stale auth sessions and persist PIN lockout | Implemented | 5 | 2 | 5 | 3 | 5 | P0 |
| 3 | Make auto-close, checkout, and ACCEPT attendance-safe | Implemented | 5 | 4 | 5 | 2 | 5 | P0 |
| 4 | Separate reads from reconciliation; add version/stale/reconnect contract | Implemented | 5 | 5 | 5 | 3 | 5 | P0 |
| 5 | Standardize idempotency and request-hash retry behavior | Implemented | 5 | 5 | 5 | 3 | 5 | P0 |
| 6 | Run disposable PostgreSQL concurrency and protected-flow E2E suite | Verified sequentially; scale/network gaps remain | 5 | 3 | 5 | 4 | 5 | P0 release gate |
| 7 | Add request/lock/sync/job observability | Partially implemented: request IDs/API timings shipped; lock/sync/job metrics remain | 4 | 3 | 4 | 3 | 4 | P1 |
| 8 | Add server-side history filtering/pagination and measured indexes | Partially verified: benchmark exists; history pagination remains | 4 | 4 | 4 | 3 | 4 | P1 |
| 9 | Decide and implement kiosk phone-lookup privacy mode | Needs business decision | 4 | 4 | 4 | 3 | 4 | P1 |
| 10 | Complete protected iPad portrait/landscape and accessibility QA | Chromium viewport pass; physical iPad/WebKit pending | 5 | 4 | 4 | 4 | 5 | P1 |

## 13. Quick wins

- Schedule `/api/jobs/retention` externally with the job secret and record successful/failed runs.
- Keep a disposable PostgreSQL service in CI/local development and run the DB-gated files sequentially against one test database (or isolate each worker database).
- Run the manager queue-repair action after migration on a staging fixture and compare waiting/assigned counts.
- Capture representative day/month/year fixtures and rerun `npm run benchmark:db` with `EXPLAIN ANALYZE` before optimizing history/report queries.
- Decide kiosk lookup privacy and document it in the deployment/runbook.

## 14. Prioritized backlog

| ID | Backlog item | Priority | Effort | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| VER-001 | Disposable PostgreSQL migration and critical workflow verification | P0 release gate | L | Test DB/seeds | Verified sequentially: 14 migrations + seed, postgres 2/2, admin 1/1, critical 5/5. Add representative-scale/concurrency coverage before production. |
| VER-002 | Protected three-tablet E2E | P0 release gate | L | VER-001, seeded accounts | Verified 7/7 on Chromium iPad viewport. Add real network interruption/three-device run before production. |
| OBS-001 | Request/lock/sync/job telemetry | P1 | M | Deployment logging destination | Request IDs/API timings are shipped; remaining acceptance is lock waits, sync freshness, failed commands, and job-run alerts. |
| PERF-001 | Server-side appointment/history pagination and profiling | P1 | M | Representative fixture | Board lean read model and benchmark shipped; history pagination + p95/EXPLAIN thresholds remain. |
| UX-001 | Exact iPad portrait/landscape and accessibility pass | P1 | M | Supported hardware list | Chromium viewport pass found no horizontal overflow and ≥44px controls; physical iPad/WebKit, Dynamic Type, and network states remain. |
| PRIV-001 | Kiosk lookup privacy mode | P1 | M | Salon decision | Response and UI expose only approved data and have abuse/rate-limit telemetry. |
| UX-002 | URL/deep-link admin section/filter state | P2 | M | None | Refresh/back/bookmark preserves module and date/filter state. |
| FUT-001 | ETA, exports, notifications, richer analytics | P3 | M/L | Stable operational data | Added only after P0/P1 reliability and performance criteria pass. |

## 15. Recommended implementation roadmap

### Batch 0 — Release preparation (S, operator-led)

Back up the target database, apply the additive migrations only to staging/disposable infrastructure, seed skip reasons/shop config, and schedule the protected jobs. Acceptance: migration/seed logs are clean and rollback/restore is rehearsed.

### Batch 1 — Database and protected workflow verification (L) — Complete with limitations

Applied/seeded all 14 migrations on an isolated PostgreSQL cluster; sequential DB tests and 7/7 protected tablet E2E pass. Remaining acceptance: representative-scale concurrency, offline/reconnect, and physical tablet sign-off.

### Batch 2 — Observability and measured performance (M) — Complete with follow-up

Added request IDs, structured API completion timings, a lean board read model, and `npm run benchmark:db`. Small-fixture results are recorded above; production thresholds, lock waits, and job/sync metrics remain follow-up.

### Batch 3 — Tablet/privacy polish (M) — Partially complete

Reviewed kiosk/board/sign-in/admin at 810×1080 and 1080×810 with screenshot and DOM checks. No horizontal overflow was observed and primary controls met 44px; physical iPad/WebKit, network interruption, and kiosk lookup privacy decision remain.

### Batch 4 — Post-MVP value (P2/P3)

Consider exports, ETA/notifications, and richer analytics only after operations are reliable. Continue to avoid gateways, dedicated staff mobile, payroll, inventory, loyalty, offline-first, and multi-tenant complexity in this MVP.

## 16. Open business questions requiring decision

1. **Kiosk lookup privacy:** May a public kiosk tell a customer that a phone number exists and display the stored name, or should it use masked/last-name confirmation or disable lookup?
2. **Operating hours:** The MVP currently validates opening earlier than closing; are overnight hours required, or is same-day service the intended rule?
3. **Retention policy:** Is the default 90-day operational receipt/session/lockout cleanup acceptable, and where should the scheduled job run?
4. **Production release gate:** Which staging database, real iPad model, and Wi-Fi conditions should be used for final hardware/network sign-off?

The following rules are already recorded as decided in [`DECISIONS.md`](DECISIONS.md): permanent exact-service exclusions, no staff checkout with active work, distinct same-day visits plus idempotent retries, CANCELLED without NO_SHOW, audited service changes, and shared primary/support completion.

## 17. Change and rollback references

- Primary audit: [`docs/audits/2026-10-10-nail-salon-mvp-audit.md`](../audits/2026-10-10-nail-salon-mvp-audit.md)
- Progress and verification: [`PROGRESS.md`](PROGRESS.md)
- Decisions: [`DECISIONS.md`](DECISIONS.md)
- Test matrix: [`TEST_MATRIX.md`](TEST_MATRIX.md)
- Release checklist: [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md)
- Pre-change source snapshot: `/private/tmp/wellness-salon-pre-implementation-20261010.tar.gz`
- New migrations: `prisma/migrations/20261010170000_operational_safety/migration.sql` and `prisma/migrations/20261010173000_support_assignment_release/migration.sql`

The migrations are additive and were not applied here. There is no generated down migration; production rollback should use the approved backup/restore procedure or a forward corrective migration after review.

## Final handoff

The requested Batches 1–4 verification work is complete within the documented limits. The next approval should choose one follow-up: representative-scale performance/load testing, physical iPad/WebKit/network QA, or the kiosk lookup privacy decision and implementation.
