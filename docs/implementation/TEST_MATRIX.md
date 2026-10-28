# Implementation test matrix

The active database-backed gate is `npm run test:e2e:d1`. It builds the Worker artifact, creates disposable local D1 state, applies all six migrations and the 101-statement bootstrap, and runs the Worker Playwright suite. `npm run test:e2e:d1:webkit` adds the iPad/WebKit project. The current follow-up was verified on 2026-10-28; exact counts are recorded in `docs/cloudflare/TEST_REPORT.md`.

## Functional coverage

| Area | Covered behavior | Current status |
| --- | --- | --- |
| Kiosk | Service selection, validation, check-in, explicit same-day visits, returning-customer lookup, idempotent replay | PASS in local Worker/D1 smoke and E2E |
| Public board | Queue/current/up-next display, redaction, SSE snapshot, polling recovery, tablet layout, 320/360/390px queue action layout | PASS with physical-device follow-up |
| Staff actions | Attendance, accept, finish, skip/reason, support, continuation, availability guards | PASS in local D1 smoke; broader concurrent taps remain open |
| Routing | Required-skill intersection, fairness, exact-service exclusions, manager override, waiting state | PASS in unit and local D1 smoke |
| Admin catalog | Categories, services, icons, skills, active/archive guards | PASS in local D1 smoke and authenticated remote read smoke |
| Admin records | Customers, staff, accounts, attendance, session revocation safeguards, compact Full Name/Skills/Assignment availability persistence | PASS in local D1 smoke and authenticated remote read smoke |
| Payments | Card/cash confirmation, tips, cash details, idempotency, adjustment/correction/refund records, audit history | PASS in local smoke; physical keypad and broader API matrix remain open |
| Reports/history | Revenue split, reconciliation, appointment turn history, audit snapshots | PASS for local read/smoke scope; broader fixture coverage remains open |
| Jobs | Closing blockers/success, retention authorization, Worker cron mapping | PASS locally; deployed event-level check remains open |

## Resilience and security

| Scenario | Status |
| --- | --- |
| Same idempotency key replay | PASS |
| Conflicting request hash rejection | PASS in local command smoke |
| SSE reconnect and bounded polling fallback | PASS in browser resilience coverage |
| Admin request deadlines, cancellation, stale-response protection | PASS for Attendance smoke and static paths; delayed/fault-injection coverage remains open |
| Public board/customer redaction | PASS |
| Generic credential errors and trusted-origin checks | PASS |
| Session-version revalidation and D1 lockout state | PASS in unit/local auth smoke |
| D1 interruption/failure-injection | NOT RUN |
| Deployed Worker public/authenticated read-only smoke | PASS: 19/19, including SSE initial snapshot |
| Deployed Worker business mutation/scheduler | NOT RUN automatically; operator-gated |

## UI/device

| Scenario | Status |
| --- | --- |
| Chromium tablet 810×1080 and 1080×810 | PASS |
| Queue 320×740, 360×800, 390×844 | PASS; no document overflow and Accept/Skip do not overlap |
| Historical review 90% zoom at 1440px | PASS; table wrapper owns horizontal scroll |
| Admin/Board Kiosk entry | PASS; separate-tab links preserve the current workflow |
| Primary controls at least 44px and no reviewed horizontal overflow | PASS |
| iPad/WebKit emulation | PASS: combined gate includes 61 passing cases with two intentional skips |
| Physical iPad | NOT RUN |
| Real Wi-Fi interruption/offline submission | NOT RUN |
| Dynamic Type/VoiceOver/modal interaction review | NOT RUN |

## Automated quality gates

| Command | Outcome |
| --- | --- |
| `npm run lint` | PASS in the recorded local gate |
| `npm run typecheck` | PASS on 2026-10-25 |
| `npm test` | PASS: 71/71 |
| `npm run build:vinext` | PASS on 2026-10-25 |
| `npm run test:e2e:d1` | PASS: 47 passed, 1 intentional skip; all six local migrations applied |
| `npm run d1:recovery:rehearsal` | PASS: representative local tables restored with matching counts |
| `npm run smoke:remote` | PASS: 19/19 read-only production checks |
| `npx cf deploy --dry-run` | PASS in the recorded deployment gate |

The matrix is local evidence, not production approval. Keep tests on disposable D1 and record remote evidence separately in `docs/cloudflare/`.
