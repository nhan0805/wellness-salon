---
artifact_id: ADR-NSM-001
type: architecture-decision-record
stage: SA
status: accepted
version: 1
created_at: 2026-10-07
source_artifacts: [SA-NSM-001]
requirement_ids: [NFR-CON-001]
---

# ADR-001: transaction-scoped advisory lock

## Bối cảnh

`SELECT ... FOR UPDATE` không khóa được row chưa tồn tại. Hai kiosk submit đồng thời có thể cùng nhìn thấy một staff AVAILABLE và cùng insert turn.

## Quyết định

Serialize theo một key ổn định của shop + business date bằng `pg_advisory_xact_lock`. Lock sống đúng trong transaction, không cần quản lý lock row riêng. Unique/index/optimistic idempotency là lớp bảo vệ bổ sung.

## Hệ quả

Queue assignment tuần tự trong phạm vi shop/ngày, phù hợp V1 một shop. Khi mở multi-tenant, key phải thêm tenant id; không đổi business rule.
