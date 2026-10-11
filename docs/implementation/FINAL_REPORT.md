# Wellness Salon MVP — Audit and Implementation Handoff

Date: 2026-10-10  
Repository: `/Users/hanhuynh/Downloads/Wellness Salon`  
Product scope: one-salon, operations-focused nail salon MVP for management, shared staff turn display, and customer self-check-in tablets.

This document records the approved hardening implementation after the read-only audit in [`docs/audits/2026-10-10-nail-salon-mvp-audit.md`](../audits/2026-10-10-nail-salon-mvp-audit.md). It does not claim database-backed or production behavior that could not be executed in this environment.

## Current-tree follow-up — 2026-10-11

The current workspace also contains a follow-up catalog and traceability batch layered on top of the 2026-10-10 hardening evidence:

- Service categories are restored as a normalized, ordered, archivable `ServiceCategory` model with migration backfill, Admin CRUD/filtering, and grouped kiosk presentation. The earlier category-removal migration remains historical and is superseded by the explicit restore migrations.
- Services now support searchable icon selection; static timezone/currency option data keeps Admin configuration deterministic across server and browser renders.
- `TurnEvent` records append-only assignment, accept/skip/finish, cancellation, reassignment, continuation, and support lifecycle events with actor/staff snapshots. Admin can read appointment turn history.
- Admin can read payment history and record amount/method/tip adjustments, bookkeeping corrections, and full/partial refunds through validated, idempotent, audit-backed commands. Refunds record an external terminal action; no gateway or card data is processed.
- The appointments UI uses a compact action menu for these operations and does not widen the table.

Follow-up static gates on 2026-10-11 passed: Prisma generate/validate, lint, typecheck, 31 default tests with 9 DB-gated skips, coverage (24.88% statements/lines, 68.75% branches, 11.39% functions), and production build. The follow-up paths have not yet received dedicated disposable DB/E2E coverage, so the hardening evidence below should not be read as coverage of those new flows.

## 1. Executive summary

The approved reliability, workflow, synchronization, security, tablet-UX, observability, and measured-performance improvements are implemented in the current source tree. The production build, lint, typecheck, Prisma validation/generation, unit suite, DB-gated integration suite, protected tablet E2E set, visual/DOM viewport checks, and request-ID smoke checks pass within the stated environment limits.

The application should still be treated as a supervised pilot until physical iPad/WebKit and real Wi-Fi review and production/staging pool/lock/SLO measurements are complete. Kiosk privacy option A is now approved and tested. Scheduler/alerting is explicitly deferred by product decision. Browser-level transient network recovery, critical-path telemetry, and representative-volume read/write measurements are now verified locally, but they are not a substitute for deployed hardware or production traffic. No production database, deployment, infrastructure, or dependency was changed.

The five highest-risk audit findings were addressed in code:

1. Exact service/staff skip exclusions are now persistent and honored by routing, with manager-only audited override.
2. Account/session validity is rechecked server-side; staff PIN lockout and verified-session revocation are database-backed.
3. Checkout/closing blocks active assignments, and ACCEPT validates attendance and assignment inside the transaction.
4. Board reads are side-effect free; board state has a monotonic version, SSE reconnect/backoff, bounded polling, and visible stale states.
5. Kiosk, staff, payment, and admin mutation paths use stable receipts/request hashes where retry safety matters.

The remaining release gates are deliberately explicit: physical iPad/WebKit and real Wi-Fi review and production lock-wait/pool/SLO measurements. External scheduling for retention/closing is deferred by decision, and the kiosk lookup privacy decision is closed as option A. Browser SSE recovery, board-network retry emulation, same-key retry behavior, representative-volume read timing, bounded history pagination, critical-path telemetry, disposable read/write measurement, and authenticated local HTTP load—including a constrained local pool run—are now evidenced below.

## 2. Overall application health assessment

