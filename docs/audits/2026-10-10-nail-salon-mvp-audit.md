# Wellness Salon Management MVP — Full Application Audit

Audit date: 2026-10-10  
Repository: /Users/hanhuynh/Downloads/Wellness Salon  
Audit mode: read-only; no application source, schema, configuration, dependency, infrastructure, or database changes were made.  
Product scope: one-salon, operations-focused nail salon system across management tablet, shared staff turn board, and customer self-check-in tablet.

## Evidence convention

- Confirmed: directly visible in source, command output, or the live application.
- Observed: directly seen in a live screen or browser check during this audit.
- Code-based hypothesis: a credible risk inferred from the implementation but not reproduced against production-sized data or a concurrent live database.
- Not implemented: no route, model, component, or transition was found.
- Not tested: the code may exist, but this audit did not execute that path.
- Needs business decision: implementation cannot be judged as correct until the salon rule is explicit.
- Priority uses P0 critical operational/security risk, P1 pre-launch/high impact, P2 post-launch value, and P3 future scope.

Line references below point to the actual files in this workspace. The audit report is the only new file created.

## 1. Executive Summary

### Overall conclusion

The MVP is a credible functional baseline with a coherent Next.js/Prisma architecture, a visually consistent pastel tablet UI, transactional queue operations, database advisory locking, server-side validation, and a working public board/kiosk path. It is not yet ready to be treated as a reliable three-tablet production system without a focused reliability and security hardening batch.

The most important risks are not cosmetic:

1. A skipped technician is excluded only for the immediate skip transaction. The next board read performs reconciliation without that exclusion and can assign the same technician back to the same waiting service.
2. Auth.js issues an eight-hour JWT and later authorization trusts the token role without re-reading the account. Deactivating an account or changing its role therefore does not immediately revoke access.
3. Automatic closing checks out staff who are not in IN_SERVICE or PAYMENT_PENDING, including staff with an ASSIGNED turn. The subsequent ACCEPT path does not verify current attendance, so the assignment and attendance records can diverge.
4. The claimed realtime design is currently an initial SSE snapshot plus a three-second polling loop. SSE errors close the stream and the client never reconnects. Every board read also runs a mutating reconciliation transaction under the shop/date advisory lock.
5. Several explicitly requested workflows are absent: database-backed skip-turn reason master data, cancellation/no-show, service changes after check-in/assignment, manager manual reassignment/override, and a complete multi-technician lifecycle.
6. Critical server workflows have little executable coverage. The default suite has 22 passing tests and 3 database-gated skips; coverage is 13.5% overall and only 2.76% in the primary database operations services.

### What is already working well

- The production build, lint, typecheck, Prisma schema validation, unit/default test suite, and dependency audit all passed.
- The non-mutating Playwright tablet smoke checks for the public board and kiosk passed 2/2.
- The live in-app browser showed the public board, kiosk service selection, kiosk contact step, and sign-in surfaces rendering and responding.
- Core routing logic correctly requires active, present, available staff with every required skill and has an explicit fairness sort.
- Check-in, payment confirmation, and staff commands use PostgreSQL transactions and a shop/business-date advisory lock.
- Public board data redacts customer name to a guest ticket label and clears the phone field.
- Argon2id password/PIN hashing, Zod validation, same-site HTTP-only auth cookies, origin checks, CSP/security headers, and nginx rate-limit configuration are present.
- The design system is consistent with the requested colors and touch-first intent. CSS includes 44/48/56/64px touch rhythm, safe-area padding, visible focus styles, reduced-motion handling, and responsive layouts.

### Release recommendation

Treat the current build as an internal pilot or supervised MVP. Before production launch, address all P0 findings, then complete the P1 reliability, workflow, and deployment gates. Do not expand into payment gateways, merchant card processing, a dedicated staff mobile app, payroll, inventory, or multi-tenant complexity during this hardening phase.

## 2. Overall Application Health Assessment

| Area | Assessment | Rationale |
|---|---:|---|
| Product concept fit | 4/5 | Stays focused on queue, attendance, skills, services, kiosk, staff board, and admin operations. |
| Core happy-path functionality | 3/5 | Check-in, routing, staff actions, payment confirmation, master data, and reporting are implemented. |
| Data integrity | 3/5 | Transactions, unique constraints, receipts, and advisory locks are good foundations; skip/attendance edge states remain unsafe. |
| Three-tablet synchronization | 2/5 | Polling works as a fallback, but SSE is snapshot-only and has no reconnect/event ordering model. |
| iPad UX foundation | 3.5/5 | Strong visual system and touch sizing; modal focus, narrow-layout behavior, and deep-link navigation need work. |
| Security posture | 2.5/5 | Good baseline controls, but stale JWT authorization and process-local PIN lockout are material risks. |
| Performance confidence | 2.5/5 | No production dataset benchmark; high-frequency reconciliation and in-memory historical filtering are code-based risks. |
| QA confidence | 2/5 | Build gates pass, but the critical transactional service layer and protected tablet journeys are under-tested. |
| Maintainability | 3/5 | Reasonable separation into app, domain, server services, and Prisma; duplicate config and unfinished compatibility helpers add drift. |

Health status: AMBER/RED for unattended production; AMBER for supervised pilot.

## 3. Discovery and Application Inventory

### 3.1 Technology and architecture

| Concern | Actual implementation | Evidence |
|---|---|---|
| Web framework | Next.js 16.4.0 App Router, React 19.2.0, TypeScript strict mode, Turbopack production build | package.json; next.config.mjs; tsconfig.json |
| UI | Client components with shared CSS in app/globals.css; lucide-react icons; no component framework | src/components; app/globals.css |
| Server/API | Next route handlers under app/api; server logic under src/server | app/api; src/server |
| Database | PostgreSQL 16 with Prisma 6.19.3; one shop configuration row; migrations in prisma/migrations | prisma/schema.prisma; docker/docker-compose.yml |
| Authentication | Auth.js Credentials provider; JWT strategy; ADMIN and STATION roles; staff PIN verification bridged by VerifiedStaffSession | src/server/auth.ts:10; src/server/services/prisma-operations.ts:513 |
| Password/PIN security | Argon2id; process-local five-failure/60-second PIN lockout | src/server/security.ts:3; src/server/security.ts:18 |
| State/routing | Pure domain state machines and turn-routing functions; server transaction orchestration | src/domain/state-machines.ts:3; src/domain/turn-routing.ts:9 |
| Realtime | SSE initial snapshot/keepalive plus board polling every three seconds; admin polling every ten seconds | app/api/sse/board/route.ts:8; app/(board)/board/page.tsx:71; app/(admin)/admin/page.tsx:74 |
| Idempotency | CommandReceipt database record keyed by scope/key at check-in, staff command, and payment boundaries; some UI keys are not retry-stable | prisma/schema.prisma:324; src/server/services/prisma-operations.ts:255 |
| Background jobs | Closing endpoint protected by cron secret or ADMIN; external scheduler assumed; no in-app scheduler | app/api/jobs/closing/route.ts:8; docs/project_state.md |
| Deployment | Standalone Next image, non-root container, migration/seed container, optional nginx proxy; TLS remains an operator gate | docker/Dockerfile:23; docker/docker-compose.yml:49; docker/nginx.conf:50 |
| PWA | Manifest and dummy service worker; no cache, offline queue, or offline read model | app/layout.tsx:5; public/sw.js:11 |
| Tests | Vitest unit/integration gates, Playwright Chromium/tablet project, opt-in PostgreSQL tests | package.json; playwright.config.ts:7; tests |

The repository directory is not itself a Git checkout: no .git directory was present under the target folder, and status/branch history could not be used as change evidence. This does not block source inspection, but it weakens auditability, rollback, and release traceability.

### 3.2 Route and screen inventory

