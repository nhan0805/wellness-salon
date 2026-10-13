# Wellness Salon — Full Product Review Audit

**Audit date:** 2026-10-12  
**Repository:** `/Users/hanhuynh/Downloads/Wellness Salon`  
**Audit mode:** Read-only repository and evidence review  
**Product:** Tablet-first nail-salon operations MVP: Customer Kiosk, Staff Turn Board, Admin Console

## Scope and evidence convention

This review covered the current source tree, Prisma schema and migrations, route handlers, domain/state logic, shared UI components, styles, Docker deployment files, tests, and the following product documents before source analysis:

- `README.md`, `AGENTS.md`
- `docs/project_state.md`, `docs/requirements.md`, `docs/architecture.md`, `docs/decisions.md`
- `docs/implementation/TEST_MATRIX.md`, `docs/implementation/RELEASE_CHECKLIST.md`
- `docs/implementation/FINAL_REPORT.md`, `docs/implementation/PROGRESS.md`
- `docs/implementation/TABLET_QA_PLAN.md`, `docs/implementation/VIEWPORT_QA.md`
- `docs/lifecycle/*` material relevant to product, architecture, NFRs, and QA
- Prior baseline audit: `docs/audits/2026-10-10-nail-salon-mvp-audit.md`

The prior audit and implementation handoff were treated as historical evidence, not as proof that a finding still exists. Items marked implemented below were re-checked against the current source where material.

Classification:

- **Confirmed** — directly visible in current source, schema, test source, or recorded execution evidence.
- **Potential Risk** — credible from the current implementation, but scale, deployment, or user impact needs a targeted measurement or decision before calling it a production defect.
- **Requires Runtime Verification** — the repository explicitly records the scenario as not run, or it requires physical hardware, deployed infrastructure, or live operational conditions.

Priority/severity:

- **P0** — blocks safe unattended production or creates a credible security/data-integrity failure.
- **P1** — high-impact pre-launch, pilot, or scale risk.
- **P2** — valuable follow-up with bounded operational impact.

Effort is relative implementation effort: **S** (small), **M** (medium), **L** (large). Recommendations preserve the approved one-shop MVP rules and do not introduce online booking, payment-gateway processing, staff mobile apps, payroll, inventory, loyalty, or multi-tenant scope.

## 1. Executive summary

### Overall conclusion

The current tree is a strong supervised-pilot baseline. The primary business flow exists end to end: kiosk check-in, skill/attendance routing, staff accept/skip/finish, support, manager cancellation/service change/reassignment/skip override, external-terminal payment confirmation, payment traceability, audit events, and board synchronization.

The hardening recorded in the implementation documents is present in the current source. In particular, exact service/staff skip exclusions, database-backed session/PIN controls, transaction-scoped advisory locking, request-hash receipts, side-effect-free board reads, SSE reconnect/polling fallback, public-board redaction, server-side appointment history pagination, and audited payment correction/refund commands are not missing features and should not be reimplemented.

The repository is not yet evidenced for unattended production. The largest residual concerns are:

1. Kiosk opening hours are a client-side state decision and are not enforced in `createDbCheckIn`; a stale kiosk page or direct API caller can submit outside the configured window.
2. The Admin parent refresh performs four requests every ten seconds, including an unbounded heavy appointment projection. Parent refreshes have no abort/sequence guard, and a failed refresh is surfaced only while the Overview section is visible.
3. Routing and appointment-code generation run under the shop/date lock with daily-volume-dependent work. The local benchmark demonstrates acceptable current fixtures, but it did not isolate a large waiting queue or 20,000-appointment check-in allocator behavior.
4. Several tablet and accessibility gates remain unverified on real iPad/WebKit: distance readability, Dynamic Type, VoiceOver, keyboard/focus behavior, safe area, real touch, and live Wi-Fi interruption.
5. Production security depends on deployment choices that are present in configuration but not signed off: TLS/ingress topology, whether port 3000 is directly reachable, external rate limiting, CSP hardening, scheduler/alerting, and rollback rehearsal.

### Release recommendation

Continue treating the application as a supervised pilot. Before unattended production, close the P0 release gates in this report, enforce the kiosk open-window rule server-side, complete physical tablet/network verification, and run the missing database/E2E scenarios for the follow-up catalog and payment-traceability batch. The current local checks are useful evidence, not a production SLO or hardware sign-off.

### What is already strong

| Area | Current evidence | Audit conclusion |
|---|---|---|
| Core state integrity | Prisma transactions, `CommandReceipt`, request hashes, state machines, unique constraints, and advisory locks | Strong baseline; keep as the MVP boundary. |
| Routing rules | All required skills, active/present/available staff, fairness, persistent exact-service exclusions, manager override | Implemented; remaining concern is scale/lock cost, not missing routing scope. |
| Attendance/session | ACCEPT attendance guard, checkout/closing blocking, JWT session-version revalidation, verified staff sessions | Implemented; add the missing auth/PIN regression tests. |
| Board resilience | Side-effect-free reads, monotonic version, SSE reconnect/backoff, five-second polling fallback, visible sync states | Implemented; physical/live-network evidence remains open. |
| Payment boundary | Admin records external CARD/CASH result; no gateway/card data; adjustment/correction/refund are audited | Correct MVP boundary; follow-up paths need dedicated DB/E2E proof. |
| Tablet foundation | Chromium 810×1080 and 1080×810 checks: no horizontal overflow; reviewed primary controls at least 44px | Good foundation; not equivalent to physical WebKit/VoiceOver validation. |

### Local measurement context

Recorded evidence is useful and should be retained in CI/staging comparisons:

- Small disposable fixture: board p50/p95 `1.76/3.26 ms`, appointments `1.66/1.91 ms`, reports `0.58/0.50 ms` p95 by period.
- Representative 20,000-appointment fixture: legacy broad history payload `1,515,072 bytes`, p95 `104.48 ms`; bounded 25-row history payload `34,360 bytes`, p95 `6.34 ms`; board p95 `107.89 ms`; report day/month p95 `5.32/16.27 ms`.
- Local HTTP/service profiles: zero recorded errors; three-client board HTTP p95 `219.84 ms`; service-layer concurrent check-in p95 `78.53 ms`; seven advisory-lock waits at least 10 ms, maximum `56.87 ms`; pool-constrained 350-operation run also had zero errors.

These measurements do not isolate the residual code allocator/routing risks, do not represent production network latency or pool behavior, and do not validate physical tablets.

## 2. UI/UX findings by screen

### Screen inventory and qualitative assessment

| Surface | What works | Current usability risk |
|---|---|---|
| Customer Kiosk | Clear three-step journey, large service cards, search/category grouping, lookup feedback, same-key retry, ticket/reset state, configured hours/currency presentation | Open state can age without a clock refresh; landscape CTA is below the initial viewport; partial tab semantics and step-transition focus need accessibility validation. |
| Staff Turn Board | Current/up-next/staff separation, redacted public view, visible Live/Reconnecting/Checking/Stale state, protected action dialog, PIN keypad, responsive queue cards | Verification countdown is continuously live-announced; tab semantics are only partly complete; distance readability and real-network operation are unverified. |
| Admin Console | Operational navigation, dynamic currency/time configuration, paginated appointment history, action menu, payment keypad/history, loading/error states in several child modules | Parent refresh is broad and silent outside Overview; portrait navigation/tables depend on horizontal scrolling; mobile nav is not a focus-contained dialog. |
| Sign-in/entry | Role routing, generic authentication error, autocomplete/input modes, show-password control, role-specific copy | No material functional defect found; physical keyboard, WebKit, and accessibility review remain release gates. |
| Shared UI/PWA | Shared dialog focus hook, touch tokens, reduced-motion rule, safe-area refinements, no-store operational reads | Global stylesheet is large and contains many sub-0.8rem text styles; service worker is install-only and does not provide offline recovery. |

### Kiosk findings

#### UX-KSK-001 — Kiosk operating-hours state becomes stale

- **Classification:** Confirmed
- **Severity:** P1
- **Evidence:** `app/(kiosk)/kiosk/page.tsx:151-168` computes `isShopOpen` with `useMemo(..., [shop])`; there is no interval or visibility refresh. `app/(kiosk)/kiosk/page.tsx:307-318` uses that same state to gate submission. Shop configuration is loaded once by `app/api/services/route.ts:7-9`.
- **Impact:** A kiosk opened before closing can continue showing “Open now” and can pass the client-side open check after closing. A kiosk opened before opening can remain closed until the catalog/config request is reloaded. The user-visible hours and the business rule can diverge from the current salon clock.
- **Recommendation:** Make opening-window enforcement authoritative in the server transaction using the configured shop timezone; refresh the client status on a short timer and on visibility/focus return. Preserve same-key receipt replay semantics for a command that already succeeded.
- **Effort:** M
- **Acceptance criteria:** Direct `POST /api/kiosk/check-in` is rejected outside `[openingTime, closingTime)` using `ShopConfig.timezone`; exact opening and closing boundaries are tested; a kiosk left open across a boundary updates its status without a full reload; a stale client cannot create a new visit outside hours.

