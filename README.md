# Nail Shop Management

Nail Shop Management là web app tablet-first cho một tiệm nail, gồm customer kiosk, staff turn board và admin console. Tài liệu và artifact lifecycle dùng tiếng Việt; code/API/database dùng tiếng Anh.

## Stack

Cloudflare Workers + D1 (SQLite, canonical runtime and test target), Next.js App Router/vinext, TypeScript strict, role-based credentials, Zod, SSE + polling fallback, Vitest, and Playwright.

## Cloudflare Free migration status

The latest Git-based release is commit `9474c0e`, deployed through GitHub Actions run [39191668530](https://github.com/nhan0805/wellness-salon/actions/runs/39191668530) to [wellness.n8l.workers.dev](https://wellness.n8l.workers.dev). Remote D1 migration `0005_free_quota_hardening.sql` is applied and the post-deploy `/api/health` check returned HTTP 200 with `status: ok`; the post-deploy read-only smoke passed 19/19 checks. The Cloudflare Worker + D1 path is the canonical runtime and test target for this handoff. Full production approval remains gated by mutation/failure-injection/concurrency evidence, live capacity metrics, physical-device review, scheduler alerting, and final owner approval. The owner has confirmed `Asia/Ho_Chi_Minh`; the existing remote D1 data and secrets were preserved and no custom domain or production-data import was used.

The 2026-10-19 release is commit `9474c0e`. It was deployed through `.github/workflows/ci.yml` in GitHub Actions run `39191668530` after the verification gate passed; use that deployment as the production source of truth. Direct deployment from an uncommitted local tree is not part of the release flow.

This release hardens the Free demo path with a dedicated atomic kiosk rate-limit table, bounded reconciliation/routing batches, indexed service-count filtering, chunked refund-report lookups, a bounded appointment-code counter, visibility-aware board reconnects, a maximum SSE lifetime, catalog cache headers, and lower-volume routine-read logging. Migration `0005_free_quota_hardening.sql` is applied to the reviewed remote D1.

Local Cloudflare checks:

```bash
npm run db:generate:d1
npm run test:e2e:d1
npx vinext check
npx cf build
```

`npm run test:e2e:d1` builds the Worker artifact, applies all five D1 migrations, generates/applies the 101-statement disposable bootstrap, and runs the Worker E2E suite against local D1. `npm run test:e2e:d1:webkit` adds the iPad/WebKit project locally. `npm run smoke:remote` runs the safe public/authenticated read-only production smoke, and `npm run d1:recovery:rehearsal` rehearses a disposable D1 export/restore. `npm run dev` starts the Worker-compatible local app on port `3001`; it needs no separate database service. Admin data loads use bounded client deadlines and show Retry instead of an indefinite spinner; this does not replace server-side latency investigation. Read the [Cloudflare performance plan](docs/cloudflare/PERFORMANCE.md), [observability runbook](docs/cloudflare/OBSERVABILITY.md), [remote smoke scope](docs/cloudflare/REMOTE_SMOKE.md), [backup/recovery guide](docs/cloudflare/BACKUP_AND_RECOVERY.md), [deployment record](docs/cloudflare/DEPLOYMENT_GUIDE.md), and [compatibility audit](docs/cloudflare/COMPATIBILITY_AUDIT.md) for the current remote status. The latest local verification is 67 passing unit/integration tests, 41 passing Worker/D1 E2E cases with one intentional skip, and 61 passing cases in the combined Chromium/tablet/WebKit gate with two intentional skips.

### Performance fixture (local/staging only)

The idempotent `db:seed:perf` generator creates 10,000 `PERF-2026-*` appointments distributed across 2026-01-01 through 2026-10-31, with customers, services, turns, turn events, attendance, and completed payments. It writes SQL outside the repository; it does not touch remote D1 unless an operator explicitly applies the file with a remote Wrangler command.

```bash
PERF_SEED_CONFIRM=YES \
PERF_APPOINTMENTS=10000 \
PERF_SQL_OUT=/private/tmp/wellness-salon-performance-2026.sql \
npm run db:seed:perf
```

Apply the generated file only to a disposable local or approved staging D1 after applying the normal migrations and bootstrap. Re-running the same file is safe because all fixture identifiers are stable and inserts are idempotent.

## Kiểm chứng đã chạy

```bash
npm install
npm run db:generate
npm run lint
npm run typecheck
npm test
npm run test:e2e:d1
npx prisma validate --schema prisma/d1/schema.prisma
npm run build
```

Kết quả kiểm chứng gần nhất ngày 19/10/2026: lint, typecheck, 67/67 unit/integration tests và build Worker PASS; D1 Worker E2E PASS 41 tests với 1 skip có chủ đích. Local D1 migrations (bao gồm migration 0005), bootstrap 101 statements, public routes, authentication, kiosk/board/admin workflows, Attendance loading smoke và responsive regressions đều PASS. Cloudflare/D1-specific blockers are recorded in `docs/cloudflare/TEST_REPORT.md`.

## Chạy app

```bash
npm run dev
```

Lệnh trên chạy Worker-compatible app với local D1 trên `http://127.0.0.1:3001`. Để chạy cổng kiểm chứng đầy đủ:

```bash
npm run test:e2e:d1
```

Routes:

- `/kiosk` — khách tự chọn service, nhập phone/name, nhận mã lượt.
- `/board` — turn board chung, current/up next, public read-only view; verified staff action sau khi station sign-in.
- `/admin` — dashboard, queue, appointments, payments, customer history, service catalog/categories và reports.
- `/sign-in` — entry point đăng nhập chung và tự chuyển hướng theo role.
- `/admin/sign-in` — compatibility alias cho entry point đăng nhập chung.

Seed credentials are read from `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `STATION_EMAIL`, `STATION_PASSWORD`, `STAFF_DEFAULT_PIN`) and are never shown in the UI or committed to the repository.

The service catalog is organized by admin-managed categories and icon choices. Admin-only payment confirmation, adjustment, correction, refund recording, appointment turn history, and payment history are audited; the app does not process card data or call a merchant gateway.

## Repository tree

```text
app/                 Next routes, layouts and API handlers
src/domain/          Pure routing, fairness, state machines, reconciliation
src/server/          Prisma/auth/security/database/SSE services
prisma/d1/           SQLite/D1 schema and migration history
tests/               unit/contract tests and Worker/D1 Playwright E2E
docs/lifecycle/      versioned PO → PRD → BA → SA → QA → tests → CI/CD
docs/runbook/        local and operational notes
docs/cloudflare/     Cloudflare Free migration audit, D1 design, tests, deployment, backup, rollback, and readiness reports
.github/workflows/   CI pipeline
```

## Project memory

The repository keeps the current project context in the following files. Read these before making a change:

- [Project state](docs/project_state.md) — current milestone, verified checks, open issues and next action.
- [Requirements](docs/requirements.md) — business, functional and non-functional scope.
- [Architecture](docs/architecture.md) — runtime modes, modules, APIs, database and security boundaries.
- [Tasks](docs/tasks.md) — backlog and handoff-ready work status.
- [Decisions](docs/decisions.md) — durable architecture decisions and trade-offs.
- [Changelog](docs/changelog.md) — release-style history of meaningful changes.
- [Handoff](docs/handoff.md) — instructions for the next AI engineer.
- [Implementation progress](docs/implementation/PROGRESS.md) — hardening scope, evidence and remaining gates.
- [Final report](docs/implementation/FINAL_REPORT.md) — implementation handoff and measured verification.
- [Release checklist](docs/implementation/RELEASE_CHECKLIST.md) — evidence versus release gates.
- [Test matrix](docs/implementation/TEST_MATRIX.md) — scenario-level pass/partial/not-run status.
- [UI/UX refresh](docs/implementation/UI_UX_REFRESH.md) — current operational design direction, responsive fixes and manual tablet gates.
- [Audit baseline](docs/audits/2026-10-10-nail-salon-mvp-audit.md) — read-only pre-hardening audit.

## Production notes / human gates

D1 Worker + D1 là runtime/test target duy nhất, với PBKDF2/HS256 auth boundary, fresh migrations và bootstrap SQL. Production deployment vẫn bị khóa bởi các báo cáo trong `docs/cloudflare/`; domain, secrets thật, merchant integration và production deploy approval là human gate. V1 không xử lý dữ liệu thẻ.