| Module | Screen/feature | Current implementation | Completeness | Problems / status | Relevant files |
|---|---|---|---|---|---|
| Entry | Landing page | Marketing/role-preview page with links to kiosk, board, and sign-in; authenticated users redirect by role | Implemented | Preview uses static demo data and should be clearly labeled as illustrative | app/page.tsx:7; src/components/role-preview.tsx |
| Entry | Staff sign-in | Shared credentials form; redirects station to board and admin to admin | Implemented | Duplicate /admin/sign-in route renders the same panel; no visible lockout/rate-limit feedback | src/components/sign-in-panel.tsx; app/sign-in/page.tsx; app/admin/sign-in/page.tsx |
| Customer tablet | Service selection | Loads active service catalog; multi-select buttons with aria-pressed; duration/price; continue | Implemented | Load failure offers full page reload only; opening status is hardcoded “Open today”; currency is hardcoded dollar formatting | app/(kiosk)/kiosk/page.tsx:54; app/(kiosk)/kiosk/page.tsx:184 |
| Customer tablet | Customer identification | Debounced phone lookup; new guest name; returning guest name is read-only | Implemented | Public phone existence/name lookup is a privacy decision; no offline/retry state beyond reload | app/(kiosk)/kiosk/page.tsx:74; app/api/kiosk/customer-lookup/route.ts:8 |
| Customer tablet | Check-in result | POST with service IDs and idempotency key; ticket/status/assigned staff; 30-second reset | Implemented | Form state is lost on refresh; no user-facing reconnect/retry strategy after submit timeout | app/(kiosk)/kiosk/page.tsx:152 |
| Staff tablet | Public turn board | Current turns, up next, ticket/service/staff, public redaction, refresh timestamp | Implemented | Refresh timestamp uses browser timezone; board GET has write side effects; no SSE reconnect | app/(board)/board/page.tsx:57; src/server/services/prisma-operations.ts:159 |
| Staff tablet | Staff attendance tab | Present/available/busy cards; check-in/out commands; protected login | Implemented | Auto-close/accept attendance edge can leave inconsistent state; no supervisor override/reassignment | app/(board)/board/page.tsx:29 |
| Staff tablet | Accept / skip / finish | Verify staff and optional PIN/session; accept directly enters service; skip reason; finish routes next | Implemented, unsafe edge cases | Skip exclusion is not durable; no attendance re-check on accept; skip choices are hardcoded | app/(board)/board/page.tsx:234; src/server/services/prisma-operations.ts:589 |
| Staff tablet | Add support | Select available present staff during IN_SERVICE; upsert supporting relation | Partial | No remove support, support start/end, skill policy, or dedicated audit display | src/server/services/prisma-operations.ts:595; prisma/schema.prisma:226 |
| Admin tablet | Admin shell/navigation | Auth-protected shell; 11 client sections; responsive sidebar/horizontal nav | Implemented | Section is local client state only; no URL/deep links; possible sticky sidebar/topbar overlap on narrow layouts | app/(admin)/layout.tsx:12; app/(admin)/admin/page.tsx:11; app/globals.css:761 |
| Admin tablet | Overview/dashboard | KPIs, current activity, report period controls, 10-second refresh | Implemented | Three API requests per refresh; race protection is incomplete for parent refresh; fixed currency/timezone formatting | app/(admin)/admin/page.tsx:40 |
| Admin tablet | Attendance | List staff, check in/out, run closing review | Implemented | Attendance mutation uses a new Date.now idempotency key each click; closing endpoint does not enforce configured closing time | src/components/admin-management.tsx:97; app/api/jobs/closing/route.ts:14 |
| Admin tablet | Queue | Active appointment/service table; accepts/skips from board-like actions | Implemented | No manager manual reassignment, cancel, no-show, or service edit | app/(admin)/admin/page.tsx:183 |
| Admin tablet | Appointments/history | Day/month/range filters, client filtering/sorting, service/staff/payment views | Implemented, performance risk | Server loads full included records and filters in JavaScript; wide table requires horizontal scroll; no export | src/server/services/prisma-operations.ts:214; app/globals.css:425 |
| Admin tablet | Payments | Payment-pending list and card/cash confirmation with tip; admin-only | Implemented | Correctly stays out of station UI; no void/refund/partial payment, which should remain explicit out of scope | app/(admin)/admin/page.tsx:90 |
| Admin tablet | Reports | Day/month revenue, card/cash, service/staff breakdown, reconciliation | Implemented | Uses hardcoded dollar display; report semantics need confirmation because completedCount is derived from payment rows | src/server/services/prisma-operations.ts:431 |
| Admin tablet | Customers | CRUD, phone normalization, history modal, protected delete if appointment history exists | Implemented | Customer history fetch has no abort/request sequence; date/time display uses browser timezone | src/components/admin-management.tsx:168; src/components/admin-management.tsx:272 |
| Admin tablet | Staff | CRUD, PIN, skills, activation/deactivation, attendance/availability | Implemented, partial | Deactivation guard excludes PAYMENT_PENDING; no role/commission/schedule, correctly out of current scope | src/server/services/admin-operations.ts:317 |
| Admin tablet | Services | CRUD/archive, duration/price, icon picker, required skills | Implemented | Hardcoded USD labels; no configured shop currency; service mutation has no explicit client idempotency | src/components/admin-management.tsx:254 |
| Admin tablet | Skills | CRUD and relationship management | Implemented | No impact preview before removing/renaming; not covered by browser E2E | src/components/admin-access.tsx; app/api/admin/skills/route.ts |
| Admin tablet | Accounts | ADMIN/STATION CRUD, activation, role, password update | Implemented, security gap | Existing JWTs and verified sessions are not centrally revoked after deactivation/role change | src/components/admin-access.tsx; src/server/auth.ts:35 |
| Master data | Skip-turn reasons | Four hardcoded choices in board modal | Not implemented | Core context calls this master data, but no model/API/admin CRUD/persistence exists | app/(board)/board/page.tsx:27; prisma/schema.prisma |
| Workflow | Cancellation/no-show | No status, transition, route, UI, or endpoint | Not implemented | Skip is explicitly not cancellation; unresolved operational exits can remain active | src/domain/state-machines.ts:3; docs/lifecycle/BRD-FRD-v1.md |
| Workflow | Manager override/manual reassignment | No admin action/API found | Not implemented | Management cannot correct a bad assignment without indirect attendance/skill changes | app/api; src/server/services |
| Workflow | Change selected services after assignment | No mutation/API found | Not implemented | Explicitly requested workflow is absent; impacts service/price/staff snapshots | app/api; prisma/schema.prisma |
| Operations | Closing/reset | External/admin closing endpoint; business date computed by timezone | Partial | Stored closingTime/env closing time is not consulted by the endpoint; no scheduler state/observability | src/server/services/prisma-operations.ts:479; prisma/schema.prisma:336 |
| Realtime | Cross-tablet sync | Board poll + initial SSE; admin polling | Partial | No event bus, reconnect, event version, or stale response guard | app/(board)/board/page.tsx:71; app/api/sse/board/route.ts:16 |

### 3.3 User roles and permissions

| Role | Confirmed access | Risk / gap |
|---|---|---|
| Visitor/customer | Public landing, public board, kiosk, public service catalog, phone lookup | Kiosk lookup can reveal whether a phone exists and the stored name; needs an explicit privacy policy. |
| STATION | Sign in, view private board data, verify staff PIN/session, attendance, accept/skip/finish/add support | Token role is trusted for up to eight hours after account deactivation; no manager override. |
| ADMIN | Admin shell, CRUD, queue/history/reports/payments, board actions, closing | Same stale-token problem; admin mutation coverage is mostly untested in this audit. |
| Staff identity | Not a separate auth role; selected/verified by staff PIN through shared station tablet | Appropriate for shared tablet concept, but PIN lockout is process-local and sessions are not explicitly revoked on staff deactivation. |

### 3.4 State model inventory

Appointment states are CREATED, WAITING, ASSIGNED, IN_SERVICE, PAYMENT_PENDING, and COMPLETED. Turn states are ASSIGNED, ACCEPTED, SKIPPED, and FINISHED. Attendance states are ABSENT, PRESENT, and CHECKED_OUT. The implementation deliberately treats ACCEPT as a direct transition to service and retains ACCEPTED as the active turn marker.

There are no CANCELLED, NO_SHOW, VOID, REFUNDED, or MANAGER_REASSIGNED states. This is a confirmed scope gap, not a defect in the current state machine, until the salon decides whether those exits are required for MVP launch.

## 4. UI/UX Audit by Screen

### 4.1 Design strengths

- The pastel design system is coherent: dusty pink, ivory, lavender, sage, and dark mauve are tokenized and reused.
- Buttons and inputs are deliberately touch-sized; the refinement layer increases board/admin controls for tablet use.
- Icons come from lucide-react and are paired with visible text in most operational actions.
- Board tabs expose tablist/tab/tabpanel semantics; service selection exposes pressed state; most forms have labels and status/alert regions.
- Empty, loading, error, and success states exist on the public board, kiosk, and admin management modules.
- Safe-area and reduced-motion rules are present, which is important for fixed iPad hardware and accessibility.

### 4.2 Proposed low-fidelity tablet layouts

Management landscape:

    ┌──────────────────────────────────────────────────────────────────────┐
    │ Salon / business date / sync status / sign out                       │
    ├───────────────┬──────────────────────────────────────────────────────┤
    │ Queue         │ NOW SERVING     │ UP NEXT          │ STAFF            │
    │ Attendance    │ ticket + service│ next 4 tickets   │ present/available │
    │ Appointments  │ finish/support │ tap-to-filter    │ check-in/out      │
    │ Customers     │                 │                  │                  │
    │ Master data   │ exception banner: offline / stale / action conflict  │
    └───────────────┴──────────────────────────────────────────────────────┘

Staff turn board:

    ┌───────────────────────────────────────────────────────┐
    │ Today · Last synced 10:42 · Reconnecting / Live       │
    ├──────────────────────┬────────────────────────────────┤
    │ CURRENT              │ STAFF                         │
    │ A012  Gel + Art      │ Anna  Serving                 │
    │ Anna  35 min         │ Linda Available               │
    │ [Finish] [Support]   │ [Check in/out]                │
    ├──────────────────────┴────────────────────────────────┤
    │ UP NEXT: A013 …  A014 …  A015 …                       │
    └───────────────────────────────────────────────────────┘

Customer kiosk:

    ┌───────────────────────────────────────────────┐
    │ Wellness Salon                         Open?  │
    │ 1 Services  ─  2 Your turn  ─  3 Confirm     │
    │                                               │
    │ [icon] Basic manicure       30 min   $20      │
    │ [icon] Gel manicure         45 min   $35      │
    │                                               │
    │ 2 selected · 75 min · $55   [Continue]        │
    └───────────────────────────────────────────────┘

The wireframes are recommendations, not screenshots of an implemented design.

### 4.3 Findings by tablet experience