#### UX-KSK-002 — Landscape continuation action is below the initial viewport

- **Classification:** Requires Runtime Verification
- **Severity:** P1
- **Evidence:** `docs/implementation/VIEWPORT_QA.md:25-29` records that the second service-card row and Continue CTA extend below the 810px landscape viewport. `app/globals.css:5027-5037` retains a vertically scrolling kiosk layout at narrow widths.
- **Impact:** Customers using a landscape-mounted kiosk may select services without immediately seeing how to continue, increasing hesitation and accidental scrolling on a shared touch device.
- **Recommendation:** Validate the real kiosk mounting orientation first. If landscape is supported, provide a safe-area-aware sticky summary/Continue action or a measured compact layout without covering service content.
- **Effort:** S/M
- **Acceptance criteria:** On every supported iPad size/orientation, the selected-service summary and primary continuation action are visible or reachable with one obvious gesture; the CTA remains above the home-indicator area; no overlay covers the last service card; a physical-touch pass is recorded.

#### UX-KSK-003 — Kiosk category tabs and step progress use incomplete interactive semantics

- **Classification:** Potential Risk
- **Severity:** P2
- **Evidence:** `app/(kiosk)/kiosk/page.tsx:382-415` places `aria-current="step"` on non-interactive spans. `app/(kiosk)/kiosk/page.tsx:490-516` uses `role="tab"` and `aria-selected` but does not provide `aria-controls`, roving `tabIndex`, or arrow/Home/End behavior.
- **Impact:** Touch users can operate the controls, but VoiceOver/keyboard users may not receive a coherent stepper/tab model or know which content panel is controlled.
- **Recommendation:** Either use plain buttons/group semantics for category filters, or implement the complete tab pattern: `aria-controls`, one tab in the tab order, arrow/Home/End navigation, and a labelled panel. Make the stepper a labelled progress/status region rather than assigning step semantics to spans.
- **Effort:** S
- **Acceptance criteria:** Keyboard and VoiceOver can discover the active category, move between categories without tabbing through every chip, and hear the associated panel/result count; step changes announce the active step once; automated axe/manual checks record no invalid tab pattern.

#### UX-KSK-004 — Step transitions do not explicitly move focus to new content

- **Classification:** Potential Risk
- **Severity:** P2
- **Evidence:** `app/(kiosk)/kiosk/page.tsx:273-277` and `:347-350` change `step` after a button click but do not focus the new step heading or first field. Focus is explicitly moved only for validation errors at `:307-334`.
- **Impact:** A keyboard or assistive-technology user can remain on a button whose surrounding content was replaced, especially on a long kiosk page. Touch users are less affected, so this is an accessibility/recovery risk rather than a general flow failure.
- **Recommendation:** On step change, focus a stable step heading or first actionable control and announce the new step. Do not steal focus from an error target.
- **Effort:** S
- **Acceptance criteria:** Continue focuses the phone field or step heading; successful submission focuses the ticket heading; Change services restores focus to the catalog heading; screen-reader announcements are not duplicated.

### Staff Turn Board findings

#### UX-BRD-001 — Verification countdown is announced every second

- **Classification:** Confirmed
- **Severity:** P2
- **Evidence:** `app/(board)/board/page.tsx:134-138` updates `verificationNow` every second. `app/(board)/board/page.tsx:320-321` renders the verification text inside `role="status" aria-live="polite"`, including `formatVerificationRemaining(...)`.
- **Impact:** VoiceOver can repeatedly interrupt useful board content with a changing countdown. The visual countdown is useful, but a second-by-second live region is noisy.
- **Recommendation:** Keep the visual countdown outside the live region and announce only verification success, expiry, or a coarser threshold such as one minute remaining.
- **Effort:** S
- **Acceptance criteria:** A screen reader hears one success announcement and one expiry/threshold announcement, not one announcement per second; sighted users retain the visible remaining time.

#### UX-BRD-002 — Board tabs are operable buttons but not a complete keyboard tab pattern

- **Classification:** Potential Risk
- **Severity:** P2
- **Evidence:** `app/(board)/board/page.tsx:326-332` provides `role="tablist"`, `role="tab"`, `aria-controls`, `aria-selected`, and `tabpanel`, but neither tab has selected-only `tabIndex` or arrow/Home/End behavior.
- **Impact:** Keyboard users must tab to each tab and may not receive expected tab-widget behavior. This is lower risk than the earlier modal issue because `useDialogFocus` is now shared and applied at `:149`/`:434-435`.
- **Recommendation:** Complete the tab pattern or replace the roles with a labelled button group. Keep the existing focus-trapping dialog behavior.
- **Effort:** S
- **Acceptance criteria:** Arrow/Home/End navigation works, only the active tab is in the tab order, panels expose the correct label, and Escape/Tab behavior in the action dialog remains unchanged.

#### UX-BRD-003 — Distance readability and deployed touch behavior are unverified

- **Classification:** Requires Runtime Verification
- **Severity:** P1
- **Evidence:** `docs/implementation/VIEWPORT_QA.md:31-35,48-52` records Chromium portrait/landscape observations but explicitly excludes physical iPad/WebKit, distance/readability, Dynamic Type, VoiceOver, real touch latency, safe area, and Wi-Fi. `app/globals.css` contains many small status/support text declarations, for example `:1118-1129` and `:1855-1864`.
- **Impact:** A floor board can be technically responsive but still fail its operational purpose if queue text is not legible from the intended viewing distance or if touch targets behave differently in Safari/WebKit.
- **Recommendation:** Run the approved tablet QA plan on the actual board hardware at the intended distance, with large text and VoiceOver passes. Treat results as a launch gate, not a desktop screenshot proxy.
- **Effort:** M (runtime validation)
- **Acceptance criteria:** Operators can read current/up-next/status information from the agreed distance; primary actions remain at least 44px with real touch; WebKit, safe-area, reduced-motion, Dynamic Type, and VoiceOver results are recorded; stale/reconnecting states remain visible.

### Admin Console findings

#### UX-ADM-001 — Refresh failure is visible only in Overview

- **Classification:** Confirmed
- **Severity:** P1
- **Evidence:** `app/(admin)/admin/page.tsx:273-329` sets a single `loadError` for the parent refresh. `app/(admin)/admin/page.tsx:523-537` renders that error only inside `renderOverview()`. `renderSection()` at `:1016-1058` renders Queue, Appointments, Payments, or Config without the parent error banner.
- **Impact:** Queue, Appointments, and Payments can continue showing an older snapshot after a failed background refresh without a visible stale/error state. Operators may act on stale assignment or payment information.
- **Recommendation:** Add a global data-health banner/status in the Admin top bar/content shell with last successful timestamp, stale age, retry, and action-safety rules. Keep child-module errors distinct from parent snapshot errors.
- **Effort:** M
- **Acceptance criteria:** Simulating a failed refresh while each Admin section is active shows a visible stale state and retry; the last successful time remains visible; destructive actions are either disabled or explicitly labelled as operating on stale data; recovery clears the banner only after a successful matching refresh.

#### UX-ADM-002 — Mobile Admin navigation is not focus-contained

- **Classification:** Potential Risk
- **Severity:** P1
- **Evidence:** `app/(admin)/admin/page.tsx:350-357` only locks body scrolling when `mobileNavOpen`. `:1065-1100` renders the sidebar and scrim, but does not use `useDialogFocus`, `aria-modal`, `inert`, or an equivalent focus boundary for the open navigation.
- **Impact:** Keyboard users can tab behind the scrim into the Admin content while the navigation is visually modal. Focus can also be left in the closed drawer after selection or Escape-like pointer dismissal.
- **Recommendation:** Treat the mobile navigation as a modal drawer: focus the first navigation item, trap focus, close on Escape/scrim, restore focus to the menu toggle, and mark the main content inert while open.
- **Effort:** S/M
- **Acceptance criteria:** Tab and Shift+Tab remain within the open drawer; Escape and scrim close it; focus returns to the toggle; background controls are not reachable while open; touch navigation remains one tap per module.

#### UX-ADM-003 — Portrait module discovery and dense tables rely on horizontal scrolling

