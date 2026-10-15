# Nail Shop Management

Nail Shop Management là web app tablet-first cho một tiệm nail, gồm customer kiosk, staff turn board và admin console. Tài liệu và artifact lifecycle dùng tiếng Việt; code/API/database dùng tiếng Anh.

## Stack

Cloudflare Workers + D1 (SQLite, canonical runtime and test target), Next.js App Router/vinext, TypeScript strict, role-based credentials, Zod, SSE + polling fallback, Vitest, and Playwright.

## Cloudflare Free migration status

The Cloudflare Worker + D1 path is the canonical runtime and test target for this handoff. It contains a separate SQLite/D1 schema and local migrations, a Worker-compatible auth boundary, explicit D1 batch branches for critical mutations, a clean bootstrap SQL generator, and a repeatable D1 Worker E2E gate. The first Worker deployment is live at [wellness.n8l.workers.dev](https://wellness.n8l.workers.dev) and its non-destructive health/catalog/page smoke passed. The migration is still intentionally **not fully production-approved**: fault-injection/concurrency evidence, financial storage review, broader BR-01–BR-06 coverage, deployed capacity, remote auth/mutation/scheduler smoke, and final owner approval remain open. The owner has confirmed `Asia/Ho_Chi_Minh`; the existing remote D1 and secrets were preserved and no custom domain or production-data import was used.

Local Cloudflare checks:

```bash
npm run db:generate:d1
npm run test:e2e:d1
npx vinext check
npx cf build
```

`npm run test:e2e:d1` builds the Worker artifact, applies the two D1 migrations, generates/applies the 101-statement disposable bootstrap, and runs the Worker E2E suite against local D1. `npm run dev` starts the Worker-compatible local app on port `3001`; it needs no separate database service. Admin data loads use bounded client deadlines and show Retry instead of an indefinite spinner; this does not replace server-side latency investigation. Read the [Cloudflare final report](docs/cloudflare/FINAL_REPORT.md), [deployment record](docs/cloudflare/DEPLOYMENT_GUIDE.md), and [compatibility audit](docs/cloudflare/COMPATIBILITY_AUDIT.md) for the current remote status. The deployed URL has only passed the scoped non-destructive smoke so far; do not infer full production readiness from that check.

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

Kết quả kiểm chứng gần nhất ngày 15/10/2026: lint, typecheck và 54/54 unit/contract tests PASS; D1 Worker E2E PASS 31 tests với 1 skip có chủ đích. Local D1 migrations, bootstrap 101 statements, public routes, authentication, kiosk/board/admin workflows, Attendance loading smoke và responsive regressions đều PASS. Một số long-lived board/reconnect flow vẫn in cảnh báo Workers runtime huỷ request; đây là follow-up vận hành riêng. Cloudflare/D1-specific blockers are recorded in `docs/cloudflare/TEST_REPORT.md`.

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
- [Audit baseline](docs/audits/2026-10-10-nail-salon-mvp-audit.md) — read-only pre-hardening audit.

## Production notes / human gates

D1 Worker + D1 là runtime/test target duy nhất, với PBKDF2/HS256 auth boundary, fresh migrations và bootstrap SQL. Production deployment vẫn bị khóa bởi các báo cáo trong `docs/cloudflare/`; domain, secrets thật, merchant integration và production deploy approval là human gate. V1 không xử lý dữ liệu thẻ.
