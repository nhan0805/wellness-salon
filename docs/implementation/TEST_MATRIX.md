# Implementation test matrix

The active database-backed gate is `npm run test:e2e:d1`. It builds the Worker artifact, creates disposable local D1 state, applies two migrations and the 101-statement bootstrap, and runs the Worker Playwright suite.

## Functional coverage

| Area | Covered behavior | Current status |
| --- | --- | --- |
| Kiosk | Service selection, validation, check-in, explicit same-day visits, returning-customer lookup, idempotent replay | PASS in local Worker/D1 smoke and E2E |
| Public board | Queue/current/up-next display, redaction, SSE snapshot, polling recovery, tablet layout | PASS with physical-device follow-up |
| Staff actions | Attendance, accept, finish, skip/reason, support, continuation, availability guards | PASS in local D1 smoke; broader concurrent taps remain open |
| Routing | Required-skill intersection, fairness, exact-service exclusions, manager override, waiting state | PASS in unit and local D1 smoke |
| Admin catalog | Categories, services, icons, skills, active/archive guards | PASS in local D1 smoke; dedicated browser assertions remain open |
| Admin records | Customers, staff, accounts, attendance, session revocation safeguards | PASS in local D1 smoke; dedicated browser assertions remain open |
| Payments | Card/cash confirmation, tips, cash details, idempotency, adjustment/correction/refund records, audit history | PASS in local smoke; physical keypad and broader API matrix remain open |
| Reports/history | Revenue split, reconciliation, appointment turn history, audit snapshots | PASS for local read/smoke scope; broader fixture coverage remains open |
| Jobs | Closing blockers/success, retention authorization, Worker cron mapping | PASS locally; deployed event-level check remains open |

## Resilience and security

| Scenario | Status |
| --- | --- |
| Same idempotency key replay | PASS |
| Conflicting request hash rejection | PASS in local command smoke |
| SSE reconnect and bounded polling fallback | PASS in browser resilience coverage |
| Public board/customer redaction | PASS |
| Generic credential errors and trusted-origin checks | PASS |
| Session-version revalidation and D1 lockout state | PASS in unit/local auth smoke |
| D1 interruption/failure-injection | NOT RUN |
| Deployed Worker auth/mutation/scheduler | NOT RUN in full scope |

## UI/device

| Scenario | Status |
| --- | --- |
| Chromium tablet 810×1080 and 1080×810 | PASS |
| Primary controls at least 44px and no reviewed horizontal overflow | PASS |
| Physical iPad/WebKit | NOT RUN |
| Real Wi-Fi interruption/offline submission | NOT RUN |
| Dynamic Type/VoiceOver/modal interaction review | NOT RUN |

## Automated quality gates

| Command | Outcome |
| --- | --- |
| `npm run lint` | PASS in the recorded local gate |
| `npm run typecheck` | PASS on 2026-10-14 |
| `npm test -- --run` | PASS: 51/51, no database skips |
| `npm run build:vinext` | PASS in the recorded Worker gate |
| `npm run test:e2e:d1` | PASS: 25 passed, 1 intentional desktop-project skip across 26 cases |
| `npx cf deploy --dry-run` | PASS in the recorded deployment gate |

The matrix is local evidence, not production approval. Keep tests on disposable D1 and record remote evidence separately in `docs/cloudflare/`.