| ID | Screen/component | Current behavior / evidence | User problem | Recommended improvement | Benefit | Priority | Effort |
|---|---|---|---|---|---|---|---|
| UX-001 | Customer kiosk, service step | Live in-app browser at its narrow default viewport showed the progress label clipped on the right and service-card price content visually tight. The CSS uses horizontal overflow for the progress row at app/globals.css:778. | A kiosk customer may not understand the step sequence or read price content at a constrained viewport. This was observed at the available browser viewport, not a formal iPad device measurement. | Test portrait and landscape at the exact deployed iPad viewport; shorten labels at small widths, keep a visible scroll affordance, and add a sticky summary bar that never clips. | Fewer hesitation/errors at self-service. | P1 | S |
| UX-002 | Customer kiosk opening status | Header always renders “Open today” at app/(kiosk)/kiosk/page.tsx:184; the closing endpoint does not gate kiosk access. | Customers can start a check-in when the salon is closed or closing rules should apply. | Derive open/closed/closing-soon from one shop configuration and expose a clear closed state with manager override only if desired. | Prevents invalid arrivals and staff confusion. | P1 | S/M |
| UX-003 | Staff verification modal | Board modal has role=dialog and aria-modal at app/(board)/board/page.tsx:234, but no focus trap, Escape handler, or focus restoration. | Keyboard/assistive users and anyone using a hardware keyboard can tab behind the modal; returning focus is unpredictable. | Use a shared accessible dialog primitive: initial focus, focus trap, Escape, restore opener, and announce action-specific title. | Safer touch/keyboard operation and lower accidental actions. | P1 | S |
| UX-004 | Admin record/access/payment modals | Record/access modals listen for Escape and focus the heading, but still lack focus trap/restore at src/components/admin-management.tsx:260 and src/components/admin-access.tsx:142. The payment modal is similarly a dialog without a focus-management contract. | Repeated modal patterns drift and create inconsistent interaction behavior across management workflows. | Consolidate a single dialog component with tested focus and scroll behavior. | Consistency and accessibility with less duplication. | P1 | M |
| UX-005 | Admin narrow/tablet layout | On max-width 900px, the sidebar becomes sticky at top:0 and the admin topbar is also sticky at top:0; see app/globals.css:761 and app/globals.css:768. | Two fixed layers can overlap or consume excessive vertical space on portrait tablets; the active section can be visually separated from its title. | Make the navigation a single collapsible row or reserve an explicit stacked offset; test portrait/landscape with long labels. | More usable management surface on portrait iPad. | P1 | M |
| UX-006 | Admin tables/history | Generic tables have min-width 680/820px and appointment table min-width 1120px at app/globals.css:371 and app/globals.css:425. | Portrait users must horizontally scroll dense records; important actions can be far from the identity/status columns. | Prioritize columns by mode, pin identity/action columns, and offer a compact card/list view below a measured breakpoint. | Faster queue/history triage. | P1 | M |
| UX-007 | Operational status hierarchy | Board displays current, up-next, staff presence, and text status badges; this is a strength. However, the public board does not expose a clear “stale/offline” state if polling has stopped after an SSE error. | Staff may act on a stale shared board without knowing synchronization is degraded. | Add an explicit sync state: Live, Polling fallback, Reconnecting, Stale; disable destructive actions after a defined stale threshold. | Prevents actions on stale assignments. | P0 | S/M |
| UX-008 | Skip reason selection | The modal gives four hardcoded reasons at app/(board)/board/page.tsx:27 and app/(board)/board/page.tsx:239. | Managers cannot maintain local operational reasons; stored history can be inconsistent with business reporting. | Make skip reasons database master data with active/order fields; require one reason and optionally a short note. | Reliable skip analytics and shared vocabulary. | P1 | M |
| UX-009 | Kiosk error/retry | Services error offers a full window reload at app/(kiosk)/kiosk/page.tsx:187; phone lookup errors are inline; check-in submit errors do not provide a durable retry/offline state. | A temporary Wi-Fi or database hiccup can force a customer to restart or create uncertainty about whether a ticket was created. | Preserve form state, show retry with the same idempotency key, and display “checking status” after a timeout. | Fewer duplicate attempts and staff interventions. | P0 | M |
| UX-010 | Admin navigation/deep linking | Section is local React state at app/(admin)/admin/page.tsx:22; the URL does not identify the active module. | Refresh/back button loses context; managers cannot bookmark or share a specific module. | Encode section and filters in query parameters or nested routes; preserve date/filter state. | Faster daily navigation and recoverability. | P2 | M |
| UX-011 | Currency and time display | Admin screens use dollar strings and “Price (USD)” in src/components/admin-management.tsx:254 and reports use dollar formatting; date/time helpers use browser locale without shop timezone at src/components/admin-management.tsx:272 and app/(admin)/admin/page.tsx:301. | A salon configured for another currency or timezone can show incorrect amounts/dates, a business-critical trust issue. | Create one server-provided shop display config and shared formatters using currency/timezone. | Correct pricing and operational timestamps. | P1 | S/M |
| UX-012 | Landing RolePreview | The landing preview renders static sample queue/revenue/payment data in src/components/role-preview.tsx. | New users may read decorative content as live operational data. | Label it “Example workspace” or replace with a static product illustration with no realistic numbers. | Better expectation setting. | P2 | S |
| UX-013 | Accessibility semantics | Board service tabs and kiosk service pressed state are good. Landing preview tabs are buttons without a tablist/aria-selected contract; src/components/role-preview.tsx:11 also uses icon: any. | Screen-reader users may not understand the preview state; type looseness makes future UI changes less safe. | Add tab semantics or use disclosure buttons, remove any, and run axe/manual keyboard checks. | Better accessibility and maintainability. | P2 | S |
| UX-014 | Customer privacy at kiosk | Phone lookup returns found/name to any trusted-origin kiosk caller at app/api/kiosk/customer-lookup/route.ts:22. | A person standing behind a customer may learn that a phone exists and the stored name. | Choose a privacy policy: masked confirmation, last-name confirmation, opt-in recognition, or no lookup on public kiosk. Add rate/abuse telemetry. | Less personal-data exposure without removing repeat-guest convenience. | P1 | M |
| UX-015 | Action confirmation/feedback | Board actions use a modal and busy flag; admin actions use toasts and inline errors. Admin attendance generates a new idempotency key using Date.now at src/components/admin-management.tsx:101. | A retry after a network timeout is treated as a new command rather than a replay of the first command. | Persist one command key per user intent until a definitive response; distinguish retry from a new intent in copy. | Safer repeated taps/network recovery. | P0 | M |

### 4.4 Management tablet assessment

The management surface has the broadest information architecture and the most operational value. Its main usability risk is density: 11 sections, wide tables, multiple date/filter controls, and three refresh requests are all rendered inside one client page. The landscape experience should be the primary supported mode, with a deliberately reduced portrait view rather than a squeezed desktop table. Queue and attendance should remain one or two taps from the first screen; history/report filtering can be secondary.

### 4.5 Staff turn-display assessment

The board is the strongest current surface visually and was confirmed live in the browser. It exposes a clear current/up-next hierarchy and staff attendance tab. The main risk is operational trust: a board that looks live but can silently fall back to polling or stale state is more dangerous than an obviously disconnected board. Staff action dialogs also need one shared, accessible interaction contract.

### 4.6 Customer kiosk assessment

The kiosk flow is appropriately short: select services, provide phone/name, receive a ticket. It is not overloaded with management concepts, and the service cards are touch-friendly. It needs a real open/closed decision, retry/idempotency recovery, exact iPad viewport QA, privacy handling for phone lookup, and a more resilient completion screen.

## 5. Business Workflow Audit

### 5.1 End-to-end workflow comparison

