---
artifact_id: UT-NSM-001
type: unit-test-report
stage: UT
status: pass
version: 1
created_at: 2026-10-07
source_artifacts: [QA-NSM-001]
requirement_ids: [FR-ENG-001, FR-ENG-002, FR-ADM-003]
---

# Unit test report

`npm test -- --run` đã PASS: 11 test files, 31 tests; 3 DB-gated files với 9 tests được skip khi không có disposable DB variables. Bao phủ eligibility, fairness, wait lâu nhất, skip/re-route, appointment/turn/attendance state machine, reconciliation, validation, admin management, service icons, locale options và serialization chống double claim. Lần chạy coverage ngày 11/10/2026 báo 24.88% statements/lines, 68.75% branches và 11.39% functions; đây là coverage rộng gồm cả UI/server modules chưa có unit instrumentation. Dedicated DB/E2E coverage cho category/payment-history/refund/turn-history follow-up vẫn còn mở.

`RUN_DB_TESTS=true` với `TEST_DATABASE_URL` disposable là gate cho PostgreSQL integration suite. Bằng chứng implementation đã pass tuần tự: `postgres` 3/3, `admin-access` 1/1 và `critical-workflows` 5/5 sau khi apply/seed 14 migrations. Không bao giờ trỏ suite vào application database; local không có database thì test suite được skip có chủ đích.
