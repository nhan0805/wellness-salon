# Nail Shop Management

Nail Shop Management là web app tablet-first cho một tiệm nail, gồm customer kiosk, staff turn board và admin console. Tài liệu và artifact lifecycle dùng tiếng Việt; code/API/database dùng tiếng Anh.

## Stack

Next.js App Router, TypeScript strict, PostgreSQL 16, Prisma migration, Auth.js Credentials, Argon2id, Zod, SSE + polling fallback, Vitest, Playwright, Docker standalone và nginx.

## Kiểm chứng đã chạy

```bash
npm install
npm run db:generate
npm run lint
npm run typecheck
npm test
npm run build
```

Kết quả local hiện tại: lint PASS, typecheck PASS, unit/validation tests PASS (13 tests; PostgreSQL suite opt-in thêm 2 tests), production build standalone PASS. E2E đã được chuyển sang database-backed flow và cần chạy sau khi PostgreSQL được migrate/seed.

## Chạy app

```bash
npm run dev
```

Hoặc PostgreSQL thật:

```bash
docker compose -f docker/docker-compose.yml up --build
```

Routes:

- `/kiosk` — khách tự chọn service, nhập phone/name, nhận mã lượt.
- `/board` — turn board chung, current/up next, public read-only view; verified staff action sau khi station sign-in.
- `/admin` — dashboard, queue, appointments, payment confirm và reports.
- `/sign-in` — staff/station sign-in để mở các thao tác trên board.
- `/admin/sign-in` — admin sign-in.

Seed credentials are read from `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `STATION_EMAIL`, `STATION_PASSWORD`, `STAFF_DEFAULT_PIN`) and are never shown in the UI or committed to the repository.

## Repository tree

```text
app/                 Next routes, layouts and API handlers
src/domain/          Pure routing, fairness, state machines, reconciliation
src/server/          Prisma/auth/security/database/SSE services
prisma/              schema, migration and idempotent seed
tests/               unit, integration gates and Playwright E2E
docs/lifecycle/      versioned PO → PRD → BA → SA → QA → tests → CI/CD
docs/runbook/        local and operational notes
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

## Production notes / human gates

Ứng dụng yêu cầu `DATABASE_URL` và luôn dùng PostgreSQL adapter, Auth.js role guard, Argon2id, verified staff session và advisory lock. Docker/CI chạy migration, seed và PostgreSQL concurrency suite thật. Endpoint scheduler `POST /api/jobs/closing` đóng attendance theo `ShopConfig`. TLS/domain/certificate, secrets thật, merchant integration và production deploy approval là human gate. Không có merchant card integration trong V1.
