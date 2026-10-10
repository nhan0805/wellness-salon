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

`npm test` đã PASS: 5 test files, 11 tests. Bao phủ eligibility (PRESENT + skill + AVAILABLE), fairness, wait lâu nhất, skip/re-route, appointment/turn/attendance state machine, reconciliation và serialization chống double claim. `npm run test:coverage` cũng PASS; V8 coverage hiện khoảng 10.97% toàn repo và 52.22% ở `src/domain` do server route/Prisma chỉ được cover trong database-enabled CI.

`RUN_DB_TESTS=true` là CI gate cho PostgreSQL integration suite: migration/seed/advisory lock và hai kiosk submit đồng thời cùng phone được kiểm tra trên PostgreSQL. Local không có database thì test suite được skip có chủ đích.