- **Classification:** Requires Runtime Verification
- **Severity:** P1
- **Evidence:** `docs/implementation/VIEWPORT_QA.md:42-46` identifies weaker portrait module discoverability. `app/globals.css:3757-3783` and `:4955-4988` implement horizontal Admin navigation; the appointment table has `min-width:1120px` at `:2741-2743`, and other management table widths are declared around `:2368-2377` and `:2575-2630`.
- **Impact:** Important modules/actions and identity/action columns can be off-screen on portrait tablets. Horizontal scrolling is technically available but has no strong visible affordance and increases task time.
- **Recommendation:** Preserve the approved information architecture but add a visible scroll cue/position indicator and a compact card/priority-column mode for the appointment and management tables. Validate on supported physical widths before selecting a breakpoint.
- **Effort:** M
- **Acceptance criteria:** A manager can discover every module in portrait without guessing; appointment identity/status/action remain visible in the compact mode; horizontal scrolling, if retained, has an affordance and does not hide the selected row action.

#### UX-ADM-004 — Admin “Updated” time uses device timezone, unlike the board

- **Classification:** Confirmed
- **Severity:** P2
- **Evidence:** `app/(admin)/admin/page.tsx:1121-1125` formats `lastUpdatedAt` with `toLocaleTimeString` and no `shop.timezone`. The board formats its last-update time with `timeZone: board.shop.timezone` at `app/(board)/board/page.tsx:320`.
- **Impact:** An Admin tablet in a different timezone can show a refresh time that does not match the configured business timezone or the board, reducing operator trust during close/payment reconciliation.
- **Recommendation:** Use one shop-timezone formatter for operational timestamps, or label device-local time explicitly if that is the intended contract.
- **Effort:** S
- **Acceptance criteria:** With the browser timezone set differently from `ShopConfig.timezone`, Admin and Board show the agreed same timezone/label; business-date filters remain unchanged.

#### UX-ADM-005 — Payment validation relies on a transient toast rather than field recovery

- **Classification:** Confirmed
- **Severity:** P2
- **Evidence:** `app/(admin)/admin/page.tsx:440-464` validates amount, tip, and cash received by calling `setToast(...)`; the payment form uses keypad components at `:1205-1235`. The validation message is not associated with a specific input and does not move focus to the invalid field.
- **Impact:** An operator correcting cash or tip data must infer which keypad needs attention, and a short-lived toast can disappear before the correction is made.
- **Recommendation:** Keep the toast as confirmation feedback, but add inline field-level errors tied to the relevant keypad and focus the first invalid input/display after validation.
- **Effort:** S
- **Acceptance criteria:** Invalid amount/tip/cash input produces an inline message associated with the right control; the first invalid control receives focus; the modal remains open with entered values preserved; successful confirmation clears the error.

### Shared UI, typography, and accessibility findings

#### UX-SHR-001 — A muted text token is below normal-text contrast in common contexts

- **Classification:** Confirmed
- **Severity:** P1
- **Evidence:** `app/globals.css:25-27` defines `--color-muted-taupe:#8d8183`; usage includes small field metadata at `:8854-8857`, keypad footnotes at `:7957-7960` and `:10038-10040`, and placeholders at `:4616-4617`. Against white, the token computes to approximately 3.75:1, below the 4.5:1 normal-text target; several uses are 0.70–0.72rem.
- **Impact:** Helper/footnote/placeholder content can be difficult to read and may fail normal-text contrast where it conveys instructions or state. This matters on low-brightness tablet displays.
- **Recommendation:** Replace the token with a darker accessible neutral for meaningful text, reserve the lighter tone for decorative/non-essential content, and sample actual backgrounds with an automated contrast check.
- **Effort:** S
- **Acceptance criteria:** All meaningful text meets the agreed WCAG AA contrast target in its actual background/size context; decorative separators may remain exempt; a contrast audit covers kiosk, board, Admin, sign-in, and payment keypad states.

#### UX-SHR-002 — Shared role semantics have small but repeated accessibility inconsistencies

- **Classification:** Potential Risk
- **Severity:** P2
- **Evidence:** `src/components/ui.tsx:9-11` renders initials without an explicit decorative/standalone accessible name. `src/components/account-menu.tsx:40-74` uses `aria-haspopup="dialog"` and a `role="dialog"` panel, but the sign-out control is assigned `role="menuitem"` without a containing `role="menu"`. Multiple category/revenue/catalog tab groups use partial tab semantics; the Payments tab implementation at `app/(admin)/admin/page.tsx:3184-3260` is a useful complete comparison.
- **Impact:** Screen-reader output can include duplicate initials or inconsistent menu/tab announcements even though pointer/touch operation works.
- **Recommendation:** Standardize shared primitives: decorative avatars use `aria-hidden`, standalone avatars have a label, account panel uses either dialog semantics or a complete menu pattern, and tab groups share one tested implementation.
- **Effort:** S/M
- **Acceptance criteria:** Manual screen-reader pass confirms no duplicate avatar noise, account actions have one predictable role, and all tab groups expose consistent selected/controlled-panel/keyboard behavior.

## 3. Business feature and rule gap analysis

### End-to-end workflow trace

| Workflow | Current implementation/evidence | Audit result |
|---|---|---|
| Check-in | Kiosk service bundle, phone/name validation, returning-guest lookup, same-key receipt, customer upsert, code creation, service snapshots, routing | Implemented; server open-hours enforcement is a residual gap (BUS-001). |
| Routing | Required skill intersection, active/present/available filters, fairness/stable ordering, persistent turn exclusions, explicit repair | Implemented; lock/query cost needs scale measurement (PERF-003). |
| Attendance | CHECK_IN/CHECK_OUT, active-turn checkout block, closing logic, assignment release | Implemented; auth/PIN/automatic-close regression coverage is incomplete. |
| Accept | Direct `ASSIGNED → ACCEPTED/IN_SERVICE`, attendance and assignment checked in transaction, idempotency | Implemented; concurrent DB accept test passes. |
| Skip | Active reason required, turn event, exact service/staff exclusion, rerouting, manager override | Implemented; repeated-skip policy is not explicitly specified (BUS-002). |
| Service change | Admin-only, pre-terminal boundary, skill revalidation, snapshots/audit, reroute | Implemented; active-category predicate should be consistent in all mutation entry points. |
| Support | Present/available support, shared appointment, atomic release when primary finishes | Implemented; dedicated concurrent-support test is missing. |
| Completion | Finish releases staff/support, moves appointment to payment pending, preserves turn events | Implemented; broader payment-pending/closing matrix is incomplete. |
| Cancellation | Service/visit scopes, reason/confirmation for in-service, turn closure, release/reroute, idempotent receipt | Implemented; no-show remains intentionally out of scope. |
| Payment | Admin external-terminal confirmation, CARD/CASH/tip/cash details, unique payment, adjustment/correction/refund audit records | Implemented; dedicated DB/E2E proof for follow-up commands is missing. |
| Close/retention | Protected endpoints, timezone-aware closing, cleanup path, structured job events | Implemented as endpoints; external schedule/alert/rollback operation is not verified. |

The following are approved rules and are not proposed as gaps: distinct same-day visits are allowed; public board redacts customer identity; staff accepts directly into service; payment processing is external; cancellation does not add a NO_SHOW state; categories affect catalog presentation, not routing; richer booking/customer-account/payroll/inventory scope remains out of scope.

### Business findings

#### BUS-001 — Kiosk check-in has no server-side operating-hours guard

- **Classification:** Confirmed
- **Severity:** P1
- **Evidence:** `app/(kiosk)/kiosk/page.tsx:307-318` gates with client `isShopOpen`. `src/server/services/prisma-operations.ts:1281-1323` enters the transaction, checks receipts/services, and creates the visit without reading opening/closing times. `app/api/kiosk/check-in/route.ts:10-23` delegates directly to `createDbCheckIn`.
- **Impact:** A stale browser or direct trusted-origin API caller can create an appointment outside the configured customer check-in window. This is a business-rule and operational-integrity issue, not only a display issue.
- **Recommendation:** Read `ShopConfig` inside the locked transaction and reject new check-ins outside the configured local-time window. Keep receipt replay before/after the guard according to a written rule for retries of already successful commands. Update the client clock state as UX feedback.
- **Effort:** M
- **Acceptance criteria:** Outside-hours direct API submissions fail without creating customer/appointment/receipt side effects; opening is inclusive and closing exclusive; timezone and DST boundary tests pass; the kiosk and server return the same configured state; an already successful same-key replay has deterministic behavior documented and tested.

#### BUS-002 — Repeated skip behavior has no explicit policy beyond per-staff exclusion