| Area | Current assessment | Evidence / qualification |
|---|---|---|
| Product concept fit | Good | The implementation remains focused on queue, attendance, skills, services, kiosk, staff board, and admin operations. No payment gateway, staff mobile app, payroll, inventory, loyalty, or multi-tenant expansion was added. |
| Core workflow correctness | Verified on disposable PostgreSQL fixture | Sequential DB integration tests pass: migration/seed 14/14, postgres 3/3, admin access 1/1, critical workflow safety 5/5. |
| Data integrity | Stronger, disposable migration/workflow verification passed | Unique receipts, request hashes, advisory locks, snapshots, audit events, and exclusion constraints are implemented in `prisma/schema.prisma:272-310,402-438`; production-scale/rollback verification remains open. |
| Three-tablet synchronization | Improved, browser recovery verified; live-network verification pending | Board version/recovery logic is implemented in `src/server/services/prisma-operations.ts:176-182` and `app/(board)/board/page.tsx:103-132`; one SSE disconnect recovered in Playwright and 30 bounded HTTP board requests from three concurrent clients returned 200. Physical devices/live Wi-Fi were not tested. |
| iPad UX foundation | Good foundation, viewport review passed with hardware limitation | Chromium checks at 810×1080 and 1080×810 found no horizontal overflow; primary interactive controls met 44px. Physical iPad/WebKit remains untested. |
| Security posture | Improved, kiosk privacy option A approved with deployment limitation | Auth/session, origin, validation, lockout, public-board redaction, no-store lookup responses, and approved full-name kiosk behavior are implemented; rate limiting/abuse monitoring remains a deployment/operator control. |
| Performance confidence | Representative read, disposable concurrent read/write, authenticated-local HTTP, and local pool-constrained profiles completed; production SLO/lock/pool confidence remains open | On a 20,000-appointment disposable fixture, the new 25-row history page was 34.36KB/p95 6.34ms versus the legacy full read at 1.515MB/p95 104.48ms. The standard authenticated HTTP profile had zero errors; admin appointment p95 was 36.26ms, board p95 30.20ms, and check-in p95 45.83ms, with a maximum observed 13 database connections/3 active. A second 350-operation run with Prisma `connection_limit=3` also had zero errors; check-in p95/p99 was 45.44/50.12ms and the activity sample observed 6 total/2 active connections. These are local disposable measurements, not production SLOs. |
| QA confidence | Strong fixture and browser-resilience confidence; hardware/live-network limits remain | Static suite 31 pass/9 DB-gated skip without env; DB suite passes sequentially; protected tablet E2E is 7/7; kiosk returning-guest E2E is 2/2; resilience E2E is 3/3, including deterministic network interruption/retry emulation. |

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
| Realtime | Cross-tablet board state | Pure reads, monotonic `ShopConfig.stateVersion`, SSE recovery, bounded polling | Implemented; browser transient disconnect recovered; real Wi-Fi/offline behavior pending | `app/api/board/route.ts`, `app/api/sse/board/route.ts`, `app/(board)/board/page.tsx:103-132`, `tests/e2e/resilience.spec.ts` |

### 3.3 API surface added or materially changed

The build includes these operational endpoints: `/api/admin/appointments/cancel`, `/reassign`, `/change-service`, `/override-exclusion`, `/api/admin/appointments/[id]/turn-history`, `/api/admin/queue/reconcile`, `/api/admin/skip-reasons`, `/api/admin/config`, `/api/admin/service-categories`, `/api/admin/customers/[id]/history`, `/api/admin/payments/[appointmentId]/history`, `/api/admin/payments/adjust`, `/correct`, `/refund`, and `/api/jobs/retention`. Existing board, kiosk, attendance, payment, reports, services, and SSE routes were hardened. The complete compiled route inventory is recorded by the successful `npm run build` output and can be inspected under `app/api`.

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

Remaining UX risks: no distance/readability review on deployed hardware, Dynamic Type/VoiceOver review, or real Wi-Fi recovery test. A browser SSE interruption and recovery path is now covered in `tests/e2e/resilience.spec.ts`; protected actions were exercised in the 7/7 tablet E2E suite.

### Customer self-check-in tablet

Implemented improvements:

- Catalog and customer lookup requests are abortable and retryable; check-in keeps the same idempotency key for the intent (`app/(kiosk)/kiosk/page.tsx:74-99,163-195`).
- Shop open/closed status, opening/closing times, and currency are configuration-driven (`app/(kiosk)/kiosk/page.tsx:40,172-202`).
- Error, empty, loading, validation, success, and reset states are present.

Remaining UX/privacy risks: the visual pass used Chromium viewport emulation rather than physical iPad/WebKit. Under the approved option A, the public phone lookup may return the stored full name read-only; the response is limited and marked `no-store` (`src/server/services/prisma-operations.ts:212-215`, `app/api/kiosk/customer-lookup/route.ts`). The same-key duplicate submission path is now verified in browser/API E2E, but physical keyboard/refresh/interrupted-submit behavior remains open.

Recommended low-fidelity layouts for the three tablet experiences are in the audit report section 4.2; they are recommendations, not implemented screenshots.

## 5. Business workflow audit

