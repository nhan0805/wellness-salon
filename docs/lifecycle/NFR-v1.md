---
artifact_id: NFR-NSM-001
type: non-functional-requirements
stage: SA
status: accepted
version: 1
created_at: 2026-10-07
source_artifacts: [PRD-NSM-001, SA-NSM-001]
requirement_ids: [NFR-SEC-001, NFR-CON-001, NFR-UX-001, NFR-OPS-001]
---

# NFR

- Security: Argon2id m=19456 KiB, t=2, p=1; no plaintext secret logs; CSP, HSTS through nginx, secure cookie, same-site strict, origin check on mutations.
- Availability: SSE has polling fallback; `/api/health` is suitable for container health check; shutdown target 10–30 seconds is held by container/orchestrator.
- Consistency: payment unique per appointment, attendance unique per staff/date, audit append-only.
- UX: tablet-first, 44/48px touch targets, visible focus, reduced-motion support, no color-only status.
- Time: default `Asia/Ho_Chi_Minh`; money default USD; both configurable in `ShopConfig`.
