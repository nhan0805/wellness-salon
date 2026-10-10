---
artifact_id: CICD-NSM-001
type: ci-cd-and-deployment-plan
stage: CI/CD
status: dry-run
version: 1
created_at: 2026-10-07
source_artifacts: [SA-NSM-001, NFR-NSM-001]
requirement_ids: [NFR-SEC-001, NFR-CON-001, NFR-OPS-001]
---

# CI/CD và rollback

GitHub Actions chạy install, Prisma generate/migrate/seed, lint, typecheck, unit coverage, build, runtime `npm audit --omit=dev --omit=optional --audit-level=high` và Playwright. Docker image dùng Next standalone, Node non-root, healthcheck `/api/health`; image app loại dev/optional packages còn migrator giữ Prisma CLI riêng. Compose local có PostgreSQL 16, migration/seed service và nginx profile.

## DRY-RUN

```bash
docker compose -f docker/docker-compose.yml up --build
docker compose -f docker/docker-compose.yml --profile proxy up --build
```

## Rollback

Giữ image tag trước đó, deploy lại tag ổn định. Migration destructive không được chạy tự động; migration mới phải có backward-compatible path hoặc approval artifact trong `docs/lifecycle/approvals/`.

## Human gate

TLS certificate/domain, merchant integration thật, production secret và deploy có tác động dữ liệu đang chờ người có quyền phê duyệt.