- **Classification:** Potential Risk
- **Severity:** P2
- **Evidence:** `src/server/services/prisma-operations.ts:3610-3721` permits SKIP for an active turn, records a persistent exclusion for the current staff/service, and reroutes. There is no maximum/repeated-skip rule or explicit terminal behavior when all eligible staff are excluded. `docs/requirements.md` and `docs/decisions.md` define exact exclusion but do not define a repeated-skip escalation policy.
- **Impact:** A service can remain waiting after multiple valid skips, with no shared operational rule for when a manager should intervene or how the event appears in reporting. This may be acceptable MVP behavior, but ambiguity creates inconsistent floor decisions.
- **Recommendation:** Preserve the current permanent exact-service exclusion. Add a short business decision and an operational status/manager escalation rule only if the salon wants one; do not introduce an automatic reassignment/cooldown without approval.
- **Effort:** S/M
- **Acceptance criteria:** Written decision states whether repeated skips are unlimited, manager-escalated, or otherwise bounded; the resulting behavior has a DB test for zero eligible staff and a board/Admin message that tells staff what to do next.

#### BUS-003 — Catalog-active predicates are not identical across read and mutation paths

- **Classification:** Potential Risk
- **Severity:** P2
- **Evidence:** `src/server/services/prisma-operations.ts:694-702` returns only active services in active categories to the kiosk. `:1314-1317` checks only `service.isActive` for kiosk creation, and `:2419-2423` checks only `service.isActive` for service change. Admin service writes do call `assertActiveServiceCategory` at `src/server/services/admin-operations.ts:458-462,514-529`, and category archive is blocked while active services remain at `:431-453`.
- **Impact:** Normal Admin UI operations prevent most inconsistent states, but a stale/inconsistent database or future migration can allow an active service under an archived category through direct mutation paths even though it is not in the kiosk catalog.
- **Recommendation:** Centralize the active-catalog predicate and use it in check-in and service-change transactions as defense in depth. Keep category archive protection.
- **Effort:** S
- **Acceptance criteria:** A service is accepted by check-in/service-change only when both service and category are active; archived-category direct requests return a stable error; Admin archive/reactivate paths retain their current historical safeguards.

#### BUS-004 — Closing and retention are callable jobs, not an operated schedule

- **Classification:** Requires Runtime Verification
- **Severity:** P1
- **Evidence:** `app/api/jobs/closing/route.ts:10-29` and `app/api/jobs/retention/route.ts:11-41` are protected endpoints with telemetry. `docs/implementation/RELEASE_CHECKLIST.md:31-39` and `docs/runbook/LOCAL.md:58-68` explicitly leave external scheduling, retry, alerting, and retention-window/backup approval to the operator.
- **Impact:** The application can be internally correct while attendance close or data cleanup silently does not run in deployment. This affects end-of-day operations, lockout/session cleanup, and operational data growth.
- **Recommendation:** Before unattended launch, configure an external scheduler with secret rotation, timeout/retry policy, alerting, and an operator runbook. Keep the route idempotent and do not add an in-process scheduler to this MVP.
- **Effort:** M (operator/infrastructure)
- **Acceptance criteria:** A staging schedule invokes both required jobs at the agreed times; success/failure/blocked outcomes reach the operator alert channel; replay is safe; retention days, backup/restore approval, and exception handling are documented.

## 4. Performance and database findings

### What is measured versus what is theoretical

The current local benchmark results in the Executive Summary are **measured** on disposable data and loopback/local PostgreSQL. The findings below marked Potential Risk are **not** claims that the current 20,000-row run failed. They identify code paths whose work grows with active/history volume or whose current benchmark does not isolate the relevant workload.

#### PERF-001 — Admin background refresh fans out four requests every ten seconds

- **Classification:** Confirmed
- **Severity:** P1
- **Evidence:** `app/(admin)/admin/page.tsx:273-320` issues four parallel requests on every `refresh`: unpaginated `/api/admin/appointments`, paginated appointments, reports, and config. `:331-346` starts the refresh on mount and every 10 seconds regardless of the active section. The unpaginated endpoint uses `getDbAppointmentsFiltered` at `app/api/admin/appointments/route.ts:57-80`.
- **Impact:** One idle Admin tablet produces repeated database work and payloads even while the operator is in Settings or Customers. Multiple tablets multiply the cost. The first appointment request uses the heavy `appointmentInclude` path (`src/server/services/prisma-operations.ts:369-389,986-1080`) and is not the bounded 25-row history path measured in the implementation benchmark.
- **Recommendation:** Split live queue/attention data from historical/report data; refresh only what the active section needs, pause or lengthen refresh when hidden/idle, and add a small dashboard projection if Overview needs multiple cards. Retain explicit refresh for operator intent.
- **Effort:** M
- **Acceptance criteria:** A 30-minute idle trace at each section records the agreed request budget; no unbounded appointment projection is fetched unless the section requires it; payload bytes and DB duration stay within an agreed budget; active Queue/Payments data still refreshes within the operating target.

#### PERF-002 — Parent Admin refreshes can overlap and apply an older response last

- **Classification:** Confirmed
- **Severity:** P1
- **Evidence:** `app/(admin)/admin/page.tsx:273-329` has no `AbortController`, request sequence, or query-key check. `:331-346` can start interval refresh while a manual section/date refresh is still pending; `:510-520` starts immediate refreshes on period/date changes.
- **Impact:** A slow request can overwrite a newer report/appointment/config selection. Combined with PERF-001, this can produce confusing “time travel” in reports or stale queue/payment state without a clear error.
- **Recommendation:** Use one shared refresh controller/revision. Abort the previous request, or apply a response only if its scope/revision is still current. Keep child appointment loaders’ existing abort/order guards.
- **Effort:** S
- **Acceptance criteria:** A delayed old response cannot overwrite a newer date/month/section snapshot; aborted requests do not show user-facing errors; the latest successful revision controls `lastUpdatedAt`, `dataRevision`, and visible data.

#### PERF-003 — Re-routing waiting appointments reloads the same staff snapshot per appointment

- **Classification:** Potential Risk
- **Severity:** P1
- **Evidence:** `src/server/services/prisma-operations.ts:2646-2749` loads the appointment, routing config, and `staffForBusinessDate` for every `routeAppointmentServices` call. `:3309-3320` loops all waiting appointments during staff check-in and calls that function for each; `:2752-2768` repeats the pattern during explicit reconciliation.
- **Impact:** A check-in or repair transaction can perform work proportional to waiting appointments × services while holding the one shop/date advisory lock. This can turn a normal staff check-in into a long queue pause and increase lock contention. The current local profile did not isolate a large waiting-queue reconciliation.
- **Recommendation:** Preserve fairness and exclusion semantics while loading one routing snapshot per transaction. Reuse staff/config data, update candidate availability in memory, and keep writes transactional. Measure query count before/after; do not remove the advisory lock without evidence.
- **Effort:** M
- **Acceptance criteria:** A fixture with 1,000 waiting appointments and representative multi-service visits records bounded query count per reconciliation; assignment results match the current routing rules; lock wait/p95 remains within the agreed budget; no skipped-staff regression occurs.

#### PERF-004 — Appointment code allocation scans all daily codes under the same lock

- **Classification:** Potential Risk
- **Severity:** P1
- **Evidence:** `src/server/services/prisma-operations.ts:844-857` selects every appointment code for the business date and reduces the highest `A###` in JavaScript. `createDbCheckIn` calls it inside the advisory-locked transaction at `:1288-1337`.
- **Impact:** Check-in write cost grows with daily volume and all concurrent check-ins serialize behind the lock while scanning. The recorded 20,000-appointment benchmark did not isolate check-in allocation at that daily volume.
- **Recommendation:** Use a per-shop/business-date sequence row or an indexed numeric sequence value allocated atomically. Preserve the visible `A001` format and receipt behavior; validate any migration against existing codes.
- **Effort:** M/L
- **Acceptance criteria:** 20,000 existing appointments plus concurrent new check-ins show bounded allocator latency and no duplicate codes; exact format remains; transaction rollback does not consume or reuse a conflicting code contrary to the chosen policy; lock-wait telemetry is recorded.

#### PERF-005 — Duration/payment sort modes scan and sort all matching IDs before paging

- **Classification:** Confirmed
- **Severity:** P1
- **Evidence:** `src/server/services/prisma-operations.ts:1184-1250` loads all matching rows for `DURATION_DESC` or `PAYMENT_NEWEST/OLDEST`, sorts in Node, then fetches only the selected page. The normal sort path at `:1251-1259` uses database `skip/take`.
- **Impact:** The endpoint is bounded in returned payload but not in database transfer or server memory for these sort modes. A month/range query can grow linearly with the selected date range and concurrent Admin users.
- **Recommendation:** Push sortability into a database projection/column or a queryable aggregate, or explicitly cap/date-limit these modes until a measured indexed design is approved. Use `EXPLAIN ANALYZE` before adding indexes.
- **Effort:** M
- **Acceptance criteria:** 20,000-appointment duration/payment-sort fixtures keep server memory, query rows, payload, and p95 within agreed budgets; page results are deterministic; no full-match ID scan remains for the production path unless it is justified by a measured budget.