| ID | Current flow | Expected flow | Gap | Risk | Recommended change |
|---|---|---|---|---|---|
| WF-001 Check-in deduplication | Transaction locks shop/date, normalizes phone, checks an active non-completed appointment for the business date, then returns the existing ticket; idempotency receipts replay the same response | Repeated tap, browser retry, and concurrent submissions must yield one intended queue record | Duplicate protection is implemented, but the rule is “one active appointment per customer per business date,” not merely “same request once” | A legitimate second visit/service later the same day is silently merged; product behavior may surprise staff | Decide one-visit/day policy. If one visit/day is correct, show “already checked in” explicitly; otherwise use a visit/session rule. Test both idempotency and legitimate repeat visit |
| WF-002 Service matching | Active staff must be present, available, active, and contain every required skill; fairness sorts never-served then oldest finished/assigned | Exact skillset and current attendance/availability should be enforced at assignment time | Core logic is correct; persistence/reconciliation paths must preserve the same exclusions | Wrong technician or perceived unfairness if later code path bypasses exclusions | Centralize assignment command and add database integration tests for multi-skill/concurrent cases |
| WF-003 Double assignment | Transaction-scoped advisory lock serializes reads/writes for shop/business date | Concurrent kiosk/board/admin commands must never claim the same staff simultaneously | Good lock foundation; the lock serializes the whole day and may become contention hotspot; UI/API paths are not fully tested | Safe correctness today is not proven under real concurrent commands | Keep lock for MVP, measure wait time, then narrow lock/row design only if needed |
| WF-004 Staff check-in | Attendance PRESENT plus service state AVAILABLE; check-in reroutes waiting/assigned appointments | A staff member becomes eligible only after check-in and should be assigned fairly | Reconcile and check-in may reroute; no visible explanation of which waiting turns changed | Sudden reassignment and staff confusion | Return assignment-change summary/audit in admin UI and test concurrent check-in |
| WF-005 Staff check-out | Manual check-out blocks ASSIGNED, IN_SERVICE, PAYMENT_PENDING; auto-close only blocks IN_SERVICE/PAYMENT_PENDING | Any active assignment, including a turn waiting for acceptance, should remain linked to an eligible staff member or be safely rerouted | Auto-close can check out ASSIGNED staff; ACCEPT does not re-check PRESENT attendance | Checked-out staff can still own/accept a turn; queue and attendance disagree | Include ASSIGNED in close blocking or atomically unassign/reroute before checkout; re-check attendance in ACCEPT |
| WF-006 Accept/start | Staff action validates active turn and assignment, then turns ASSIGNED to ACCEPTED and service to IN_SERVICE | Only present assigned staff should accept; repeated taps should replay safely | No attendance/presence validation in the action branch after the staff lookup | Staff whose attendance changed can start service | Validate current attendance and active staff inside the locked transaction; add race test |
| WF-007 Skip | Turn becomes SKIPPED with reason; service becomes WAITING; current staff is released; routeAfterSkip excludes that staff for one call | Skipped staff should not immediately receive the same service unless a manager explicitly overrides | Later reconcile calls routeAppointmentServices without excluded staff and can select the skipped staff again | Repeated skip loop, unfair queue, loss of trust | Persist an exclusion/cooldown/turn-attempt record and make every routing path honor it |
| WF-008 Skip reasons | Four client-side strings are sent as free text and stored on Turn.reason | Reasons are shared, maintainable, reportable master data | No SkipReason table, CRUD, active flag, or ordering | Inconsistent reporting and no local policy control | Add master-data lifecycle or explicitly remove it from the product context |
| WF-009 Finish | ACCEPTED turn becomes FINISHED, service COMPLETED, staff finish timestamp updates, next waiting service is routed | Completion should advance the queue and preserve staff fairness | Core path exists; no explicit service duration/late completion exception or manager correction | Operationally acceptable for MVP, but reporting cannot distinguish on-time/late | Keep simple for MVP; add audit and test next-service routing under concurrent finish |
| WF-010 Multiple services | AppointmentService rows, service snapshots, per-service turns and staff, aggregate status | Each selected service should route and complete independently while one customer remains one visit | UI supports display and actions; changing/removing a selected service after assignment is absent | Staff cannot correct a wrong selection without manual work | Add pre-start edit command with audit, price/snapshot policy, and re-route semantics |
| WF-011 Supporting technician | ADD_SUPPORT upserts a relation and marks staff BUSY while appointment is IN_SERVICE | A second available technician can help, be visible, and be released at the right time | No remove/end support action, support skill policy, or distinct duration/audit lifecycle | Staff can remain busy or reporting can over/under-attribute work | Define support start/end and release rules; keep one appointment payment |
| WF-012 Payment | All services complete -> PAYMENT_PENDING; admin confirms one card/cash payment; payment receipt prevents duplicate; appointment COMPLETED | Payment should be one admin-controlled terminal action in current scope | Good baseline; no void/refund/partial payment, which are not required unless decided | Manual correction path is absent if payment is wrong | Keep out of scope for MVP; add a manager correction/audit policy before launch |
| WF-013 Cancellation/no-show | No transition/API/UI; skip explicitly does not cancel | Staff needs a way to clear a guest who leaves or does not return | Not implemented | Queue can remain open indefinitely and reports count operationally unresolved work | Make a business decision, then add states, reason, actor, timestamp, and report semantics |
| WF-014 Manager override/reassignment | No direct command/API; admin can affect staff/attendance/master data only | Manager should correct a wrong skill assignment or staff absence without side effects | Not implemented | Operational recovery depends on manipulating unrelated records | Add a locked admin command with reason, audit, and explicit fairness impact |
| WF-015 Daily reset/history | Business date uses SHOP_TIMEZONE; historical date/month/range pages exist; external closing endpoint | New business date should isolate queue and preserve history; closing should be scheduled safely | Closing endpoint does not read ShopConfig.closingTime or enforce when it may run; no scheduler state/observability | Early/missed scheduler call can close the wrong operational state | Make close job idempotent and time-aware, record last run/result, and alert on missed run |
| WF-016 Cross-tablet synchronization | Board fetch calls reconciliation then reads; SSE sends initial snapshot/keepalives; board polls every 3s; admin polls every 10s | Mutations should propagate quickly, in order, with reconnect and stale-state visibility | No event bus/version/reconnect; reads write state | Duplicate work, lock contention, stale action, inconsistent display | Separate read reconciliation from mutation, publish versioned events, reconnect with backoff, and reject stale commands |
| WF-017 Browser refresh/session interruption | Board reload reconstructs from DB; kiosk React state resets; service worker does not cache | Refresh/network interruption should recover without duplicate check-in or lost user intent | Kiosk cannot restore selected form/idempotency state; board has no explicit stale recovery | Customer may repeat a submission or abandon a valid ticket | Store short-lived kiosk intent locally and offer status lookup; keep idempotency key until definitive response |

### 5.2 Explicit edge-case assessment

| Edge case | Finding | Classification |
|---|---|---|
| Duplicate check-in / duplicate queue | Database transaction, advisory lock, normalized phone, active-appointment check, and optional CommandReceipt materially reduce duplicates | Confirmed protection; one-active-visit behavior needs business decision |
| Double technician assignment | Advisory lock is a sound guard in the database path; no real concurrent staff-action test ran because DB tests are opt-in | Partially confirmed; production concurrency confidence is untested |
| Repeated taps | Board modal uses a stable key per opened intent; payment is idempotent on server; admin attendance generates a new timestamp key | Confirmed inconsistency |
| Incorrect skillset matching | Domain function requires every skill and has unit coverage | Confirmed good baseline; persistence integration not tested |
| Staff clock-out during active service | Manual guard includes ASSIGNED/IN_SERVICE/PAYMENT_PENDING; automatic guard omits ASSIGNED | Confirmed code defect/risk |
| Customer changes service after assignment | No mutation found | Not implemented; business decision needed |
| Multiple technicians | SupportingStaff relation and add action exist | Partial implementation |
| Repeated skips | No cooldown or maximum skip policy; routing exclusion is one transaction only | Confirmed risk and business policy gap |
| Browser refresh | Database state rehydrates board; kiosk local form does not persist | Confirmed behavior |
| Network disconnect/recovery | Fetch errors display in some surfaces; no offline command queue; SSE closes without reconnect | Confirmed gap |
| Stale data/race | Board/admin requests can overlap; no abort or sequence guard in board parent/admin refresh; history has an incomplete request-race defense | Code-based hypothesis with clear prevention requirement |

## 6. Missing Features and Improvement Opportunities

### A. Must-have for MVP reliability

| Opportunity | Value | Effort | Dependency |
|---|---|---:|---|
| Durable skip exclusion/cooldown and routing tests | Stops unfair repeated assignment | M | Decide policy for same-service repeat skip |
| Immediate auth/session revocation | Removes deactivated-account access window | M | Add session version/revocation strategy |
| Attendance-safe accept/auto-close behavior | Keeps staff eligibility and turn ownership consistent | S/M | Define whether assigned turns block closing |
| Reconnect/stale-state contract | Makes three tablets trustworthy during network events | M | Define stale threshold and command conflict copy |
| Stable retry keys and action status recovery | Prevents duplicate commands after timeout | M | Shared mutation client or per-intent state |
| Database-backed skip reasons | Completes stated master data | M | Admin CRUD and seed policy |
| Exact tablet viewport/accessibility QA | Prevents kiosk/management failures at physical stations | S/M | Confirm supported iPad models/orientations |
| PostgreSQL integration suite for critical commands | Proves concurrency and transitions beyond pure functions | L | Disposable database fixture and cleanup |

### B. High-value operational improvement

| Opportunity | Value | Effort |
|---|---|---:|
| Manager manual reassignment with reason/audit | Recovery when a technician leaves or assignment is wrong | M |
| Cancellation/no-show workflow | Keeps queue/history operationally accurate | M |
| Pre-start service edit/change | Corrects customer selection without deleting history | M |
| Closing scheduler observability and configured-time enforcement | Prevents missed/early closing actions | S/M |
| Server-side appointment filtering/pagination and targeted indexes | Keeps history usable as data grows | M |
| Shared currency/timezone/open-status formatter | Prevents trust-damaging financial/date errors | S |
| Action conflict feedback and last-updated age | Helps staff understand stale data | S |
| Customer kiosk privacy mode | Reduces personal-data exposure while preserving recognition | M |

### C. Nice-to-have post-MVP

- Wait-time/ETA estimates once historical timing data is trustworthy.
- Queue announcements or a read-only customer display mode distinct from staff controls.
- Exportable operational reports and daily close checklist.
- Staff shift schedule/availability windows, only after attendance semantics stabilize.
- Per-service performance and repeat-visit analytics.
- Offline read-only shell with cached catalog and an explicit online-only mutation boundary.

### D. Avoid for now

- Payment gateway, merchant card processing, stored card data, refunds/void workflows, or tips settlement integrations.
- Dedicated mobile app for each technician; the shared staff tablet meets the stated concept.
- Payroll, commissions, inventory, loyalty, bookings, and multi-tenant architecture.
- Full offline-first replicated database; a resilient retry/status pattern is enough for this MVP.
- Complex event-sourcing or microservices; the current modular monolith plus PostgreSQL is simpler and sufficient after hardening.

## 7. Frontend Performance Findings

No production-size browser performance benchmark was available. Items below are code-based findings unless marked measured.

| ID | Problem | Evidence | Impact | Proposed optimization | Priority | Effort | Validation |
|---|---|---|---|---|---|---|---|
| FE-001 | Board polling and SSE-triggered fetches can overlap | app/(board)/board/page.tsx:57; app/(board)/board/page.tsx:75; app/(board)/board/page.tsx:80 | Slow requests can create concurrent fetches and stale response overwrites; each fetch also triggers server reconciliation | Abort previous request or serialize refreshes; use one sync client with sequence/version checking | P1 | S/M | Throttle network in Playwright; assert latest response wins and request count stays bounded |
| FE-002 | SSE closes permanently on error | app/(board)/board/page.tsx:77 | A transient network interruption leaves only polling; if polling also fails, board becomes stale without a reconnect state | Reconnect with bounded exponential backoff and visible state; keep polling as explicit fallback | P0 | S | Browser disconnect/reconnect test; measure recovery time |
| FE-003 | Admin refresh makes three no-store requests every ten seconds | app/(admin)/admin/page.tsx:50; app/(admin)/admin/page.tsx:75 | Unnecessary database and network work across a shared tablet; redundant payloads | Provide one dashboard read model or pause background refresh when hidden; request only active section | P1 | M | Network trace with 30-minute idle session; count requests/payload bytes |
| FE-004 | Admin refresh has no AbortController/sequence guard at parent level | app/(admin)/admin/page.tsx:40 | A slow old report/date response can overwrite a newer filter selection | Abort or sequence each refresh and keep the selected query key with the response | P1 | S | Delayed-response test with two date changes |
| FE-005 | History fetch is broad and client-heavy | src/components/admin-management.tsx:168; src/components/admin-management.tsx:272 | Large customer history can retain stale responses and render too much data | Add request sequence/abort, server pagination, and shared formatter | P1 | S/M | Simulate delayed responses and 1,000-history fixture |
| FE-006 | Wide tables rely on horizontal overflow | app/globals.css:371; app/globals.css:425 | Touch scrolling and locating actions becomes slow on portrait iPad | Responsive compact row/card mode and pinned identity/action columns | P1 | M | Screenshot/interaction test at supported tablet widths |
| FE-007 | PWA service worker does no caching | public/sw.js:11 | No performance/offline benefit; a failed asset/catalog load requires a full reload | Either remove the PWA claim or implement a deliberately small cache for shell/catalog only | P2 | M | Offline asset/catalog test; verify mutations remain online-only |
| FE-008 | Window load listener has no cleanup | src/components/PWAProvider.tsx:6 | Minor lifecycle leak if provider remounts; console logging is noisy | Register once with cleanup and production-safe logging | P2 | S | Mount/unmount test and browser console audit |

