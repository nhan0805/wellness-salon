---
artifact_id: QA-NSM-001
type: dev-qa-review
stage: DEV-QA
status: pass-with-followups
version: 1
created_at: 2026-10-07
source_artifacts: [SA-NSM-001, ASSUMPTIONS-NSM-001]
requirement_ids: [FR-KSK-001, FR-BRD-001, FR-ADM-001, NFR-SEC-001]
---

# DEV-QA review

## Kết luận

PASS cho UI, pure domain logic, build, lint, typecheck, PostgreSQL migration/seed path và các protected tablet workflow đã ghi nhận. Sequential DB-gated tests (`postgres` 3/3, `admin-access` 1/1, `critical-workflows` 5/5), protected tablet E2E 7/7, returning kiosk 2/2 và resilience 3/3 đã PASS trên môi trường disposable. Physical iPad/WebKit, real Wi‑Fi, staging SLO và production approval vẫn là follow-up gates; không nên xem đây là sign-off production không giám sát.

## Follow-up trước production thật

- P1: chạy tablet QA trên thiết bị iPad/WebKit thật, bao gồm distance readability, touch, Dynamic Type/VoiceOver và Wi‑Fi interruption.
- P1: đo lock/pool/network SLO trên staging/deployment và hoàn tất backup/restore rollback rehearsal.
- P2: cấu hình TLS certificate/domain thật trong nginx; chỉ thực hiện sau approval artifact.
- P2: nối scheduler/alerting bên ngoài vào closing/retention jobs bằng `CRON_SECRET` sau khi quyết định operations được mở lại.
- P2: bổ sung DB/E2E matrix cho category lifecycle, appointment turn history, và payment adjustment/correction/refund trước khi đóng follow-up release gate.
