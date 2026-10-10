---
artifact_id: E2E-NSM-001
type: e2e-test-plan
stage: Tester
status: pass
version: 1
created_at: 2026-10-07
source_artifacts: [PRD-NSM-001, QA-NSM-001]
requirement_ids: [FR-KSK-001, FR-KSK-002, FR-BRD-001, FR-BRD-002, FR-ADM-001, FR-ADM-002, FR-ADM-003]
---

# E2E plan

- `tests/e2e/kiosk.spec.ts`: service → phone/name → code and assignment/waiting message.
- `tests/e2e/authorization.spec.ts`: khách chưa đăng nhập mở được board read-only; board không có payment UI; kiosk không mở admin navigation.
- CI project `tablet` kiểm tra viewport tablet; test locator dùng role/label.
- Browser binary là dependency môi trường; chạy `npx playwright install --with-deps chromium` trước suite.

Execution contract: `npm run test:e2e -- --workers=1` runs against a migrated and seeded PostgreSQL database. The suite authenticates with `E2E_ADMIN_*` and `E2E_STATION_*` credentials, so browser assertions exercise the same authorization and persistence path as deployment. Local Chrome can be selected with `PLAYWRIGHT_CHROME_PATH` when the managed browser is unavailable.