Measured frontend/runtime evidence:

- Playwright iPad-gen-7 project: public board and kiosk smoke tests passed 2/2 in 2.9 seconds.
- Live in-app browser: board, kiosk service step, kiosk contact step, and sign-in rendered and responded; this was a manual browser observation rather than a formal latency benchmark.
- No real device frame-rate, input latency, bundle-size, or production-network measurement was run.

## 8. Backend and Database Performance Findings

| ID | Problem | Evidence | Impact | Proposed optimization | Priority | Effort | Validation |
|---|---|---|---|---|---|---|---|
| BE-001 | Read path mutates by reconciling assignments | src/server/services/prisma-operations.ts:159; src/server/services/prisma-operations.ts:161; src/server/services/prisma-operations.ts:414 | Every board GET/SSE connection takes the shop/date advisory lock and may update turns; three tablets amplify lock contention and make reads non-idempotent | Move reconciliation to mutation boundaries and a scheduled repair command; make reads pure | P0 | M | Log transaction duration/lock wait; compare board GET p50/p95 before/after |
| BE-002 | Reconciliation routes every waiting appointment and reloads staff inside each service loop | src/server/services/prisma-operations.ts:393; src/server/services/prisma-operations.ts:394; src/server/services/prisma-operations.ts:426 | O(appointments × services) queries under one transaction; same path causes skip regression | Load eligible staff once per transaction or use a routing snapshot; persist exclusions | P1 | M | Query count test and 1,000-appointment fixture |
| BE-003 | Historical appointments load heavy includes then filter/sort in JavaScript | src/server/services/prisma-operations.ts:214; src/server/services/prisma-operations.ts:217; src/server/services/prisma-operations.ts:221 | Memory, DB transfer, and serialization grow with date range; admin UI receives more than it needs | Push filters/order/pagination into Prisma; use a summary read model for reports | P1 | M | EXPLAIN/query count; 1-day/1-month/1-year fixture benchmarks |
| BE-004 | Appointment code generation scans all day codes | src/server/services/prisma-operations.ts:182 | Check-in cost grows linearly with daily volume; lock prevents duplicates but does not make scan cheap | Maintain a daily sequence row or use a database sequence scoped by business date | P2 | M | Benchmark 10,000 appointments; preserve A001 format |
| BE-005 | Assignment/relationship query indexes are incomplete | prisma/schema.prisma:185; prisma/schema.prisma:226; prisma/schema.prisma:220 | Queries by AppointmentService.primaryStaffId and supporting StaffId may scan relation rows as history grows | Add targeted indexes only after EXPLAIN confirms need; include business date/status access path | P2 | S/M | EXPLAIN ANALYZE against representative data |
| BE-006 | One advisory lock key serializes all operations for a shop/date | src/server/services/turn-engine.ts:5; src/server/services/turn-engine.ts:14 | Correctness is strong but high-volume taps and reads can queue behind one lock | First remove read-side reconciliation; only narrow lock after measuring contention | P1 | M/L | pg_stat_activity/lock wait metrics under concurrent test |
| BE-007 | Closing configuration is duplicated and not enforced | prisma/schema.prisma:336; docker/docker-compose.yml:30; src/server/services/prisma-operations.ts:479 | Operators may believe changing configuration changes close behavior when endpoint simply closes now | Choose DB config or env as source of truth; enforce schedule or return “manual review” semantics | P1 | S/M | Time-boundary tests with fake clock |
| BE-008 | /api/services has no route-level error mapping | app/api/services/route.ts:7 | Database failure becomes an unstructured framework error and kiosk cannot distinguish retryable failure | Catch/log with correlation ID and return stable 503 payload | P2 | S | Fault injection test |
| BE-009 | Retention policy absent for operational receipts/sessions/audit | prisma/schema.prisma:295; prisma/schema.prisma:324; docs/project_state.md | Tables grow indefinitely; old command responses may contain operational data | Define retention/archive policy and scheduled cleanup with audit-safe boundaries | P2 | S/M | Seed aged rows; verify cleanup and replay behavior |

No production database query latency, lock wait, API payload-size, or memory benchmark was available. These are hypotheses requiring the validation methods above, not measured incidents.

## 9. Realtime Synchronization and Concurrency

### Current architecture

1. Browser calls GET /api/board.
2. GET /api/board calls getDbBoardState.
3. getDbBoardState calls reconcileDbAssignments before reading.
4. Browser opens /api/sse/board; the server sends one snapshot and keepalives.
5. Every three seconds the board polls GET /api/board.
6. Admin refreshes three endpoints every ten seconds.
7. Mutations are transaction-scoped and serialized by a shop/business-date advisory lock.

This is a workable small-MVP consistency strategy, but it combines a write-heavy repair loop with a read endpoint and calls the SSE path “live” even though it does not publish later changes. There is no event bus or durable event/version number. Event ordering is therefore implicit in database read timing, not explicit in the client contract.

### Concurrency findings

| ID | Finding | Classification | Required outcome |
|---|---|---|---|
| CON-001 | Skip exclusion disappears after the skip transaction; reconcile can reassign the skipped staff | Confirmed by code path | Persist and honor exclusion across every route path |
| CON-002 | Advisory lock protects database operations for one shop/date | Confirmed design | Keep as baseline; instrument lock wait before optimizing |
| CON-003 | Pure AssignmentMutex test is not evidence of multi-process PostgreSQL correctness | Confirmed test limitation | Replace/augment with real PostgreSQL concurrent command tests |
| CON-004 | Board polling can overlap and stale responses can win | Code-based hypothesis | Abort/sequence refreshes and test delayed responses |
| CON-005 | SSE has no reconnect or Last-Event-ID/version | Confirmed | Add reconnect/backoff and sync version |
| CON-006 | Idempotency receipts are durable but no cleanup policy exists | Confirmed | Retain enough for replay window, then clean/archive |
| CON-007 | Admin attendance key uses a new Date.now key for each retry | Confirmed | Keep a stable intent key across retry |
| CON-008 | Account/staff changes do not clearly invalidate active sessions | Confirmed security gap | Revalidate/revoke session before accepting any protected command |

### Recommended MVP sync contract

- Every board snapshot includes a monotonic version or last mutation timestamp.
- Every mutation returns the authoritative updated snapshot/version or a conflict reason.
- Board refresh requests are serialized or abortable.
- The client shows Live / Polling fallback / Reconnecting / Stale.
- SSE reconnects with exponential backoff; polling remains the bounded fallback.
- Reconciliation is a scheduled/explicit repair operation, not a side effect of every read.
- A command with an unknown outcome can be queried/replayed using its original idempotency key.

## 10. Security and Code Quality Findings

### 10.1 Security strengths

- Argon2id is configured for password/PIN hashing.
- Auth cookies are HTTP-only and SameSite strict; production secure cookie naming is present.
- Mutation endpoints check trusted origin and validate JSON with Zod.
- Public board redacts customer names/phones.
- Admin, station, and kiosk surfaces are separated by route/role checks.
- Security headers include CSP, frame denial, nosniff, referrer policy, and permissions policy.
- Nginx has API/kiosk rate limits in the optional proxy.
- Dependency audit returned zero vulnerabilities for production dependencies on 2026-10-10.

### 10.2 Important findings

#### SEC-001 — Existing JWTs outlive account deactivation or role changes

- Category: Security / authorization
- Severity: P0
- Affected workflow: ADMIN/STATION sign-in, every protected route, account deactivation/role change
- Current implementation: Auth.js uses JWT strategy with maxAge eight hours at src/server/auth.ts:10 and assigns role into the token at src/server/auth.ts:35. The session callback trusts token.sub/token.role at src/server/auth.ts:39. getAdminActor checks only auth() output at src/server/admin-auth.ts:3.
- Evidence: authorize checks isActive only at login at src/server/auth.ts:23 and src/server/auth.ts:27; there is no per-request database revalidation or session version check.
- Problem/business impact: A deactivated admin or station account can continue using its old token until expiration. A role downgrade can leave admin access active. This is a confirmed authorization design gap, not a reproduced exploit.
- Recommended solution: Add a revocation/session-version field or short-lived session with server-side revalidation. Invalidate station verified sessions when account/staff status changes. Apply the same check in route authorization helpers.
- Estimated effort: M
- Dependencies: Decide session lifetime and acceptable offline station behavior.
- Acceptance criteria: A deactivated account receives 401/403 on the next protected request; role changes take effect without waiting eight hours; active sessions are covered by automated tests.

#### SEC-002 — PIN lockout is process-local

- Category: Security / abuse control
- Severity: P1
- Affected workflow: shared staff PIN verification
- Current implementation: pinAttempts is an in-memory Map at src/server/security.ts:18, with a five-failure/60-second lock at src/server/security.ts:21.
- Problem/business impact: Multiple app instances do not share attempts, and a restart clears the lock. The current deployment is one app container, but scaling or an attacker targeting instances weakens the control.
- Recommended solution: Store bounded attempt counters in PostgreSQL or a shared rate-limit store keyed by staff/device/IP, with a clear privacy/retention policy. Keep the local check as a fast path if useful.
- Estimated effort: M
- Dependencies: Deployment topology and rate-limit ownership.
- Acceptance criteria: Repeated failures across instances share a lock decision; successful verification resets the counter; lockout is observable but does not expose sensitive detail.