#### PERF-006 — Board loads all active appointments before returning only four up-next rows

- **Classification:** Potential Risk
- **Severity:** P2
- **Evidence:** `src/server/services/prisma-operations.ts:747-765` finds every current-day appointment in active statuses with nested board relations. `:809-821` then slices `upNext` to four after mapping.
- **Impact:** The response may be small, but database relation work and object mapping scale with the entire active queue. The local 20,000-appointment board benchmark had a small active subset and does not prove behavior with a large live queue.
- **Recommendation:** Query current turns and the top queue window separately, or use a deliberately lean capped projection while retaining enough data for current multi-service state. Keep public redaction and version semantics unchanged.
- **Effort:** M
- **Acceptance criteria:** A large active-queue fixture shows that DB rows/relations loaded are bounded by the configured current/next window; current turns remain complete; public and authenticated payload contracts remain redacted/correct; board p95 stays within target.

#### PERF-007 — Customer directory and customer history are unbounded

- **Classification:** Potential Risk
- **Severity:** P2
- **Evidence:** `src/server/services/admin-operations.ts:250-256` returns all customers with client-side search at `src/components/admin-management.tsx:169-190`. `:258-270` returns all matching appointment history for a customer, and `src/components/admin-management.tsx:215-236` opens the complete history before filters are applied.
- **Impact:** Long-lived salons can load a large directory and a large history modal into one client render. Search and history can become slow on a tablet even though appointment history was bounded elsewhere.
- **Recommendation:** Add server-side customer search/pagination and paged customer history with a summary query separate from rows. Preserve the current customer-history filters and historical snapshots.
- **Effort:** M
- **Acceptance criteria:** 20,000 customers and a customer with 1,000 visits load bounded rows/payload; search latency is measured; summary totals remain correct; opening history does not fetch the entire lifetime before the user requests a page.

#### PERF-008 — Several history filters depend on broad scans or substring search without a measured index plan

- **Classification:** Potential Risk
- **Severity:** P2
- **Evidence:** `src/server/services/prisma-operations.ts:921-927` uses `contains` search on code/customer name/phone; `:955-968` runs an unscoped `GROUP BY appointment_id` over all `appointment_services` for SINGLE/MULTI filtering. `prisma/schema.prisma:227-254` has no `serviceId` index on `AppointmentService`; current indexes are useful for appointment/status and primary staff but do not prove all filter plans.
- **Impact:** Month/range history queries can scan lifetime relation data as the salon grows. This is not shown as a current failure by the disposable fixture, but it is a scale risk.
- **Recommendation:** Capture `EXPLAIN ANALYZE` for representative day/month/range/search/service-count/staff filters. Add only indexes or search structures supported by those plans, with date scoping in service-count aggregation where safe.
- **Effort:** M
- **Acceptance criteria:** Query plans and row counts are captured at 20,000 and agreed staging volume; search/filter p95 and memory meet target; index additions are justified by before/after plans rather than speculative.

#### PERF-009 — Admin is a very large client boundary and the stylesheet/fonts lack a measured budget

- **Classification:** Potential Risk
- **Severity:** P2
- **Evidence:** `app/(admin)/admin/page.tsx:1-44` is a single `'use client'` page importing all Admin management/access/config/action/keypad modules and contains 4,282 lines. `app/globals.css` is 11,909 lines/approximately 252 KB unminified and starts with a remote Google Fonts `@import` at `:1`. There is no bundle-analyzer script in `package.json`.
- **Impact:** Initial Admin JS/CSS and external font requests may increase time-to-interactive on shared tablets or slow salon Wi-Fi. The source size is evidence of a measurement need, not proof of a failing production bundle.
- **Recommendation:** Measure route-level compressed JS/CSS, FCP/LCP/TTI, and font timing in a production build on the target network. If the budget is missed, split client islands/route-level modules, remove dead/duplicate CSS, and self-host or deliberately fallback fonts without changing the approved visual system.
- **Effort:** M/L
- **Acceptance criteria:** A documented Admin/kiosk/board asset budget exists; production-build measurements are captured on target hardware/network; Admin does not load unused management chunks above the agreed budget; fonts have a bounded fallback/timeout behavior.

#### PERF-010 — Board polling documentation and implementation disagree

- **Classification:** Confirmed
- **Severity:** P2
- **Evidence:** `docs/requirements.md:21`, `docs/architecture.md:110`, and `docs/decisions.md:66` describe a three-second polling refresh. `app/(board)/board/page.tsx:207-212` polls every five seconds and checks staleness every five seconds.
- **Impact:** QA/SLO expectations, perceived new-check-in latency, and operations documentation are inconsistent. Five seconds may be a deliberate improvement, but the contract is not singular.
- **Recommendation:** Choose the approved polling interval based on measured tablet/DB cost, then update all requirements/architecture/decision text or change the implementation. Keep the visible sync-state contract independent of the exact interval.
- **Effort:** S
- **Acceptance criteria:** One interval is stated in source/config and all product/architecture docs; a browser/network test verifies new check-ins appear within the stated bound and the change does not exceed the DB/request budget.

#### PERF-011 — Production performance and pool SLOs remain unverified

- **Classification:** Requires Runtime Verification
- **Severity:** P1
- **Evidence:** `docs/implementation/RELEASE_CHECKLIST.md:28-39` and `docs/project_state.md:105-120` record that staging/deployed pool, lock-wait, network, memory, bundle, and representative-history measurements remain open. The local profile is explicitly disposable/loopback only.
- **Impact:** The app may pass local load while production proxy buffering, Wi-Fi latency, pool limits, CPU/memory, or a multi-tablet burst changes behavior.
- **Recommendation:** Define launch SLOs and run the authenticated HTTP/load, lock/pool, SSE, and asset tests against staging with the real proxy and a representative data volume. Keep local measurements as regression baselines.
- **Effort:** M (runtime validation)
- **Acceptance criteria:** Staging records p50/p95/p99, error rate, pool saturation, lock waits, SSE reconnect time, payload sizes, memory, and bundle metrics for three-tablet and burst scenarios; thresholds and escalation owners are written before launch.

## 5. Security and reliability findings

#### SEC-001 — Persistent PIN lockout update is a read-then-write race across processes

- **Classification:** Potential Risk
- **Severity:** P1
- **Evidence:** `src/server/security.ts:41-64` reads `failureCount`, increments in application code, then upserts the new count. In-memory protection is synchronous per process, but separate app processes can read the same database count and overwrite one another.
- **Impact:** Under concurrent wrong-PIN attempts across replicas, the persistent failure count can be undercounted and lockout may occur later than intended. This undermines the documented cross-process protection even though the single-process path is stronger.
- **Recommendation:** Use an atomic database increment/upsert, a row lock/transaction, or a dedicated SQL update that derives `lockedUntil` from the committed count. Retain the in-memory fast path but treat the database record as the authority.
- **Effort:** S/M
- **Acceptance criteria:** Five or more concurrent wrong-PIN attempts across two app processes produce one deterministic lockout window; attempts during the window are rejected; a successful PIN clears both in-memory and persistent state; no race loses failures.

#### SEC-002 — Production CSP permits unsafe inline scripts/eval and external font origins

- **Classification:** Potential Risk
- **Severity:** P1
- **Evidence:** `proxy.ts:11-22` sets `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, `style-src 'unsafe-inline' https://fonts.googleapis.com`, and `font-src https://fonts.gstatic.com` for all matched requests.
- **Impact:** The policy provides less XSS defense than a nonce/hash-based production policy. External font dependency also expands the browser trust/network surface. Some directives may be required by framework/runtime behavior, but the current policy has not been validated as the minimum production policy.
- **Recommendation:** Run a production CSP report-only pass, identify framework-required inline/eval behavior, then move toward nonces/hashes and self-hosted fonts where compatible. Keep `frame-ancestors`, `base-uri`, `form-action`, and security headers intact.
- **Effort:** M
- **Acceptance criteria:** Staging CSP reports are reviewed; production policy contains no unnecessary unsafe directives; Next/Auth.js/PWA flows still work; security-header tests assert CSP, HSTS, frame, referrer, and permissions policy.

#### SEC-003 — Optional nginx profile and exposed app port can bypass TLS/rate limits