| Workflow | Current implementation | Expected/approved rule | Gap or risk | Evidence |
|---|---|---|---|---|
| Master data CRUD | Services, staff, customers, skills, accounts, skip reasons, and shop config have server routes/UI | Validate names, ranges, relationships, active state, and history | Exercised admin access CRUD passed; not every master-data permutation has an integration test | `app/api/admin`, `src/server/validation.ts:128-181` |
| Check-in and duplicate handling | Explicit service selection; same-day visits are not deduped; same idempotency key replays the receipt; request hash detects changed reuse | Distinct intentional visits; safe repeated submission | PostgreSQL migration/idempotency test passes; high-volume duplicate-tap load remains unmeasured | `src/server/services/prisma-operations.ts:355-386` |
| Assignment/routing | Skill, active, attendance, availability, fair/stable order, and exclusion checks | Never double-assign; skipped exact staff remains excluded; no candidate stays waiting | Critical DB workflow and concurrent accept test pass; real three-tablet load remains unmeasured | `src/server/services/prisma-operations.ts:676-780`, `src/domain/turn-routing.ts` |
| Attendance | ACCEPT validates current attendance/active/assignment; checkout/closing blocks ASSIGNED, IN_SERVICE, PAYMENT_PENDING | Checked-out staff cannot accept/enter service; assigned staff cannot check out | Critical DB workflow verifies checkout blocking and release | `src/server/services/prisma-operations.ts:786-980` |
| Skip | Skip reason is persisted as relation plus name snapshot; permanent `TurnExclusion`; manager override is reasoned/audited/idempotent | Exact exclusion persists forever for that service/staff | Repeated-skip operational policy beyond permanent exclusion is not a separate rule | `prisma/schema.prisma:259-287`, `src/server/services/prisma-operations.ts:548-570,921-930` |
| Cancellation | Service/whole-visit cancellation with reason/actor/time; active turns are skipped and capacity released/rerouted; payment/completed boundaries reject | CANCELLED only; no NO_SHOW; in-service admin-only with reason; preserve history | Critical DB cancellation/idempotency test and management UI E2E pass | `src/domain/state-machines.ts`, `src/server/services/prisma-operations.ts:447-504` |
| Service change | Manager preview/apply, old/new snapshots, reason/actor audit, skill revalidation, reroute | Completed/paid history immutable; unqualified current technician cannot silently continue | Critical DB snapshot/skill-change test passes; full UI matrix remains limited | `src/server/services/prisma-operations.ts:572-621`, `prisma/schema.prisma:290-310` |
| Support technician | Present/active/available support can be added; no independent support finish; primary finish/cancel releases active support with `releasedAt` while preserving history | Atomic shared finish, no double assignment, no extra visit/payment | Critical DB support-release test passes; real concurrent support taps remain unmeasured | `prisma/schema.prisma:245-257`, `src/server/services/prisma-operations.ts:622-668,940-955` |
| Payment | Admin-only confirmation plus audited adjustment/correction/refund records; cancelled services are excluded from payment items | No gateway/card-data handling; refunds document an external terminal action | Protected E2E confirms a completed Nail Art visit; dedicated adjustment/refund DB/E2E coverage remains open | `app/api/admin/payments/{confirm,adjust,correct,refund}/route.ts`, `app/api/admin/payments/[appointmentId]/history/route.ts`, `src/server/services/prisma-operations.ts` |
| Refresh/network interruption | Browser state is cache; board has SSE reconnect/polling/version; kiosk retains idempotency key during form session | Recover without duplicate mutation or stale destructive action | Browser SSE abort/reconnect, deterministic board snapshot network failure/retry, and same-key concurrent kiosk submissions pass; physical offline, refresh-during-mutation, and live Wi-Fi behavior remain untested | `app/(board)/board/page.tsx:103-132`, `app/(kiosk)/kiosk/page.tsx:187-195`, `tests/e2e/resilience.spec.ts` |
| Daily close/retention | Timezone-aware closing and protected retention route; no internal scheduler | Operator schedules jobs and observes results | DB unit/path coverage exists; external scheduler still not configured or exercised | `app/api/jobs/closing/route.ts`, `app/api/jobs/retention/route.ts` |

Confirmed code behavior and untested runtime behavior are intentionally separated above.

## 6. Missing features and improvement opportunities

### A — Must-have for MVP reliability/release

- Keep the sequential disposable-PostgreSQL verification job in CI; the current migration/seed, idempotency, admin, skip/override, concurrent accept, checkout/support release, cancellation, and service-change fixtures pass.
- Keep the protected mutating Playwright flows in CI; the current tablet project covers kiosk → assignment → accept → finish → payment and admin cancellation.
- Add real network/concurrent load tests for two check-ins, repeated FINISH/SKIP/payment retries, queue repair, and three simultaneous tablets; current DB assertions cover concurrent ACCEPT only.
- Configure external scheduling and alerting for closing and retention jobs when the deferred operations decision is reopened; no scheduler/infrastructure change is included in this batch.
- Critical-path telemetry now records rejected mutating commands, advisory-lock waits ≥10ms, board snapshot version/time, and closing/retention job outcomes. Extend route coverage and connect these events to deployment logging/alerts before unattended operation.