#### SEC-003 — TLS and network exposure remain deployment gates

- Category: Security / deployment
- Severity: P1
- Affected workflow: all tablet traffic and database exposure
- Current implementation: docker/docker-compose.yml publishes PostgreSQL on 5432 and app on 3000 at lines 8 and 40; optional nginx listens on HTTP 80 and comments that TLS is a human gate at docker/nginx.conf:50.
- Problem/business impact: Staff credentials, PIN/session cookies, and customer data are at risk on an untrusted network if operators deploy the sample topology directly.
- Recommended solution: Bind PostgreSQL to the private network only, terminate TLS before tablets, set secure forwarded headers/cookies, and make production deployment fail closed without certificates.
- Estimated effort: S/M
- Dependencies: Hosting/certificate choice.
- Acceptance criteria: Tablets use HTTPS; direct database/app ports are not publicly reachable; HSTS is only sent when HTTPS is actually active; deployment checklist verifies this.

#### SEC-004 — Public customer lookup enables phone enumeration

- Category: Privacy / kiosk abuse
- Severity: P1 pending decision
- Affected workflow: customer self-check-in
- Current implementation: unauthenticated trusted-origin GET returns found and stored name at app/api/kiosk/customer-lookup/route.ts:8 and src/server/services/prisma-operations.ts:154.
- Problem/business impact: Anyone with kiosk access can test phone numbers and observe whether a customer is known. Nginx rate limits reduce volume but do not eliminate local observation.
- Recommended solution: Decide between masked confirmation, a second confirmation field, no lookup, or accepting the privacy tradeoff. Log/rate-limit lookup abuse.
- Estimated effort: M
- Dependencies: Customer recognition policy.
- Acceptance criteria: Product owner approves the privacy behavior; automated test verifies response does not expose more than intended.

#### SEC-005 — CSP permits unsafe inline scripts/eval

- Category: Security hardening
- Severity: P2
- Affected workflow: browser execution
- Current implementation: proxy.ts:6 allows unsafe-inline and unsafe-eval in script-src.
- Problem/business impact: This weakens XSS defense if a future injection bug occurs.
- Recommended solution: Verify Next.js requirements, then move to nonces/hashes or the narrowest compatible policy; do not loosen further.
- Estimated effort: M
- Dependencies: Next build/runtime behavior.
- Acceptance criteria: Production CSP passes a browser security review without unsafe-eval where feasible and all app routes still render.

#### SEC-006 — Operational receipt/session retention is undefined

- Category: Data governance
- Severity: P2
- Affected workflow: CommandReceipt, VerifiedStaffSession, AuditEvent
- Evidence: prisma/schema.prisma:295 and prisma/schema.prisma:324; docs/project_state.md explicitly lists cleanup as technical debt.
- Problem/business impact: Indefinite growth and unnecessary retention of response payloads/session records.
- Recommended solution: Set retention windows and a scheduled cleanup job that never deletes required audit evidence or active replay keys.
- Estimated effort: S/M
- Dependencies: Audit/legal retention policy.
- Acceptance criteria: Cleanup is idempotent, observable, and tested against active/expired records.

### 10.3 Code quality and architecture

| ID | Finding | Impact | Priority |
|---|---|---|---|
| CQ-001 | ShopConfig has timezone, closingTime, currency, and roundRobinEnabled, while code/search evidence shows currency/closingTime/roundRobinEnabled are not consumed and timezone mainly comes from SHOP_TIMEZONE | Configuration appears authoritative but does not change behavior; drift is likely | P1 |
| CQ-002 | src/server/services/turn-engine.ts:22 contains a generic in-memory withIdempotency helper, while production operations use CommandReceipt; AssignmentMutex is used by a unit-style concurrency test | Two concurrency/idempotency stories can mislead maintainers and test reviewers | P2 |
| CQ-003 | Sign-in is exposed at /sign-in and /admin/sign-in with the same component | Duplicate route surface and future copy/security drift | P2 |
| CQ-004 | seed-kpis.ts is not a package script and creates appointments without the full AppointmentService shape expected by the current model | Fixture/dead-code drift can mislead data setup and reporting validation | P2 |
| CQ-005 | Logging has basic database warning/error output but no request ID, mutation duration, lock wait, sync version, or audit dashboard | Production diagnosis of tablet conflicts will be slow | P1 |
| CQ-006 | One modular monolith is appropriate; introducing microservices/event sourcing now would be overengineering | Preserve simplicity while adding targeted reliability primitives | P3 guidance |

## 11. QA and Test Coverage Gaps

### 11.1 Checks executed and actual outcomes

| Command/check | Actual outcome |
|---|---|
| npm run lint | PASS |
| npm run typecheck | PASS |
| npm test -- --run | PASS: 8 test files passed, 2 test files skipped; 22 tests passed, 3 skipped |
| npm run test:coverage | PASS: same tests; 13.5% statements/lines, 60.31% branches, 14.28% functions |
| npx prisma validate | PASS; Prisma warns package.json prisma configuration is deprecated for Prisma 7 |
| npm run build | PASS; Next.js 16.4.0 production route generation completed |
| npx playwright test tests/e2e/authorization.spec.ts --project=tablet --grep "visitor can view|kiosk stays" --workers=1 | PASS: 2/2 non-mutating iPad-gen-7 project tests |
| npm audit --omit=dev --omit=optional --audit-level=high | PASS: found 0 vulnerabilities |
| Docker/container health probe from the restricted shell | NOT TESTED; Docker socket access was unavailable to the shell. Runtime UI was verified through the in-app browser instead. |
| Database-backed Vitest with RUN_DB_TESTS=true | NOT RUN; those tests create/delete records and require a disposable database approval/fixture |
| Mutating Playwright specs | NOT RUN during audit to avoid writing customer/appointment data |

### 11.2 Coverage result interpretation

Coverage is adequate for the small pure-domain layer but not for the operational system:

- src/server/services/prisma-operations.ts: 0.29% statement/line coverage in the reported run.
- src/server/services/admin-operations.ts: 3.83% statement/line coverage.
- Components: 0% in the reported Vitest coverage because browser tests are separate.
- Domain layer: 45.61% statements and 73.68% functions overall.

The PostgreSQL tests are valuable but opt-in. The current postgres test covers migrated catalog/advisory lock capability and concurrent same-phone kiosk submissions, but it does not cover staff action transitions, skip durability, payment, closing, reports, or multi-staff support.

### 11.3 Prioritized test matrix

| Priority | Scenario | Expected assertion | Current evidence | Gap |
|---|---|---|---|---|
| P0 | Two kiosks submit same phone simultaneously | One appointment, deterministic response, no duplicate service/turn | Opt-in tests/integration/postgres.test.ts:28 | Not run in this audit; add CI fixture and additional service-selection cases |
| P0 | Two tablets accept same assigned turn | One ACCEPTED/IN_SERVICE result; second gets idempotent/conflict result | None | Missing |
| P0 | Skip then board read/reconcile | Skipped staff cannot immediately reacquire same service | Unit only tests routeAfterSkip | Missing regression test |
| P0 | Deactivate signed-in account | Existing token is rejected | None | Missing |
| P0 | Auto-close with ASSIGNED turn | Policy is enforced and assignment is not orphaned | None | Missing |
| P0 | Network timeout after check-in POST | Retry same key returns same ticket; no duplicate | Key exists in code | Missing browser/API test |
| P1 | Staff accept after checkout/auto-close | Rejected and no IN_SERVICE state | None | Missing |
| P1 | Staff skips repeatedly | Policy/cooldown/manager override behaves as specified | None | Business rule and test missing |
| P1 | Multi-skill service | Partial-skill staff never assigned in database path | Pure turn-routing test exists | Integration missing |
| P1 | Add support/remove or finish support | Support is eligible, visible, released, audited | Add-only code | Missing lifecycle |
| P1 | Payment double tap/retry | One Payment row; terminal state consistent | No service test | Missing |
| P1 | Customer service edit before start | Snapshot/amount/turns update atomically | Feature absent | Missing feature/test |
| P1 | Cancellation/no-show | State, reason, audit, reporting, next-turn behavior | Feature absent | Business decision |
| P1 | Browser refresh and SSE reconnect | Board recovers; stale state visible; reconnect bounded | Public smoke only | Missing |
| P1 | Admin date/filter race | Newest query wins; old response cannot overwrite | Some appointment request guard exists | Parent/history coverage missing |
| P1 | Portrait/landscape tablet | No clipped primary actions; tables have usable compact mode | 2 public tablet smoke tests | Protected/admin screens missing |
| P1 | Dialog accessibility | Focus enters/traps/restores; Escape; screen-reader label | None | Missing |
| P2 | Configured currency/timezone | All price/date surfaces use shop settings | None | Missing |
| P2 | Data retention | Expired sessions/receipts clean without breaking replay | None | Missing |
| P2 | Rate-limit/PIN lockout across instances | Shared policy | Unit security not exercised | Missing |

## 12. Top 10 Highest-Impact Improvements

Scoring: Business impact, UX impact, reliability/risk reduction, and evidence confidence use 1–5 where 5 is highest. Effort uses 1–5 where 5 is largest.