- **Classification:** Requires Runtime Verification
- **Severity:** P0
- **Evidence:** `docker/docker-compose.yml:18-44` publishes the app directly on host port 3000. `docker/docker-compose.yml:65-74` makes nginx an optional `proxy` profile. `docker/nginx.conf:4-6,18-40` contains the kiosk/API rate limits, SSE buffering, and HTTP proxy, while `:50-52` leaves production TLS as an operator comment.
- **Impact:** If port 3000 is reachable from the salon/LAN/WAN, traffic can bypass nginx rate limits and TLS termination. Public lookup/check-in abuse, credentials, session cookies, and direct-origin assumptions then depend on an unverified external firewall.
- **Recommendation:** Make the deployment topology explicit: bind app only to an internal network/loopback, terminate TLS at the approved ingress, preserve forwarded-host/proto correctness, apply rate limits at the actual public edge, and verify direct 3000 is unreachable. Do not expose `.env` values in diagnostics.
- **Effort:** M (deployment)
- **Acceptance criteria:** External scan cannot reach the app container port; only the TLS ingress serves the app; kiosk/API rate limits are observed at the public edge; SSE remains unbuffered; security cookies/HSTS/origin checks are validated through the real proxy.

#### SEC-004 — Approved kiosk name lookup still depends on trusted-kiosk privacy and edge controls

- **Classification:** Requires Runtime Verification
- **Severity:** P1
- **Evidence:** `app/api/kiosk/customer-lookup/route.ts:15-32` returns `{found,name}` for a normalized phone and marks the response `no-store`. `src/server/services/prisma-operations.ts:739-745` selects the stored name. The approved privacy decision is recorded in `docs/decisions.md` and `docs/project_state.md`; application-level rate limiting is not present, while edge limits are in `docker/nginx.conf:4-6,18-23`.
- **Impact:** This is approved business behavior, not an unapproved feature. However, a person at a kiosk can test phone numbers, and direct app exposure or a different ingress may remove the documented edge rate limit. The risk is privacy/abuse, not response caching.
- **Recommendation:** Keep option A only on trusted kiosks, verify edge rate limiting and monitoring in deployment, and document the privacy assumption. Revisit masked/no-lookup behavior only as a product decision.
- **Effort:** S/M (deployment/policy)
- **Acceptance criteria:** Public-edge requests are rate-limited and logged without logging full phone/name values; direct app access is blocked; response headers are `no-store`/`no-referrer`; abuse alerts and kiosk placement/privacy signage are documented.

#### REL-001 — Online-first PWA registration does not provide offline mutation recovery

- **Classification:** Confirmed
- **Severity:** P2
- **Evidence:** `public/sw.js:1-11` registers install/activate/fetch listeners but does not cache or queue requests. `src/components/PWAProvider.tsx:5-16` registers it silently after page load. Kiosk mutation recovery relies on the in-memory idempotency key at `app/(kiosk)/kiosk/page.tsx:337-353`.
- **Impact:** A tablet losing network during catalog load, lookup, or submission has no offline shell or durable command status. Same-session retry is safer than a duplicate, but a browser refresh or process restart loses the client form/key and can leave the customer uncertain.
- **Recommendation:** Preserve online-only MVP scope. Make the UI explicitly say that submission is online-only, preserve form state and a “checking status/retry with same key” state for in-flight requests, and validate refresh-during-mutation. Do not imply offline success from the installable PWA shell.
- **Effort:** S/M
- **Acceptance criteria:** Offline catalog/lookup/submit states are explicit; a timeout never presents success without a server receipt; same-session retry reuses the key; refresh-during-mutation has a documented recovery path; the PWA manifest does not imply offline mutation support.

#### REL-002 — Migration rollback and production restore are not rehearsed

- **Classification:** Requires Runtime Verification
- **Severity:** P1
- **Evidence:** `docker/docker-compose.yml:46-63` runs `prisma migrate deploy` before the app. `docs/implementation/FINAL_REPORT.md` and `docs/implementation/RELEASE_CHECKLIST.md:36-39` record additive migrations with no generated down migration and an open backup/restore rollback rehearsal.
- **Impact:** A failed follow-up migration or application release cannot be safely undone by a simple down command. Without a staging restore rehearsal, the operational recovery time and data-loss boundary are unknown.
- **Recommendation:** Rehearse backup/restore and forward corrective migration on staging; document the gate before applying production migrations. Keep migration service ordering and database-volume preservation.
- **Effort:** M (operations)
- **Acceptance criteria:** A staging backup restores to a clean PostgreSQL instance; a failed app deploy can be rolled back with the documented procedure; migration/seed logs and schema versions are captured; no production volume reset is used.

#### OBS-001 — Request timing/command telemetry does not cover the full API surface

- **Classification:** Confirmed
- **Severity:** P1
- **Evidence:** `src/server/observability.ts:12-40` provides the wrapper. Only these route files import it: health, board, kiosk check-in, payment confirm, cancellation, closing, and retention. `app/api/admin/appointments/route.ts:1-80`, `app/api/admin/reports/route.ts:1-24`, `app/api/admin/config/route.ts:1-27`, and the Admin CRUD routes do not wrap their requests. The release checklist acknowledges full admin-route coverage remains open.
- **Impact:** The highest-volume Admin reads and several mutation failures lack uniform request ID, duration, outcome, and rejection telemetry, making stale-data, slow-query, and operator-failure diagnosis harder.
- **Recommendation:** Add a consistent wrapper at the route boundary or a shared handler adapter for Admin/API routes, with redacted metadata. Add dashboards/alerts for p95, 4xx/5xx, pool/lock waits, stale board, job failures, and kiosk lookup abuse.
- **Effort:** M
- **Acceptance criteria:** Every operational route emits request ID/status/duration; sensitive body fields are excluded; dashboards show Admin refresh latency/errors and job/board/lookup health; alert thresholds are tested with a staging fault.

#### REL-003 — Generic Admin create commands are not retry-safe after an unknown outcome

- **Classification:** Potential Risk
- **Severity:** P2
- **Evidence:** `src/components/admin-management.tsx:84-105` posts generic customer/staff/service/category mutations without an idempotency key; `app/api/admin/customers/route.ts:15-26` and analogous Admin routes create records without `CommandReceipt`. The UI disables the button while waiting, but a network timeout leaves the operator free to submit again.
- **Impact:** A successful create followed by a lost response can produce duplicate service/category/staff/account records or a confusing uniqueness error on retry. Critical operational commands already have stable receipts; this finding is limited to generic master-data creates.
- **Recommendation:** Either add idempotency only to create commands that can be retried, or provide an explicit “check whether it was saved”/refresh recovery before allowing a second create. Do not add receipts to harmless idempotent updates without need.
- **Effort:** M
- **Acceptance criteria:** A create response lost after commit has one deterministic recovery path and one record; changed payload under a reused key is rejected; normal create/edit/delete workflows and audit records remain unchanged.

## 6. Test coverage gaps and evidence quality

The recorded latest static evidence is: 34 unit/default tests passed, 9 DB-gated tests skipped without DB variables; coverage 24.88% statements/lines, 68.75% branches, 11.39% functions; sequential disposable PostgreSQL suites `postgres 3/3`, `admin-access 1/1`, `critical-workflows 5/5`; protected tablet E2E 7/7; returning-guest kiosk E2E 2/2; resilience E2E 3/3; Chromium viewport review passed at 810×1080 and 1080×810. Coverage percentages are not a quality score by themselves; the scenario gaps below matter more.

#### QA-001 — Follow-up catalog/payment traceability paths lack dedicated DB/E2E evidence

- **Classification:** Confirmed
- **Severity:** P1
- **Evidence:** `docs/implementation/TEST_MATRIX.md:28-29` marks catalog lifecycle as NOT RUN and payment adjustment/correction/refund as NOT RUN. `:29` also identifies turn-history DB/API coverage as NOT RUN. `tests/e2e/appointment-history.spec.ts` covers a basic browser turn-history happy path, but not the full actor/snapshot/filter/edge matrix.
- **Impact:** New category archive guards, payment audit semantics, refunds, and turn-event snapshots can pass static/type checks while a transaction boundary or report calculation is wrong.
- **Recommendation:** Add sequential disposable-PostgreSQL tests and focused Admin E2E tests for each follow-up command. Keep external terminal/refund execution outside the app and assert only the recorded evidence.
- **Effort:** M
- **Acceptance criteria:** Category create/update/archive/reactivate, archived-service rejection, payment adjustment/correction/refund caps/idempotency/audit history, and turn-event actor/staff snapshot/filter rendering all pass DB/API/browser tests.

#### QA-002 — Session revocation, PIN lockout concurrency, and key-reuse conflicts are not fully exercised

