---
artifact_id: E2E-NSM-001
type: e2e-test-plan
stage: Tester
status: pass-with-followups
version: 1
created_at: 2026-10-07
source_artifacts: [PRD-NSM-001, QA-NSM-001]
requirement_ids: [FR-KSK-001, FR-KSK-002, FR-BRD-001, FR-BRD-002, FR-ADM-001, FR-ADM-002, FR-ADM-003]
---

# E2E plan

- `tests/e2e/kiosk.spec.ts`: service → phone/name → code and assignment/waiting message.
- `tests/e2e/protected-workflows.spec.ts`: station/admin authentication, attendance, accept/finish, payment completion, and cancellation with a seeded PostgreSQL database.
- `tests/e2e/admin-records.spec.ts`: Admin customer add/edit/delete lifecycle.
- `tests/e2e/resilience.spec.ts`: SSE reconnect, board-network Retry recovery, and same-key kiosk retry behavior.
- `tests/e2e/authorization.spec.ts`: khách chưa đăng nhập mở được board read-only; board không có payment UI; kiosk không mở admin navigation.
- CI project `tablet` kiểm tra viewport tablet; test locator dùng role/label.
- Browser binary là dependency môi trường; chạy `npx playwright install --with-deps chromium` trước suite.

Execution contract: `npm run test:e2e -- --workers=1` runs against a migrated and seeded PostgreSQL database. The suite authenticates with `E2E_ADMIN_*` and `E2E_STATION_*` credentials, so browser assertions exercise the same authorization and persistence path as deployment. Local Chrome can be selected with `PLAYWRIGHT_CHROME_PATH` when the managed browser is unavailable.

## Latest recorded execution

- Protected tablet workflow set: 7/7 on an isolated app/test database.
- Returning-guest kiosk: 2/2; the approved full-name behavior is read-only.
- Browser resilience: 3/3 for transient SSE recovery, board snapshot Retry recovery, and same-key duplicate submission.
- Chromium tablet viewport review: 810×1080 and 1080×810 passed without horizontal overflow; physical iPad/WebKit, real Wi‑Fi, offline submission, and distance readability remain open.

The 2026-10-11 follow-up adds category management, appointment turn history, and payment adjustment/correction/refund UI/API paths. They were statically built but were not included in the recorded disposable DB/E2E run; add dedicated scenarios before using them as release evidence.