| Rank | ID / improvement | Business | UX | Reliability | Effort | Confidence | Priority |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | REL-001 Durable skip exclusion/cooldown across reconciliation | 5 | 5 | 5 | 3 | 5 | P0 |
| 2 | SEC-001 Revalidate/revoke stale JWT roles and active accounts | 5 | 2 | 5 | 3 | 5 | P0 |
| 3 | REL-002 Make auto-close and ACCEPT attendance-safe | 5 | 4 | 5 | 2 | 5 | P0 |
| 4 | REL-003 Sync contract: reconnect, stale state, versioned snapshots, pure reads | 5 | 5 | 5 | 3 | 5 | P0 |
| 5 | REL-004 Stable idempotency/retry recovery across kiosk, attendance, staff commands, payment | 5 | 5 | 5 | 3 | 5 | P0 |
| 6 | OPS-001 Add cancellation/no-show and manager reassignment after product decision | 5 | 4 | 4 | 3 | 4 | P1 |
| 7 | PERF-001 Server-side history filtering/pagination plus measured indexes | 4 | 4 | 4 | 3 | 4 | P1 |
| 8 | CFG-001 Single source of truth for timezone/currency/closing/open status | 5 | 4 | 4 | 2 | 5 | P1 |
| 9 | QA-001 Disposable PostgreSQL concurrency and protected-flow E2E suite | 5 | 3 | 5 | 4 | 5 | P1 |
| 10 | PRIV-001 Decide and implement kiosk phone-lookup privacy mode | 4 | 4 | 4 | 3 | 4 | P1 |

## 13. Quick Wins

These are low-effort changes with disproportionate clarity or safety value; they still require implementation approval.

1. Add a visible sync state and “last successful snapshot age” to the board; stop presenting a silent stale board as live.
2. Use a shared currency/timezone formatter in all admin/kiosk/board surfaces instead of inline dollar/browser-local formatting.
3. Change “Open today” to a server-provided open/closed/closing-soon status.
4. Make board SSE reconnect after error with bounded backoff while keeping the current three-second fallback.
5. Preserve one idempotency key across an unknown-outcome retry for kiosk check-in and admin attendance.
6. Add explicit confirmation copy before deactivating staff or closing attendance if an assigned turn exists.
7. Label the landing RolePreview as sample data.
8. Add a shared dialog focus-trap/restore behavior and reuse it across board, admin management, access, and payment modals.
9. Add a request ID, action name, duration, and outcome to server logs for check-in, staff commands, payment, and closing.
10. Document that the full database suite is not run by default and create a disposable test database CI command before relying on concurrency claims.

## 14. Prioritized P0/P1/P2/P3 Backlog

| ID | Backlog item | Priority | Effort | Dependencies | Acceptance criteria |
|---|---|---|---:|---|---|
| REL-001 | Persist skip exclusion/cooldown and apply it in check-in, finish, check-in staff, and read-repair paths | P0 | M | Skip policy decision | After SKIP, the same staff cannot be assigned to that service until the policy window/override; next eligible staff receives it; regression test passes |
| SEC-001 | Revalidate account status/role or implement revocable session version | P0 | M | Session lifetime decision | Deactivation/role change invalidates existing protected requests immediately; station sessions also expire/revoke correctly |
| REL-002 | Align auto-close, manual checkout, and accept attendance rules | P0 | S/M | Decide whether ASSIGNED blocks close | No accepted/active turn can be owned by checked-out staff; acceptance checks current attendance inside locked transaction |
| REL-003 | Separate reconciliation from reads; add sync version, stale indicator, and SSE reconnect | P0 | M | Sync contract | Board remains visibly stale/reconnecting during network loss; recovers after reconnect; reads do not mutate turns |
| REL-004 | Standardize idempotency intent lifecycle and unknown-outcome retry | P0 | M | Shared client pattern | Same user intent replays same server receipt after timeout; new tap creates a new key; no duplicate appointment/payment/action |
| QA-001 | Build disposable PostgreSQL critical workflow suite | P1 | L | Test DB fixture | CI runs check-in/accept/skip/finish/support/payment/closing/concurrency tests against PostgreSQL |
| OPS-001 | Implement cancellation/no-show states, reason, audit, report rules | P1 | M | Product decision | Staff/admin can close a non-completed visit with a reason; no payment; next queue and reports are correct |
| OPS-002 | Add manager manual reassignment/override | P1 | M | Audit/fairness decision | Admin can reassign with reason, eligibility validation, conflict handling, and audit record |
| OPS-003 | Add service-edit-before-start command | P1 | M | Price/snapshot policy | Selected services can be corrected before service begins; routing, amount, and history update atomically |
| CFG-001 | Make timezone/currency/closing/open status one source of truth | P1 | S/M | Config ownership decision | All display and business-date/closing behavior matches the configured salon values |
| PERF-001 | Push appointment filters/pagination to database; profile indexes | P1 | M | Representative fixture | History query payload and latency remain bounded for agreed data volume; EXPLAIN supports indexes |
| UX-001 | Complete exact iPad portrait/landscape QA and compact table/dialog pass | P1 | M | Supported hardware list | No clipped primary action/content; focus and touch targets pass manual/automated checks |
| PRIV-001 | Decide kiosk customer lookup privacy mode | P1 | M | Customer privacy decision | Lookup response/UI exposes only approved data and is rate-limited/audited |
| OBS-001 | Add request/lock/sync telemetry and closing job health | P1 | M | Logging destination | Operators can see failed commands, stale boards, lock waits, closing runs, and auth failures |
| RET-001 | Retention cleanup for sessions/receipts and audit policy | P2 | S/M | Retention decision | Cleanup is scheduled, idempotent, logged, and does not remove required audit/replay records |
| NAV-001 | URL/deep-link admin sections and filters | P2 | M | Route design | Refresh/back/bookmark preserves active module and filters |
| A11Y-001 | Shared tested dialog and semantic preview tabs | P2 | S/M | UI primitive choice | Keyboard/screen-reader interaction passes manual/automated accessibility checks |
| PWA-001 | Either remove misleading offline claim or add a small safe shell/catalog cache | P2 | M | Online-only mutation policy | Offline behavior is explicit and mutations never appear successful without server confirmation |
| SCALE-001 | Shared rate-limit store if multiple app instances are planned | P2 | M | Deployment topology | PIN/auth abuse limits behave consistently across instances |
| FUT-001 | ETA, exports, notifications, richer analytics | P3 | M/L | Reliable timing/report data | Only start after P0/P1 operational correctness is stable |

## 15. Recommended Implementation Roadmap

### Batch 0 — Decide and instrument (1–2 days)

Business decisions:

- Does one customer have one active visit per business date, or can they check in again?
- How long should a skipped technician be excluded from the same service/customer? Can the manager override immediately?
- Does an ASSIGNED but not accepted turn block auto-close and manual checkout?
- Are cancellation and no-show required for launch?
- What is the privacy policy for returning-customer phone lookup?
- Which timezone/currency/config store is authoritative?
- Which iPad models and portrait/landscape orientations are supported?

Technical preparation:

- Add request/command IDs, action duration, outcome, lock wait, and snapshot age to logs.
- Create a disposable PostgreSQL test fixture and test data reset strategy.
- Agree on sync state names and stale threshold.

Acceptance criteria: decisions are written into requirements/ADR documentation; no ambiguous behavior remains in the P0 paths.

### Batch 1 — P0 reliability/security hardening (5–8 developer-days)

Order:

1. Revoke/revalidate auth sessions.
2. Align attendance/auto-close/accept rules.
3. Persist skip exclusion and fix all routing callers.
4. Stabilize idempotency keys and unknown-outcome retry.
5. Add board stale/reconnect state and separate read from repair.

Acceptance criteria:

- The five P0 regression scenarios in the QA matrix pass against PostgreSQL.
- A deactivated account cannot call protected APIs with an old token.
- A skip cannot immediately cycle the same staff back.
- A network timeout can be safely retried without duplicate records.
- Board recovers from a simulated disconnect and visibly reports stale/reconnecting state.

### Batch 2 — Launch workflow completion and scale safety (7–12 developer-days)

Order:

1. Add database-backed skip reasons.
2. Implement agreed cancellation/no-show.
3. Implement manager reassignment/override.
4. Implement service-edit-before-start if required.
5. Move history filters/pagination to the database and profile indexes.
6. Centralize configuration/display formatters.
7. Add closing scheduler observability and configured-time enforcement.

Acceptance criteria:

- Managers can recover every agreed operational exception without editing unrelated master data.
- One-day and one-month histories stay within agreed response/payload targets using representative fixtures.
- Currency, timezone, open status, and closing behavior match the configured values.

### Batch 3 — Tablet UX/accessibility and operational polish (4–7 developer-days)

Order:

1. Exact hardware viewport matrix.
2. Shared dialog primitive.
3. Compact table/card modes and navigation deep links.
4. Kiosk privacy/retry/completion refinements.
5. Stale/sync/status copy and accessibility audit.

Acceptance criteria:

- Public, staff, and management flows are verified in both supported orientations.
- Primary actions are readable and touchable without horizontal hunting.
- Dialog focus/keyboard/screen-reader behavior passes.

### Batch 4 — Post-launch improvements

Only after the above: retention cleanup, shared rate-limit store, ETA/exports/notifications, and a deliberately scoped PWA shell cache.

## 16. Open Business Questions Requiring Decision

1. Is one active appointment per customer per business date intentional, or should a customer be allowed multiple visits?
2. How long should a skipped technician be excluded from the same service/customer? Can the manager override immediately?
3. Does an ASSIGNED but not accepted turn block auto-close and manual checkout?
4. Can a staff member accept a turn after their attendance is checked out, or must the system reroute first?
5. Are cancellation and no-show launch requirements? What reasons and reporting treatment are needed?
6. Can a customer change services after assignment or after service starts? How do price and staff snapshots change?
7. What exactly does “add another available technician” mean operationally: help only, shared credit, time-bounded support, or a second full assignment?
8. Are support technicians required to have a skill matching the service?
9. Is the shared kiosk allowed to reveal returning-customer recognition by phone/name?
10. Which currency and timezone are authoritative: environment values or ShopConfig?
11. Should closing run only at configured closingTime, and what happens when it runs late or is triggered manually?
12. What iPad models, browser versions, orientation modes, and network conditions are supported at launch?
13. Should public board show technician names, skills, and availability, or only tickets/status?
14. What retention period is acceptable for customer history, audit events, command receipts, and verified station sessions?
15. Is a single shop the durable product boundary, or is multi-salon support a near-term roadmap item?

