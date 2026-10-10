---
artifact_id: SA-NSM-001
type: solution-architecture
stage: SA
status: approved-for-build
version: 1
created_at: 2026-10-07
source_artifacts: [PRD-NSM-001, BA-NSM-001]
requirement_ids: [NFR-SEC-001, NFR-CON-001, FR-ENG-001, FR-ENG-002]
---

# Solution architecture

## Thành phần

- Next.js App Router + TypeScript strict: route pages, Route Handlers, Auth.js.
- `src/domain`: logic thuần cho eligibility, fairness, state transition, reconciliation.
- `src/server`: Prisma client, security helpers, turn engine, verified staff session, SSE và database services.
- PostgreSQL 16 + Prisma migration versioned. `ShopConfig` giữ timezone, currency, closing time, session TTL.
- SSE `/api/sse/board` gửi snapshot/keepalive; client polling `GET /api/board` mỗi 3 giây là fallback và là cơ chế phát hiện thay đổi database như khách check-in mới.

## Concurrency plan

Transaction routing phải gọi `pg_advisory_xact_lock(hashtextextended(shop + businessDate, 0))` trước khi đọc candidate. Tất cả insert turn, update appointment và update staff state nằm trong cùng transaction. Staff action receipt dùng unique `(scope, key)`; payment, kiosk phone và attendance có unique constraints bảo vệ double-submit.

## Audit / observability

Production service ghi JSON logs, không ghi secret. Mọi transition nghiệp vụ append `AuditEvent`. Mọi môi trường chạy Prisma migration + seed trước khi mở ứng dụng.

## Boundary

Payment gateway, TLS certificate, secret thật và production deployment không được tự động hóa; đây là human gate.