- **Classification:** Confirmed
- **Severity:** P1
- **Evidence:** `docs/implementation/TEST_MATRIX.md:25-29` marks deactivated-account access and verified-session revocation NOT RUN; `:14` marks changed-payload same-key check-in NOT RUN. `src/server/security.ts:41-64` contains the cross-process race risk. Existing concurrency coverage in `tests/integration/concurrency.test.ts` uses an in-memory `AssignmentMutex`, while real DB accept concurrency is covered in `tests/integration/critical-workflows.test.ts:92-109`.
- **Impact:** Auth/session and retry safety are central to a shared-tablet system; the current pass set does not prove immediate invalidation, persistent lockout under replica concurrency, or every request-hash conflict response.
- **Recommendation:** Add auth integration tests with real session cookies/JWT reads, two-process or transaction-level PIN attempts, and changed-payload receipt tests for kiosk/staff/payment commands.
- **Effort:** M
- **Acceptance criteria:** Deactivated/role-changed accounts fail on the next protected request; revoked staff sessions fail; five concurrent wrong PINs lock out; every critical command rejects changed payload under the same key and leaves one side-effect set.

#### QA-003 — Parent Admin stale/error races and accessibility interactions are not tested

- **Classification:** Confirmed
- **Severity:** P1
- **Evidence:** `docs/implementation/TEST_MATRIX.md:47-54` records modal focus/loading/empty/error/stale messaging as NOT RUN. The E2E suite has no delayed-response test for `app/(admin)/admin/page.tsx:273-346`, no non-Overview background-refresh failure test, and no VoiceOver/WebKit test.
- **Impact:** The highest-risk operator UI behavior is currently code-reviewed rather than behavior-tested: stale data can be acted on, focus can escape mobile navigation, and accessibility semantics may regress unnoticed.
- **Recommendation:** Add Playwright route interception tests for delayed/out-of-order refreshes, section-specific failures, retry/recovery, keyboard tab/dialog/drawer behavior, and visible stale indicators. Run manual WebKit/VoiceOver on hardware.
- **Effort:** M
- **Acceptance criteria:** Old responses cannot overwrite new scope; every Admin section exposes refresh failure/staleness; modal/drawer focus/escape/restore passes; loading/empty/error states are asserted for kiosk, board, Admin, and payment flows.

#### QA-004 — Performance tests do not isolate allocator/routing/history-sort workloads

- **Classification:** Confirmed
- **Severity:** P1
- **Evidence:** `docs/implementation/TEST_MATRIX.md:64-78` records broad local/representative benchmarks, but no dedicated 20,000-appointment check-in allocator, 1,000-waiting-appointment reconcile, duration/payment-sort memory test, or large customer directory/history test. The current benchmark proves the bounded default history path, not all sort modes.
- **Impact:** The most likely volume-dependent lock/CPU risks can regress while the headline benchmark remains green.
- **Recommendation:** Extend disposable benchmark fixtures and record query count, rows, memory, lock waits, p95/p99, and payload for each path in PERF-003 through PERF-008.
- **Effort:** M
- **Acceptance criteria:** Each high-risk path has a named benchmark threshold and repeatable fixture; results are stored with the release evidence; failures block optimization claims but do not trigger speculative index changes.

#### QA-005 — Physical device, live-network, and deployment gates remain open

- **Classification:** Requires Runtime Verification
- **Severity:** P0
- **Evidence:** `docs/implementation/VIEWPORT_QA.md:48-52`, `docs/implementation/RELEASE_CHECKLIST.md:32-39`, and `docs/project_state.md:105-126` explicitly leave physical iPad/WebKit, distance readability, Dynamic Type/VoiceOver, live Wi-Fi, offline/refresh-during-mutation, production SLOs, scheduler, security audit, rollback, and follow-up tests open.
- **Impact:** A production release decision would be based on Chromium/local evidence only. Failures at this gate can affect customer check-in, shared-board visibility, payment operations, or recovery from a network event.
- **Recommendation:** Execute `docs/implementation/TABLET_QA_PLAN.md` on the selected iPad model and staging network, then run the deployment/security/rollback checklist. Keep results separate from local test pass counts.
- **Effort:** L (validation)
- **Acceptance criteria:** Physical Kiosk/Board/Admin journeys pass portrait/landscape; VoiceOver/Dynamic Type/focus/touch/safe-area checks pass; real network interruption/recovery and refresh-during-mutation are observed; staging proxy/TLS/pool/SLO/rollback/scheduler evidence is attached to release approval.

## 7. Prioritized P0/P1/P2 backlog

| ID | Backlog item | Priority | Classification | Effort | Dependencies | Definition of done |
|---|---|---:|---|---:|---|---|
| SEC-003 | Close direct-app-port/TLS/rate-limit ingress gap | P0 | Requires Runtime Verification | M | Selected deployment topology | App port is not externally reachable; public TLS ingress and edge rate limits are verified; cookies/origin/SSE work through the real proxy. |
| QA-005 | Complete physical tablet, live Wi-Fi, accessibility, and staging release gates | P0 | Requires Runtime Verification | L | Hardware, staging network, operator | Physical three-surface run sheet, accessibility checks, network interruption, pool/SLO, and rollback evidence are signed off. |
| BUS-001 | Enforce configured kiosk hours server-side and refresh client status | P1 | Confirmed | M | Business boundary decision | Direct and UI check-in behavior matches timezone/open-close rules at boundaries; no out-of-hours appointment is created. |
| UX-ADM-001 | Expose global Admin stale/error state outside Overview | P1 | Confirmed | M | Data-health copy decision | Queue, Appointments, Payments, Customers, and Settings show last success/stale/retry state and safe action behavior. |
| PERF-001/002 | Reduce Admin refresh fan-out and make refresh revisions abort/order-safe | P1 | Confirmed | M | Agree request/payload budget | Active-section refreshes meet request budget; delayed old responses cannot overwrite newer data; background refresh is visibility-aware. |
| PERF-003/004 | Bound routing/check-in work under the shop/date lock | P1 | Potential Risk | M/L | Routing fixture and code policy | Waiting-queue and high-volume code benchmarks pass; query count/lock/p95 evidence supports the chosen implementation. |
| PERF-005 | Replace all-match duration/payment sort scans with measured database/page strategy | P1 | Confirmed | M | Query-plan review | Sort pages remain bounded in rows/memory/p95 at representative volume and deterministic ordering is preserved. |
| SEC-001 | Make persistent PIN failure counting atomic | P1 | Potential Risk | S/M | Replica/concurrency test harness | Cross-process wrong-PIN attempts produce one deterministic lockout and safe reset behavior. |
| SEC-002 | Harden/measure production CSP and self-host/fallback fonts | P1 | Potential Risk | M | Production Next/Auth/PWA CSP test | CSP report review complete; unnecessary unsafe directives removed; all operational routes still work. |
| OBS-001 | Instrument the remaining Admin/API route surface and dashboards | P1 | Confirmed | M | Logging/alert destination | Every route emits redacted request ID/status/duration; stale-board, job, lock, pool, and lookup alerts are tested. |
| QA-001/002/003/004 | Add follow-up DB/E2E/auth/UI/performance scenario evidence | P1 | Confirmed | M | Disposable PostgreSQL CI job | Missing category/payment/session/PIN/race/stale/focus/scale cases pass in repeatable CI or staging jobs. |
| UX-ADM-003 / UX-BRD-003 / UX-KSK-002 | Complete portrait/landscape/table/distance validation and compact-mode decisions | P1 | Requires Runtime Verification | M | Hardware and supported-width decision | No clipped primary action or undiscoverable module; board readable from agreed distance; physical touch pass recorded. |
| BUS-003 | Centralize active service + active category predicate | P2 | Potential Risk | S | None | Direct check-in/service-change cannot select an archived-category service; current archive guard remains intact. |
| PERF-006/007/008 | Bound board queue, customer directory/history, and remaining filter scans | P2 | Potential Risk | M | Representative fixture | Rows/payload/query plans are bounded and search/history remain usable at agreed scale. |
| PERF-009 | Measure route bundles and reduce unnecessary Admin client/CSS/font cost if budget is missed | P2 | Potential Risk | M/L | Production asset trace | Route asset budgets and tablet TTI are documented; optimization is evidence-driven. |
| UX-KSK-003/004, UX-BRD-001/002, UX-ADM-002/005, UX-SHR-001/002 | Complete shared accessibility semantics, live-region, contrast, focus, and payment-error pass | P2 | Confirmed/Potential Risk | S/M | VoiceOver/manual keyboard review | All shared primitives pass keyboard/screen-reader/contrast checks without regressions. |
| REL-001 / REL-003 | Make online-only recovery explicit and retry-safe for generic Admin creates | P2 | Confirmed/Potential Risk | S/M | Product copy and receipt scope | No mutation appears successful without a server response; unknown outcomes have a safe recovery path; duplicate generic creates are prevented or detected. |
| BUS-002 / PERF-010 | Write repeated-skip and polling contracts into product/architecture docs | P2 | Potential Risk/Confirmed | S | Product decision | Repeated-skip escalation and board freshness interval are explicit, consistent, and tested. |
| BUS-004 / REL-002 | Complete scheduler, alerting, retention policy, and rollback rehearsal | P1 | Requires Runtime Verification | M | Operator approval/backup | Jobs run on schedule with alerting; retention window and restore procedure are approved and rehearsed. |