## Final recommendation

Do not begin with visual polish or new product surfaces. Start with Batch 0 decisions and Batch 1 P0 hardening, then validate the critical workflows against a disposable PostgreSQL database and the actual tablet network conditions. After that, implement the smallest set of agreed operational exception workflows before launch.

The first implementation batch should be selected by the product owner. No source-code changes should be made from this audit until that approval is given.

## Appendix A. Standardized High-Impact Finding Cards

The following cards normalize the launch-critical findings into the requested format. The longer inventory, UX, workflow, performance, security, and QA sections contain the remaining lower-severity findings.

### REL-001 — Skip exclusion is not durable

- Category: Business workflow / queue reliability
- Severity: P0
- Affected screen/workflow: Staff turn board, queue routing, board refresh/reconciliation
- Current implementation: SKIP records a skipped turn, clears the service assignment, releases the staff member, and calls routeAfterSkip with the current staff excluded. A later reconciliation routes the waiting service with the generic routeNextTurn path.
- Evidence: src/server/services/prisma-operations.ts:616; src/server/services/prisma-operations.ts:620; src/server/services/prisma-operations.ts:414; src/server/services/prisma-operations.ts:426; src/domain/turn-routing.ts:44.
- Problem and business impact: The exclusion exists only for the transaction that performs SKIP. The next board GET/SSE read can select the same eligible technician again. Staff can see a customer repeatedly return to the same technician after a skip, undermining fairness and queue trust.
- Recommended solution: Persist a service/appointment turn-attempt exclusion or cooldown with reason and expiry, and make every routing caller honor it. Add a manager override only if explicitly required.
- Estimated effort: M
- Dependencies: Decide exclusion duration, scope, and override policy.
- Acceptance criteria: After a skip, the skipped staff is not selected by check-in, finish, staff check-in, reconciliation, or board refresh until the policy allows it; the reason remains reportable; concurrent regression test passes.

### SEC-001 — Account deactivation does not revoke existing JWT authorization

- Category: Security / authorization
- Severity: P0
- Affected screen/workflow: Admin account management, station/admin API authorization
- Current implementation: Auth.js uses an eight-hour JWT; role is copied into the token at sign-in and route guards trust auth() output.
- Evidence: src/server/auth.ts:13; src/server/auth.ts:35; src/server/auth.ts:39; src/server/admin-auth.ts:3.
- Problem and business impact: An account deactivated by a manager can retain protected access for the remainder of the JWT lifetime. A role change can leave administrative access active. This violates the expected meaning of account activation/role management.
- Recommended solution: Add revocable session version/status checks or shorter server-revalidated sessions; invalidate related VerifiedStaffSession records on account/staff changes.
- Estimated effort: M
- Dependencies: Session lifetime and station workflow decision.
- Acceptance criteria: Existing sessions fail immediately or within the documented bounded interval after deactivation/role change; all protected routes use the same check; regression tests cover ADMIN and STATION.

### REL-002 — Auto-close and ACCEPT can disagree about attendance

- Category: Attendance / state integrity
- Severity: P0
- Affected screen/workflow: Attendance closing review, staff board ACCEPT
- Current implementation: Automatic close blocks staff linked to IN_SERVICE or PAYMENT_PENDING services, but not ASSIGNED services. Staff action validation checks the assigned turn but does not re-check current attendance before ACCEPT.
- Evidence: src/server/services/prisma-operations.ts:483; src/server/services/prisma-operations.ts:485; src/server/services/prisma-operations.ts:496; src/server/services/prisma-operations.ts:589; src/server/services/prisma-operations.ts:603.
- Problem and business impact: A staff member can be checked out while still owning an assigned turn, then accept it or remain visible as an assignment. Attendance, eligibility, and service ownership diverge at closing.
- Recommended solution: Choose one rule: assigned turns block close, or close atomically unassigns/reroutes them. Re-check active attendance inside the locked ACCEPT transaction.
- Estimated effort: S/M
- Dependencies: Closing policy decision.
- Acceptance criteria: No checked-out staff can accept/start a turn; close returns a deterministic deferred/rerouted result; assigned-turn edge tests pass.

### REL-003 — Realtime path is polling plus snapshot SSE, with read-side writes

- Category: Realtime / performance / consistency
- Severity: P0
- Affected screen/workflow: Staff board, cross-tablet synchronization, reconciliation
- Current implementation: Board polls every three seconds; SSE sends one initial snapshot and keepalives; GET /api/board reconciles assignments before reading.
- Evidence: app/(board)/board/page.tsx:71; app/(board)/board/page.tsx:75; app/(board)/board/page.tsx:80; app/api/sse/board/route.ts:16; src/server/services/prisma-operations.ts:159; src/server/services/prisma-operations.ts:161.
- Problem and business impact: The UI can look live while the SSE is dead, requests can overlap, and every read can take the shop/date lock and mutate queue state. Multiple tablets can create unnecessary contention and stale displays.
- Recommended solution: Make reads pure, trigger repair from mutations/scheduler, add versioned snapshots, reconnect/backoff, visible stale state, and stale-command conflict handling.
- Estimated effort: M
- Dependencies: Define sync contract and stale threshold.
- Acceptance criteria: Board exposes Live/Polling/Reconnecting/Stale; reconnect recovers after simulated disconnect; board GET no longer changes assignment records; lock waits and snapshot age are observable.

### REL-004 — Retry/idempotency behavior is inconsistent across clients

- Category: Reliability / repeated taps / network recovery
- Severity: P0
- Affected screen/workflow: Kiosk check-in, admin attendance, board actions, payment
- Current implementation: Server CommandReceipt supports replay, board modal creates a stable key for an open intent, and payment accepts a key. Admin attendance creates a new key with Date.now for each attempt; kiosk form state/key is lost on refresh.
- Evidence: src/server/services/prisma-operations.ts:255; src/server/services/prisma-operations.ts:531; src/components/admin-management.tsx:101; app/(kiosk)/kiosk/page.tsx:176.
- Problem and business impact: A timeout leaves the operator/customer unable to know whether the command succeeded. A retry may be interpreted as a new intent even though the first request committed.
- Recommended solution: Persist the command key from intent creation through definitive success/failure, provide a status/replay endpoint or response, and preserve kiosk intent locally for the short flow.
- Estimated effort: M
- Dependencies: Shared mutation client and user-facing timeout copy.
- Acceptance criteria: Every critical mutation has stable key replay; timeout/retry produces one record; a deliberate second tap creates a new key; tests cover refresh and delayed response.

### OPS-001 — Operational exception recovery is incomplete

- Category: Product workflow completeness
- Severity: P1
- Affected screen/workflow: Queue management, staff board, service selection
- Current implementation: No CANCELLED/NO_SHOW state, no manager reassignment endpoint, and no service-change mutation after check-in/assignment.
- Evidence: src/domain/state-machines.ts:3; prisma/schema.prisma:16; app/api; src/server/services.
- Problem and business impact: Managers cannot clear a departed customer, correct a wrong assignment, or fix a service selection without manipulating unrelated data. Queue history and daily reports can remain operationally unresolved.
- Recommended solution: Decide launch scope, then add explicit commands with reason, actor, timestamp, routing and reporting semantics. Keep payment/payment-gateway scope unchanged.
- Estimated effort: M
- Dependencies: Business decisions in Section 16.
- Acceptance criteria: Every agreed exception is possible from the appropriate tablet in one controlled command, is audited, cannot create payment accidentally, and advances the queue correctly.

### CFG-001 — Configuration has multiple unused sources of truth

- Category: Configuration / correctness
- Severity: P1
- Affected screen/workflow: Kiosk catalog, admin prices/reports, dates, closing job
- Current implementation: ShopConfig stores timezone, closingTime, currency, and roundRobinEnabled; environment also supplies SHOP_TIMEZONE, SHOP_CURRENCY, and SHOP_CLOSING_TIME; code search found the display/closing/round-robin fields are not consistently consumed.
- Evidence: prisma/schema.prisma:336; prisma/seed.ts:83; docker/docker-compose.yml:30; app/(kiosk)/kiosk/page.tsx:184; src/components/admin-management.tsx:254.
- Problem and business impact: Operators can change a setting that does not affect the screen or business behavior. Currency and timestamps may be wrong; closing may run whenever invoked.
- Recommended solution: Select one authoritative config source, expose it through a server display/config contract, and centralize currency/timezone/open-status/closing evaluation.
- Estimated effort: S/M
- Dependencies: Shop configuration ownership decision.
- Acceptance criteria: One configured currency and timezone render consistently across all screens; closing/open status is tested at time boundaries; unused configuration is removed or wired.

### QA-001 — Critical transactional services are not covered by executable tests

- Category: QA / release confidence
- Severity: P1
- Affected screen/workflow: all staff actions, payment, closing, admin operations, concurrency
- Current implementation: Pure domain tests pass; PostgreSQL tests are opt-in; database service coverage is below 4%; protected and mutating browser tests exist but were not run in this audit.
- Evidence: npm run test:coverage output; src/server/services/prisma-operations.ts; tests/integration/postgres.test.ts:6; tests/e2e.
- Problem and business impact: A clean build does not prove transaction boundaries, advisory lock behavior, route transitions, stale session rejection, or three-tablet race handling.
- Recommended solution: Add a disposable PostgreSQL CI fixture and test the P0/P1 matrix before implementing fixes and before launch.
- Estimated effort: L
- Dependencies: Safe database reset/fixture and test credentials.
- Acceptance criteria: CI runs concurrent check-in/accept/skip/finish/payment/closing tests, protected admin/station E2E, retry/reconnect cases, and publishes results without mutating shared data.