### B — High-value operational improvement

- Keep the appointment history path on server-side filters, pagination, summary aggregates, and the lean projection in `src/server/services/prisma-operations.ts`; retain the legacy full read only for the current-day live queue compatibility path.
- Add a compact portrait-tablet mode with pinned identity/actions.
- Approved option A is implemented: a matching phone shows the stored full name read-only for confirmation; keep the trusted-kiosk/rate-limit policy documented at deployment.
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
| FE-001 | Implemented and browser-verified | Board refresh uses abort/order/version guards; `app/(board)/board/page.tsx:103-132` | Reduces stale overwrites and overlapping recovery fetches | Keep version checks and add live Wi-Fi test | P0 / S | `tests/e2e/resilience.spec.ts` transient SSE disconnect/reconnect and board-network retry emulation |
| FE-002 | Implemented | SSE reconnect/backoff and stale label are present at `app/(board)/board/page.tsx:103-132,219` | Board communicates degraded sync and can recover | Measure recovery time on real tablet Wi-Fi | P0 / S | Network throttling and multi-tab test |
| FE-003 | Confirmed code risk, not measured | Admin refresh requests dashboard data on a timer in `app/(admin)/admin/page.tsx:40-75` | Unnecessary database/payload load during idle operation | Pause hidden tabs and request only active section or add a consolidated read model | P1 / M | 30-minute network trace |
| FE-004 | Implemented and measured | `app/(admin)/admin/page.tsx:224-347` requests a 25-row server-filtered page; the representative fixture returned 34,360 bytes/p95 6.34ms versus the legacy 1,515,072-byte/p95 104.48ms read | History payload and client memory are bounded; live current-day queue still uses the compatibility full read | Keep a payload/p95 budget and revisit the live queue read model only if daily volume requires it | P1 / M | DB integration pagination test and 20k fixture benchmark |
| FE-005 | Confirmed code risk, not measured | Wide tables require overflow in `app/globals.css` | Slower portrait-tablet interaction | Add compact list/card mode and pin actions | P1 / M | Screenshot/interaction test at supported iPad sizes |
| FE-006 | Implemented and measured at two scales | Board reads now use `boardAppointmentInclude` with only fields consumed by the board; payload was 2,613 bytes on the seed fixture and 3,899 bytes with 2,000 same-day records | Reduces repeated payload/serialization work across three polling tablets | Keep the lean read model separate from mutation includes; set an operational p95 budget | P1 / S | `npm run benchmark:db`, 20k fixture, 3-client HTTP smoke, and `npm run load:profile` |

Measured results are test-fixture timings, not production SLOs. Seed fixture (20 iterations + 2 warmups): board p50/p95 1.76/3.26ms, filtered appointments 1.66/1.91ms, report day 0.58ms, report month 0.50ms. Representative fixture (20,000 appointments; 18,000 historical + 2,000 today): board p50/p95 73.70/107.89ms with a 3,899-byte payload, legacy filtered appointments 96.08/104.48ms with a 1,515,072-byte payload, and the new 25-row appointment page 5.16/6.34ms with a 34,360-byte payload; report day p95 5.32ms and report month p95 16.27ms. The production build HTTP smoke with three concurrent clients over ten cycles returned 30/30 HTTP 200 responses at p50/p95 114.59/219.84ms and echoed request IDs. The disposable service-layer read/write profile ran 3 clients × 10 cycles with zero errors: board p50/p95/p99 92.40/152.20/170.98ms, history 9.58/35.97/37.15ms, report 6.59/22.24/22.79ms, and check-in write 37.38/78.53/128.86ms; seven advisory-lock waits exceeded 10ms, with a maximum of 56.87ms. The pool-constrained authenticated profile ran 3 role flows × 50 cycles (350 operations) with zero errors using Prisma `connection_limit=3`/`pool_timeout=5`; check-in p50/p95/p99 was 10.41/45.44/50.12ms, and the activity sample observed 6 total/2 active DB connections. Raw setup, query-plan notes, and resilience evidence: [`PERFORMANCE_BENCHMARK.md`](PERFORMANCE_BENCHMARK.md).

## 8. Backend/database performance findings

