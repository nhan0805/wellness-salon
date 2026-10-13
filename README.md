# Nail Shop Management

Nail Shop Management là web app tablet-first cho một tiệm nail, gồm customer kiosk, staff turn board và admin console. Tài liệu và artifact lifecycle dùng tiếng Việt; code/API/database dùng tiếng Anh.

## Stack

Next.js App Router, TypeScript strict, PostgreSQL 16, Prisma migration, role-based credentials, Zod, SSE + polling fallback, Vitest, Playwright, Docker standalone/nginx, and an additive vinext/Cloudflare Workers + D1 path.

## Cloudflare Free migration status

The repository now contains a Cloudflare/vinext build path, a separate SQLite/D1 schema and local migrations, a Worker-compatible auth boundary, explicit D1 batch branches for critical mutations, and a clean bootstrap SQL generator. The migration is intentionally **not production-ready**: fault-injection/concurrency evidence, financial storage review, full BR-01–BR-06 coverage, scheduler authorization, capacity, and remote smoke remain open. The owner has confirmed `Asia/Ho_Chi_Minh`; no remote Cloudflare resource, production database, secret upload, or deployment was created.

Local Cloudflare checks:

```bash
npm run db:generate:d1
npx wrangler d1 migrations apply wellness-salon --local --config=wrangler.local.jsonc
npm run dev:vinext
# in another shell:
npx vinext check
npm run build:vinext
npx cf build
```

The local migration uses an empty Wrangler D1 state and disposable smoke fixtures only. Read the [Cloudflare final report](docs/cloudflare/FINAL_REPORT.md) and [compatibility audit](docs/cloudflare/COMPATIBILITY_AUDIT.md) before attempting any deployment. The Worker uses one guarded UTC quarter-hour trigger and reads the timezone/closing time from D1, so changing timezone in Admin is supported without a code change. Remote authentication/deployment still requires secure Wrangler login and the final production smoke. The existing PostgreSQL/Docker runtime remains the behavioral reference path.

The effective Docker production dependency audit is clean after pruning build/seed-only packages (`npm audit --omit=dev --omit=optional` reports 0 vulnerabilities).

## Kiểm chứng đã chạy

```bash
npm install
npm run db:generate
npm run lint
npm run typecheck
npm test
npx prisma validate
npm run build
```

Kết quả kiểm chứng ngày 13/10/2026: lint, typecheck, 42 unit/integration tests PASS và 9 DB-gated tests được bỏ qua có chủ đích khi chưa có database test riêng. Local D1 migration, bootstrap 101 statements, public routes, check-in idempotency/concurrency, Worker login/session và payment-confirmation smoke PASS. Cloudflare/D1-specific results and blockers are recorded in `docs/cloudflare/TEST_REPORT.md`.

## Chạy app

```bash
npm run dev
```

Hoặc PostgreSQL thật:

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
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
prisma/              schema, migration and idempotent seed
prisma/d1/           separate SQLite/D1 schema and fresh migration history
tests/               unit, integration gates and Playwright E2E
docs/lifecycle/      versioned PO → PRD → BA → SA → QA → tests → CI/CD
docs/runbook/        local and operational notes
docs/cloudflare/     Cloudflare Free migration audit, D1 design, tests, deployment, backup, rollback, and readiness reports
docker/              Dockerfile, compose and nginx reverse proxy
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

Ứng dụng reference hiện yêu cầu `DATABASE_URL` và dùng PostgreSQL adapter, với role guard, verified staff session và advisory lock. Docker/CI chạy migration, seed và PostgreSQL concurrency suite thật. Cloudflare/D1 có runtime Worker riêng, PBKDF2/HS256 auth boundary, fresh migrations và bootstrap SQL; production deployment vẫn bị khóa bởi các báo cáo trong `docs/cloudflare/`. TLS/domain/certificate, secrets thật, merchant integration và production deploy approval là human gate; V1 không xử lý dữ liệu thẻ.