## 8. Quick wins

These are small, low-scope improvements that do not change MVP business scope:

1. Add a server-side open-hours check and a short client clock/visibility refresh for the kiosk.
2. Add a global Admin stale/error banner and a refresh revision/AbortController; do not wait for a larger read-model redesign.
3. Remove the second-by-second `aria-live` countdown and announce only verification state changes.
4. Align the documented board polling interval with the actual five-second implementation after choosing the measured target.
5. Darken `--color-muted-taupe` for meaningful helper text and add a contrast regression check.
6. Add the missing Admin mobile-drawer focus trap/restore using the existing `useDialogFocus` behavior.
7. Add direct API tests for out-of-hours check-in, changed request-hash reuse, and archived-category service selection.
8. Add a route-level request wrapper for the highest-volume Admin GETs before building dashboards.

## 9. Recommended implementation batches

### Batch 0 — Release gate and operating decisions

**Goal:** Make the supervised-pilot boundary explicit and collect runtime evidence.

- Confirm physical iPad model/orientation, board viewing distance, staged network, TLS/ingress, public port exposure, pool limits, and SLOs.
- Decide repeated-skip escalation and the documented board freshness interval.
- Approve retention window, scheduler ownership, alert channel, and backup/restore rollback procedure.

**Exit criteria:** QA-005, SEC-003, BUS-004, and REL-002 evidence is attached; no source fixes are implied by this batch until decisions are approved.

### Batch 1 — Correctness and security boundary hardening

**Goal:** Remove the most credible production-rule/security gaps with small targeted changes.

- Implement BUS-001 server-side hours and BUS-003 catalog predicate centralization.
- Make SEC-001 persistent PIN counting atomic.
- Validate SEC-002 CSP policy and SEC-004 edge privacy/rate-limit behavior.
- Add QA-002 direct tests for sessions, PIN lockout, request-hash conflicts, and generic command recovery decisions.

**Exit criteria:** All new boundary tests pass against disposable PostgreSQL; no approved workflow rule changes; audit/telemetry records remain intact.

### Batch 2 — Admin data path and database scale

**Goal:** Reduce unnecessary work and make scale behavior measurable before optimizing schema.

- Fix PERF-001/002 refresh scope/order/error behavior.
- Profile PERF-003/004 routing and code allocation under representative waiting volume.
- Address PERF-005 sort modes with measured query plans.
- Add bounded customer directory/history and board queue projections only where fixtures demonstrate need.

**Exit criteria:** Query count, payload, memory, lock-wait, and p95/p99 budgets are recorded for each path; schema changes are justified by `EXPLAIN ANALYZE`.

### Batch 3 — Tablet UX and accessibility

**Goal:** Close the interaction gaps without redesigning the approved information architecture.

- Complete tab/live-region/contrast semantics.
- Add Admin drawer focus containment and payment inline errors.
- Validate kiosk CTA/step focus, portrait navigation/table affordances, board distance readability, and real touch.

**Exit criteria:** Physical WebKit/VoiceOver/Dynamic Type/manual keyboard results pass; no clipped or hidden primary action; accessibility regression notes are retained.

### Batch 4 — Observability and operational proof

**Goal:** Make production incidents diagnosable and prove unattended operations.

- Instrument all Admin/API routes with redacted timing/status/request IDs.
- Configure job scheduling/retry/alerting and retention runbook.
- Rehearse migration backup/restore, deployment rollback, direct-port blocking, CSP, and pool saturation.

**Exit criteria:** Operator dashboards show board freshness, command failures, API p95/5xx, lock/pool health, kiosk lookup abuse, and job outcomes; rollback is practiced on staging.

## 10. Acceptance criteria and test cases

| ID | Test case | Expected result |
|---|---|---|
| AC-01 | POST check-in just before opening, at opening, just before closing, at closing, and outside window | Opening is accepted; closing is rejected; exact timezone/boundary rule is documented and consistent in UI/API. |
| AC-02 | Leave kiosk open across closing, then submit without reload | UI changes to Closed and server rejects the new visit; no customer/appointment side effects. |
| AC-03 | Replay a previously successful in-hours check-in key after the window closes | Behavior follows the documented replay rule and never creates a second visit. |
| AC-04 | Direct check-in/service-change request for active service in archived category | Rejected with stable error; no receipt/appointment/service-change side effect. |
| AC-05 | Five concurrent wrong PINs across two app processes | Persistent lockout is reached once; subsequent attempts fail until expiry; successful PIN clears state. |
| AC-06 | Deactivate/role-change an account with an existing JWT; revoke verified staff session | Next protected request fails; public board/kiosk remain available; no stale privilege. |
| AC-07 | Delay old Admin report/appointment response, then change date/month and complete new request | Old response is ignored/aborted; newest scope is visible; timestamp/revision reflects newest success. |
| AC-08 | Fail background refresh while Queue, Payments, Appointments, Customers, and Settings are active | Each section shows stale/error/retry state; operator cannot mistake old data for live data. |
| AC-09 | Idle Admin for 30 minutes at each section | Request count/payload matches agreed budget; hidden tab does not cause unnecessary polling; manual refresh works. |
| AC-10 | Reconcile 1,000 waiting appointments with multi-service bundles | Query count and transaction/lock p95 meet budget; assignments preserve skills, fairness, and exclusions. |
| AC-11 | Create a new check-in with 20,000 same-day codes and concurrent clients | Unique sequential-format codes, bounded p95/p99, no duplicate/receipt conflict, documented gap/rollback policy. |
| AC-12 | Duration/payment sort over 20,000 appointments, pages 1/100/last | Returned page is correct/deterministic; full-match memory/rows/p95 stay within budget. |
| AC-13 | Large customer directory and 1,000-visit customer history | Server pagination/search bounds rows and payload; summary totals match full fixture. |
| AC-14 | Board with large active queue and public/authenticated views | Current turns are complete; only configured next window is loaded/returned; redaction and version behavior remain correct. |
| AC-15 | Board verified PIN dialog and countdown with VoiceOver/keyboard | Focus enters/traps/restores; Escape closes; countdown is not announced every second; action status is announced once. |
| AC-16 | Kiosk category tabs, step changes, Admin tabs, mobile drawer | Correct tab semantics/keyboard navigation; focus moves to new content; drawer traps/restores focus. |
| AC-17 | Kiosk landscape, Board portrait/distance, Admin portrait, Dynamic Type largest setting | No clipped primary action; text/status readable; tables/nav discoverable; safe-area insets preserved. |
| AC-18 | Payment invalid amount/tip/cash and lost response after commit | Inline field error/focus; values preserved; retry/refresh resolves one payment state; no duplicate payment/audit event. |
| AC-19 | Category lifecycle, payment adjustment/correction/refund, turn history | DB transaction, audit metadata, idempotency, caps, actor/staff snapshots, and UI filtering all pass. |
| AC-20 | Public ingress security smoke | Port 3000 is unreachable externally; TLS/HSTS/cookies/origin/rate-limit/SSE headers are correct; no secrets in logs. |
| AC-21 | Closing and retention scheduler replay/failure | Jobs run on schedule, emit success/failure/blocked alerts, replay safely, and honor approved retention/backup policy. |
| AC-22 | Migration backup/restore and failed-release rollback | Staging restore and forward corrective migration are rehearsed; production rollback instructions are executable without volume reset. |

## 11. Final handoff

The initial audit was completed read-only. After the user approved implementation, the safe in-scope MVP improvements were applied to source/config/tests and verified locally. No migration/schema, business data, Docker volume, or database records were reset or deleted.

Implemented follow-up includes server-side kiosk operating-hours enforcement, tablet focus/keyboard/live-region/payment recovery improvements, Admin stale/revision-safe refresh with hidden-tab pause, customer/history pagination, routing snapshot reuse, bounded board up-next reads, atomic PIN lockout counting, operational API telemetry, loopback Docker bindings, and the documented five-second board polling contract. Local typecheck, lint, unit tests, production Docker build, health, and screen smoke checks passed. Nine DB-gated tests remain skipped when the test database is not enabled.

Physical iPad/WebKit/VoiceOver/distance QA, staging TLS/edge-rate-limit/direct-port verification, scheduler/alerting, backup/restore/rollback rehearsal, production pool/SLO, and representative scale benchmarks remain runtime release gates and are not claimed as complete from local source checks alone.