| ID | Classification | Evidence | Impact | Recommendation | Priority / effort | Validation |
|---|---|---|---|---|---|---|
| BE-001 | Implemented | Board GET reads are side-effect free at `src/server/services/prisma-operations.ts:217-235`; reconciliation is explicit at `:716-734`; board snapshot telemetry is emitted by `app/api/board/route.ts` | Avoids write contention on every board refresh and exposes version/snapshot freshness for operators | Connect snapshot freshness and request latency to deployed dashboards/alerts | P0 / M | `pg_stat_activity`, request p95, board headers/logs |
| BE-002 | Implemented | Check-in/action paths lock shop/business date and use receipts at `src/server/services/prisma-operations.ts:355-366,844-872` | Serializes critical operations safely and makes retries deterministic | Confirm throughput under expected simultaneous tablet taps | P0 / M | PostgreSQL concurrency fixture |
| BE-003 | Implemented | Support active lookup now uses `releasedAt` and composite indexes (`prisma/schema.prisma:245-257`, migration `20261010173000_support_assignment_release`) | Prevents historical support rows from keeping staff busy | Verify query plans after migration | P1 / S | `EXPLAIN ANALYZE` |
| BE-004 | Measured locally; production validation pending | A shop/date advisory lock still serializes same-day mutations; the disposable 3-client profile recorded 7 waits ≥10ms, maximum 56.87ms, with zero errors | Could become a bottleneck at higher volume or under slower storage/pools | Keep the lock design for MVP; capture production-like wait/pool/error distributions before narrowing or sharding | P1 / M/L | `npm run load:profile`, database lock metrics, deployed traffic |
| BE-005 | Implemented and measured | `getDbAppointmentsPage` and `historyAppointmentInclude` now apply server-side filters, deterministic ordering, aggregates, pagination, and projection; new page is 34.36KB/p95 6.34ms versus legacy 1.515MB/p95 104.48ms | Historical range reads no longer return an unbounded rich relation graph; duration sort still performs a lightweight summary scan because duration is derived | Keep a payload/p95 budget; measure lock/pool behavior under production-like traffic | P1 / M | 20k fixture benchmark and DB pagination test |
| BE-006 | Implemented and measured at representative volume | `scripts/benchmark-db.ts`, `scripts/seed-benchmark-fixture.ts`, `scripts/load-profile.ts`, and `scripts/http-load-profile.ts` provide repeatable seed/scale/load baselines; primary board/date query plan used the existing date/status index and executed in 0.56ms on the fixture | Establishes a measurable baseline; no index change is justified from this run | Repeat the authenticated profile on staging/deployed network and production-like pool/lock settings; local `connection_limit=3` evidence is now available | P1 / S | 20k fixture, `EXPLAIN ANALYZE`, standard and pool-constrained HTTP profiles, and disposable read/write profile |

## 9. Realtime synchronization and concurrency

The current model is database-as-source-of-truth, SSE as a notification/snapshot channel, and bounded polling as recovery. It is not an event bus and is not full offline-first. `ShopConfig.stateVersion` increments on mutations, while clients reject stale/out-of-order board responses. Reads no longer reconcile assignments.

Browser-level transient SSE disconnect/reconnect, deterministic board snapshot network failure/retry, and same-key duplicate kiosk submissions are now tested in `tests/e2e/resilience.spec.ts` (3/3 on the tablet project). The following remain not tested: three physical tablets on a real network, event ordering with multiple real reconnecting clients, browser tab suspension, offline submission, refresh during an in-flight mutation, and cross-process lock contention. These are release-test requirements, not claims of failure.

## 10. Security and code quality

Implemented controls:

- Auth requests revalidate active account/status/session version in `src/server/auth.ts` and account changes increment `AuthUser.sessionVersion`.
- Staff PIN failures use persistent `StaffPinLockout` data; verified sessions support revocation.
- Admin routes use role/origin/schema checks; mutation receipts include request hashes.
- Public board redacts customer identity and exclusion details; shared staff board still exposes staff operational status.
- Prisma constraints/indexes preserve historical snapshots, unique exclusions, unique receipts, and active-support lookup.
- The code remains a modular monolith appropriate for the MVP: App Router UI, route handlers, domain functions, Prisma operations, and one PostgreSQL source of truth.

Remaining security/quality work:

- Product decision recorded: public kiosk lookup may reveal the matching stored full name for confirmation. The API returns no phone or customer record, uses `no-store`, and the behavior passes returning-guest E2E; rate limiting remains a deployment/operator control.
- Request IDs and API completion timings now exist on the proxy and critical APIs (`proxy.ts`, `src/server/observability.ts`). Critical-path logs now also cover rejected mutating commands, advisory-lock waits, board version/snapshot time, and closing/retention outcomes; full admin-route coverage and deployment dashboards/alerts remain follow-up.
- Run a real dependency/security audit when registry access is available; the pre-change audit passed with 0 high-severity findings, while the post-change command could not reach npm due DNS failure.
- Repository has no `.git` directory; the current follow-up is tracked through the attached external Git metadata at `/private/tmp/wellness-salon-git`, while the rollback snapshot remains the primary pre-change artifact.

## 11. QA and test coverage gaps

### Executed and passing

| Command/check | Result |
|---|---|
| `npx prisma generate` | PASS; client generated; Prisma 7 package.json configuration deprecation warning |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test -- --run` | PASS: 11 files, 31 passed, 9 DB-gated tests skipped without DB env |
| `npm run test:coverage` | PASS for the 2026-10-10 hardening tree: 27% statements/lines, 68.04% branches, 12.85% functions; the 2026-10-11 follow-up rerun is 24.88% / 68.75% / 11.39% |
| `npx prisma validate` | PASS |
| `npm run build` | PASS after request-ID/lean-board changes; Next.js 16.4.0/Turbopack, all current routes compiled |
| Sequential DB-gated Vitest: `postgres.test.ts` | PASS: 3/3 on isolated PostgreSQL; migration/seed/idempotency/paginated history |
| Sequential DB-gated Vitest: `admin-access.test.ts` | PASS: 1/1 on isolated PostgreSQL |
| Sequential DB-gated Vitest: `critical-workflows.test.ts` | PASS: 5/5 on isolated PostgreSQL; skip exclusion/override, concurrent accept, checkout/support release, cancellation, service change |
| `npx playwright test --project=tablet --workers=1` with test app on 3100 | PASS: 7/7 from clean seeded test DB; public authorization, kiosk, admin CRUD, protected payment, protected cancellation |
| iPad viewport screenshot/DOM review | PASS with limitation: 810×1080 and 1080×810; no horizontal overflow, primary controls ≥44px; WebKit/physical device unavailable. Details: [`VIEWPORT_QA.md`](VIEWPORT_QA.md) |
| `npm run benchmark:db` | PASS: 20 iterations + 2 warmups; board p50 1.76ms/p95 3.26ms, 2,613-byte payload; report day/month p95 0.58/0.50ms on small fixture |
| Request-ID smoke (`/api/health`, `/api/board`) | PASS: supplied ID echoed; generated ID returned; structured `api.request.completed` log emitted |
| Representative PostgreSQL benchmark | PASS: disposable 20,000-appointment fixture; legacy filtered history p50/p95 96.08/104.48ms with 1,515,072-byte payload; new 25-row page p50/p95 5.16/6.34ms with 34,360-byte payload; board p50/p95 73.70/107.89ms; day/month report p95 5.32/16.27ms |
| Production-build HTTP load smoke | PASS with scope limit: 3 concurrent clients × 10 cycles, 30/30 board requests HTTP 200, p50/p95 114.59/219.84ms, request IDs echoed; local loopback only |
| Disposable concurrent read/write load profile | PASS with scope limit: 3 service-layer clients × 10 cycles, 120 operations, zero errors; board p50/p95/p99 92.40/152.20/170.98ms, check-in write 37.38/78.53/128.86ms; 7 advisory-lock waits ≥10ms, max 56.87ms; disposable local PostgreSQL only |
| Authenticated HTTP load profile | PASS with scope limit: 3 role flows × 10 cycles, 70 operations, zero errors; admin/board/kiosk reads plus kiosk writes; p95 36.26ms for admin appointments, 30.20ms for board, 45.83ms for check-in; max observed DB connections 13, active 3; local disposable app/DB only |
| Pool-constrained authenticated HTTP profile | PASS with scope limit: 3 role flows × 50 cycles, 350 operations, zero errors; Prisma `connection_limit=3`/`pool_timeout=5`; check-in p50/p95/p99 10.41/45.44/50.12ms; max observed DB connections 6, active 2; local loopback only |
| Kiosk returning-guest E2E | PASS: 2/2 — approved full-name lookup displays the saved name read-only and the customer continues without re-entering it |
| `tests/e2e/resilience.spec.ts` on tablet project | PASS: 3/3 — transient SSE abort recovered to Live; board snapshot network failure showed Retry and recovered; same idempotency key returned one appointment |

### Not run or not verified

- Physical iPad/WebKit review, distance/readability on deployed hardware, and Dynamic Type/largest text-size review were not run.
- Physical/live-network interruption, browser refresh during mutation, three physical tablet load, and offline submission scenarios remain pending. Browser-level transient SSE recovery, board-network failure/retry emulation, and same-key retry are now covered.
- Production connection-pool, bundle-size, memory, and deployed-network measurements remain pending. A local pool-constrained profile with Prisma `connection_limit=3` is complete, but advisory-lock waits were measured only on disposable profiles; representative read timings and primary `EXPLAIN ANALYZE` plans were captured on a disposable 20,000-appointment fixture; none are production SLOs.
- External scheduling/alerting for `/api/jobs/closing` and `/api/jobs/retention` is explicitly deferred by product decision; route-level job outcome telemetry is now emitted.
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
| 6 | Run disposable PostgreSQL concurrency and protected-flow E2E suite | DB/critical flows sequentially pass; representative read benchmark and browser resilience pass; physical/network/concurrency scale gaps remain | 5 | 3 | 5 | 4 | 5 | P0 release gate |
| 7 | Add request/lock/sync/job observability | Critical-path implementation complete: request IDs/API timings, rejected-command logs, lock-wait logs, board version/snapshot signals, and closing/retention outcomes; route coverage and deployed alerting remain | 4 | 3 | 4 | 3 | 5 | P1 |
| 8 | Add server-side history filtering/pagination and measured indexes | Implemented for admin history; representative 25-row page is 34.36KB/p95 6.34ms. Production-like traffic and live queue read budget remain | 4 | 4 | 4 | 3 | 5 | P1 |
| 9 | Decide and implement kiosk phone-lookup privacy mode | Implemented: option A approved; full name is read-only, response is limited/no-store, and returning-guest E2E passes 2/2. Rate limiting remains deployment/operator control. | 4 | 4 | 4 | 3 | 5 | P1 |
| 10 | Complete protected iPad portrait/landscape and accessibility QA | Chromium viewport pass; physical iPad/WebKit pending | 5 | 4 | 4 | 4 | 5 | P1 |

## 13. Quick wins

- Schedule `/api/jobs/retention` externally with the job secret and record successful/failed runs.
- Keep a disposable PostgreSQL service in CI/local development and run the DB-gated files sequentially against one test database (or isolate each worker database).
- Run the manager queue-repair action after migration on a staging fixture and compare waiting/assigned counts.
- Keep `scripts/seed-benchmark-fixture.ts` restricted to disposable databases and rerun `npm run benchmark:db` with `EXPLAIN ANALYZE` before optimizing history/report queries.
- Repeat the authenticated HTTP profile on the chosen staging/deployed network and pool configuration; the local `connection_limit=3`/50-cycle run is a baseline, not a launch SLO.
- Document kiosk privacy option A and the trusted-kiosk/rate-limit assumptions in the deployment/runbook.

## 14. Prioritized backlog

| ID | Backlog item | Priority | Effort | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| VER-001 | Disposable PostgreSQL migration and critical workflow verification | P0 release gate | L | Test DB/seeds | Verified sequentially: 14 migrations + seed, postgres 3/3, admin 1/1, critical 5/5. Add representative-scale/concurrency coverage before production. |
| VER-002 | Protected three-tablet E2E | P0 release gate | L | VER-001, seeded accounts | Verified 7/7 on Chromium iPad viewport. Add real network interruption/three-device run before production. |
| VER-003 | Browser resilience and retry safety | P0 release gate | S | VER-001, test app | Verified 3/3: SSE transient abort and board snapshot network failure/retry recover to Live; same kiosk idempotency key returns one appointment. Physical offline/refresh-during-mutation remains open. |
| OBS-001 | Request/lock/sync/job telemetry | P1 | M | Deployment logging destination | Critical paths emit request IDs/timings, rejected commands, advisory-lock waits ≥10ms, board version/snapshot signals, and closing/retention outcomes; add full admin-route coverage plus deployed dashboards/alerts. |
| PERF-001 | Server-side appointment/history pagination and profiling | P1 | M | Representative fixture | Implemented: admin history uses a bounded 25-row page, server filters, summaries, deterministic ordering, and a lean projection; measured 34.36KB/p95 6.34ms on the fixture. Set the production payload/p95 budget and profile the live queue path separately. |
| PERF-002 | Concurrent read/write/load profile | P1 | M | Staging traffic model, DB metrics | Disposable service-layer and authenticated-local HTTP baselines are complete with zero errors; a 350-operation local `connection_limit=3` profile is also complete; extend to deployed pool saturation, reconnect/recovery, and production-like hardware/network. |
| UX-001 | Exact iPad portrait/landscape and accessibility pass | P1 | M | Supported hardware list | Chromium viewport pass found no horizontal overflow and ≥44px controls; physical iPad/WebKit, Dynamic Type, and network states remain. |
| PRIV-001 | Kiosk lookup privacy mode | P1 | M | Salon decision | Implemented for approved option A: full name may be shown read-only; response has only approved fields and `no-store`; returning-guest E2E passes 2/2. Rate limiting/abuse monitoring remains deployment scope. |
| UX-002 | URL/deep-link admin section/filter state | P2 | M | None | Refresh/back/bookmark preserves module and date/filter state. |
| FUT-001 | ETA, exports, notifications, richer analytics | P3 | M/L | Stable operational data | Added only after P0/P1 reliability and performance criteria pass. |

## 15. Recommended implementation roadmap

### Batch 0 — Release preparation (S, operator-led)

Back up the target database, apply the additive migrations only to staging/disposable infrastructure, seed skip reasons/shop config, and schedule the protected jobs. Acceptance: migration/seed logs are clean and rollback/restore is rehearsed.

### Batch 1 — Database and protected workflow verification (L) — Complete with limitations

Applied/seeded all 14 migrations on an isolated PostgreSQL cluster; sequential DB tests and 7/7 protected tablet E2E pass. Remaining acceptance: representative-scale concurrency, offline/reconnect, and physical tablet sign-off.

### Batch 2 — Observability and measured performance (M) — Complete with representative follow-up

Added request IDs, structured API completion timings, rejected-command/lock-wait/sync-freshness/job telemetry on critical paths, a lean board read model, server-side appointment history pagination/projection, `npm run benchmark:db`, the disposable-only `npm run load:profile`, and the authenticated-local `npm run load:http`. A disposable 20,000-appointment fixture plus primary `EXPLAIN ANALYZE` plans, a 3-client production-build HTTP smoke, a 3-client service-layer read/write profile, and a three-role authenticated HTTP profile now exist. Production pool/network thresholds and physical tablet QA remain follow-up; kiosk privacy A is decided.

### Batch 3 — Tablet/privacy polish (M) — Partially complete

Reviewed kiosk/board/sign-in/admin at 810×1080 and 1080×810 with screenshot and DOM checks. No horizontal overflow was observed and primary controls met 44px; browser SSE recovery, same-key retry, and approved returning-guest full-name behavior now pass, while physical iPad/WebKit and live Wi-Fi remain.

### Batch 5 — Release-readiness measurement and resilience (S/M) — Complete with hardware follow-up

Added `tests/e2e/resilience.spec.ts`, `scripts/seed-benchmark-fixture.ts`, disposable-only `scripts/load-profile.ts`, and `scripts/http-load-profile.ts`. The browser recovery/retry checks pass 3/3, returning-guest kiosk E2E passes 2/2, the representative PostgreSQL benchmark covers 20,000 appointments, the bounded three-client HTTP smoke is 30/30 successful, the service-layer profile completes 120 operations with zero errors, and the standard authenticated HTTP profile completes 70 operations with zero errors while observing 13 maximum DB connections/3 active. A second pool-constrained authenticated run completes 350 operations with zero errors using `connection_limit=3`/`pool_timeout=5`, observing 6 maximum DB connections/2 active. No production DB, deployment, or infrastructure was changed. Physical devices, real Wi-Fi loss, offline submission, deployed pool/network SLOs, and production SLOs remain open.

### Batch 4 — Post-MVP value (P2/P3)

Consider exports, ETA/notifications, and richer analytics only after operations are reliable. Continue to avoid gateways, dedicated staff mobile, payroll, inventory, loyalty, offline-first, and multi-tenant complexity in this MVP.

## 16. Open business questions requiring decision

1. **Kiosk lookup privacy:** Decided as option A — a matching phone may display the stored full name read-only for guest confirmation. Revisit only if the salon wants masked lookup or no recognition.
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

The migrations are additive and were applied only to disposable PostgreSQL clusters for verification; no production database was changed. There is no generated down migration; production rollback should use the approved backup/restore procedure or a forward corrective migration after review.

## Final handoff

The requested Batches 1–4 verification work, release-readiness measurement, approved history pagination/projection, critical-path telemetry, authenticated local HTTP profiles (including a constrained local pool), disposable read/write profile, browser network emulation, and kiosk privacy option A are complete within the documented limits. The remaining approval-dependent gates are: provide a supported physical iPad and salon/staging Wi-Fi for hardware sign-off, and provide an approved staging/deployed endpoint/pool configuration for external-network SLO measurement. Scheduler/alerting remains explicitly deferred.
