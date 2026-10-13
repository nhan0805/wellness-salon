# Wellness Salon — Báo cáo đánh giá sản phẩm toàn diện

**Ngày audit:** 2026-10-12  
**Repository:** /Users/hanhuynh/Downloads/Wellness Salon  
**Phạm vi audit:** Đọc-only repository và review bằng chứng  
**Sản phẩm:** MVP vận hành salon nail ưu tiên tablet: Kiosk khách hàng, Turn Board cho nhân viên, Admin Console

## Phạm vi và quy ước bằng chứng

Audit này đã xem xét source tree hiện tại, Prisma schema và migrations, route handlers, domain/state logic, các UI component dùng chung, styles, Docker deployment files, tests và các tài liệu sản phẩm sau trước khi phân tích source:

- README.md, AGENTS.md
- docs/project_state.md, docs/requirements.md, docs/architecture.md, docs/decisions.md
- docs/implementation/TEST_MATRIX.md, docs/implementation/RELEASE_CHECKLIST.md
- docs/implementation/FINAL_REPORT.md, docs/implementation/PROGRESS.md
- docs/implementation/TABLET_QA_PLAN.md, docs/implementation/VIEWPORT_QA.md
- Nội dung liên quan đến sản phẩm, kiến trúc, NFR và QA trong docs/lifecycle/*
- Audit nền trước đó: docs/audits/2026-10-10-nail-salon-mvp-audit.md

Audit trước và implementation handoff được xem là bằng chứng lịch sử, không phải bằng chứng rằng một finding vẫn còn tồn tại. Các mục được ghi là đã triển khai đã được kiểm tra lại trong source hiện tại khi có ý nghĩa.

Phân loại:

- **Đã xác nhận (Confirmed)** — nhìn thấy trực tiếp trong source hiện tại, schema, test source hoặc bằng chứng chạy đã ghi nhận.
- **Rủi ro tiềm ẩn (Potential Risk)** — có cơ sở từ implementation hiện tại, nhưng cần đo đạc hoặc quyết định có mục tiêu trước khi kết luận là lỗi production.
- **Cần xác minh khi chạy thực tế (Requires Runtime Verification)** — repository ghi rõ scenario chưa được chạy, hoặc cần phần cứng, hạ tầng deployed hay điều kiện vận hành thực tế.

Mức độ ưu tiên:

- **P0** — chặn production không giám sát an toàn hoặc tạo ra rủi ro bảo mật/toàn vẹn dữ liệu đáng kể.
- **P1** — rủi ro lớn trước pilot, trước launch hoặc khi scale.
- **P2** — follow-up có giá trị với tác động vận hành có giới hạn.

Effort tương đối: **S** (nhỏ), **M** (vừa), **L** (lớn). Các khuyến nghị vẫn giữ nguyên business rule MVP đã được duyệt và không mở rộng sang online booking, payment-gateway processing, staff mobile app, payroll, inventory, loyalty hoặc multi-tenant.

## 1. Tóm tắt điều hành

### Kết luận tổng thể

Codebase hiện tại là nền tảng tốt cho một supervised pilot. Luồng nghiệp vụ chính đã tồn tại đầu-cuối: kiosk check-in, routing theo skill/attendance, staff accept/skip/finish, support, manager cancellation/service change/reassignment/skip override, xác nhận thanh toán qua terminal bên ngoài, truy vết payment, audit event và đồng bộ board.

Các hardening được ghi nhận trong tài liệu implementation thực sự có trong source hiện tại. Cụ thể, exact service/staff skip exclusion, session/PIN control có lưu DB, advisory lock trong transaction, request-hash receipt, board read không có side effect, SSE reconnect/polling fallback, public-board redaction, pagination cho appointment history và các command điều chỉnh/hoàn tiền có audit không phải là các feature còn thiếu và không nên triển khai lại.

Repository chưa có đủ bằng chứng cho production không giám sát. Các rủi ro còn lại lớn nhất là:

1. Giờ mở cửa kiosk hiện chỉ được quyết định ở client và chưa được enforce trong createDbCheckIn; trang kiosk cũ hoặc caller gọi API trực tiếp vẫn có thể submit ngoài khung giờ cấu hình.
2. Admin parent refresh thực hiện bốn request mỗi mười giây, trong đó có appointment projection nặng và không giới hạn. Refresh không có abort/sequence guard; lỗi refresh chỉ hiện khi đang ở section Overview.
3. Routing và sinh appointment code chạy trong shop/date lock với khối lượng phụ thuộc daily volume. Benchmark local hiện cho kết quả chấp nhận được, nhưng chưa tách riêng workload check-in allocator với queue lớn hoặc 20.000 appointment.
4. Nhiều gate tablet và accessibility vẫn chưa được xác minh trên iPad/WebKit thật: khả năng đọc từ khoảng cách vận hành, Dynamic Type, VoiceOver, keyboard/focus, safe area, touch thực tế và Wi-Fi gián đoạn.
5. Security production phụ thuộc các quyết định deployment chưa được sign-off: topology TLS/ingress, port 3000 có truy cập trực tiếp hay không, rate limiting bên ngoài, CSP hardening, scheduler/alerting và rollback rehearsal.

### Khuyến nghị release

Tiếp tục xem ứng dụng là supervised pilot. Trước production không giám sát, cần đóng các P0 release gate trong báo cáo này, enforce giờ mở cửa kiosk ở server, hoàn tất kiểm thử tablet/network thực tế và chạy các DB/E2E scenario còn thiếu cho catalog và payment traceability. Các local check hiện tại là bằng chứng hữu ích, nhưng không phải production SLO hoặc hardware sign-off.

### Những điểm đã làm tốt

| Khu vực | Bằng chứng hiện tại | Kết luận audit |
|---|---|---|
| Toàn vẹn state cốt lõi | Prisma transaction, CommandReceipt, request hash, state machine, unique constraint và advisory lock | Nền tảng tốt; giữ nguyên ranh giới MVP. |
| Routing | Giao của tất cả skill cần thiết, staff active/present/available, fairness, persistent exact-service exclusion, manager override | Đã triển khai; mối lo còn lại là scale/lock cost, không phải thiếu phạm vi routing. |
| Attendance/session | CHECK_IN/CHECK_OUT, chặn checkout khi còn active turn, closing logic, JWT session-version revalidation, verified staff session | Đã triển khai; cần bổ sung regression test cho auth/PIN. |
| Board resilience | Read không side effect, monotonic version, SSE reconnect/backoff, polling fallback 5 giây, sync state hiển thị | Đã triển khai; vẫn thiếu bằng chứng physical/live-network. |
| Payment boundary | Admin ghi nhận kết quả CARD/CASH từ terminal bên ngoài; không giữ dữ liệu thẻ; adjustment/correction/refund có audit | Đúng boundary MVP; các follow-up path cần DB/E2E proof riêng. |
| Nền tảng tablet | Chromium 810×1080 và 1080×810: không horizontal overflow; primary control đã review đạt tối thiểu 44px | Nền tảng tốt; chưa tương đương validation WebKit/VoiceOver thật. |

### Bối cảnh số liệu local

Bằng chứng local hiện có hữu ích và nên được giữ làm baseline so sánh trong CI/staging:

- Fixture nhỏ: board p50/p95 1.76/3.26 ms, appointments 1.66/1.91 ms, reports 0.58/0.50 ms p95 theo period.
- Fixture đại diện 20.000 appointment: legacy broad history payload 1,515,072 bytes, p95 104.48 ms; bounded 25-row history payload 34,360 bytes, p95 6.34 ms; board p95 107.89 ms; report day/month p95 5.32/16.27 ms.
- Local HTTP/service profile: không ghi nhận lỗi; board HTTP với ba client p95 219.84 ms; concurrent check-in ở service layer p95 78.53 ms; bảy advisory-lock wait từ 10 ms trở lên, tối đa 56.87 ms; pool-constrained 350-operation run cũng không lỗi.

Các số liệu này chưa tách riêng residual code allocator/routing risk, chưa đại diện network production hoặc pool production và chưa validate tablet thật.

## 2. Findings UI/UX theo màn hình

### Tổng quan các screen và đánh giá định tính

| Surface | Điểm tốt | Rủi ro usability hiện tại |
|---|---|---|
| Customer Kiosk | Journey ba bước rõ ràng, service card lớn, search/category grouping, feedback lookup, same-key retry, ticket/reset state, hiển thị giờ/currency cấu hình | Trạng thái mở cửa có thể cũ theo thời gian; CTA landscape nằm dưới viewport ban đầu; tab semantics và focus khi chuyển bước chưa hoàn chỉnh. |
| Staff Turn Board | Tách current/up-next/staff, public view đã redaction, hiển thị Live/Reconnecting/Checking/Stale, action dialog được bảo vệ, PIN keypad, queue card responsive | Countdown verification liên tục live-announced; tab semantics mới một phần; readability từ khoảng cách và vận hành network thật chưa được xác minh. |
| Admin Console | Navigation vận hành, currency/time động, appointment history có pagination, action menu, payment keypad/history, loading/error state ở nhiều child module | Parent refresh rộng và im lặng ngoài Overview; nav/table portrait phụ thuộc horizontal scroll; mobile nav chưa phải focus-contained modal drawer. |
| Sign-in/entry | Role routing, lỗi authentication chung chung, autocomplete/input mode, show-password control, copy theo role | Chưa thấy lỗi chức năng quan trọng; physical keyboard, WebKit và accessibility vẫn là release gate. |
| Shared UI/PWA | Shared dialog focus hook, touch token, reduced-motion rule, safe-area refinement, operational read no-store | Global stylesheet lớn và có nhiều text style dưới 0.8rem; service worker chỉ install, chưa có offline recovery. |

### Findings Kiosk

#### UX-KSK-001 — Trạng thái giờ mở cửa kiosk bị cũ theo thời gian

- **Phân loại:** Đã xác nhận
- **Mức độ:** P1
- **Bằng chứng:** app/(kiosk)/kiosk/page.tsx:151-168 tính isShopOpen bằng useMemo(..., [shop]); không có interval hoặc visibility refresh. app/(kiosk)/kiosk/page.tsx:307-318 dùng state này để chặn submit. Cấu hình shop được load một lần tại app/api/services/route.ts:7-9.
- **Tác động:** Kiosk mở trước giờ đóng có thể tiếp tục hiển thị “Open now” và vượt qua client open check sau giờ đóng. Kiosk mở trước giờ bắt đầu có thể tiếp tục hiển thị closed cho tới khi catalog/config được load lại. Giờ hiển thị và business rule có thể lệch với đồng hồ salon thực tế.
- **Khuyến nghị:** Enforce authoritative opening window trong server transaction theo timezone của shop; refresh trạng thái client bằng timer ngắn và khi visibility/focus quay lại. Giữ nguyên semantics replay của same-key receipt cho command đã thành công.
- **Effort:** M
- **Tiêu chí nghiệm thu:** POST trực tiếp tới /api/kiosk/check-in bị từ chối ngoài [openingTime, closingTime) theo ShopConfig.timezone; test boundary mở/đóng chính xác; kiosk để mở qua boundary tự cập nhật mà không cần full reload; client cũ không tạo visit mới ngoài giờ.

#### UX-KSK-002 — Action tiếp tục trong landscape nằm dưới viewport ban đầu

- **Phân loại:** Cần xác minh khi chạy thực tế
- **Mức độ:** P1
- **Bằng chứng:** docs/implementation/VIEWPORT_QA.md:25-29 ghi nhận row service thứ hai và Continue CTA kéo xuống dưới viewport landscape 810px. app/globals.css:5027-5037 vẫn có layout kiosk scroll dọc ở width hẹp.
- **Tác động:** Người dùng kiosk gắn landscape có thể chọn service nhưng không thấy ngay cách tiếp tục, làm tăng do dự và thao tác scroll nhầm trên thiết bị touch dùng chung.
- **Khuyến nghị:** Trước tiên xác nhận orientation gắn kiosk thực tế. Nếu hỗ trợ landscape, cung cấp summary/Continue action sticky có safe-area hoặc layout compact đã đo đạc, không che nội dung service.
- **Effort:** S/M
- **Tiêu chí nghiệm thu:** Trên mọi kích thước/orientation iPad được hỗ trợ, summary service đã chọn và action chính visible hoặc reachable bằng một gesture rõ ràng; CTA nằm trên vùng home-indicator; không overlay card service cuối; có biên bản physical-touch pass.

#### UX-KSK-003 — Category tab và step progress của kiosk có semantics interactive chưa đầy đủ

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P2
- **Bằng chứng:** app/(kiosk)/kiosk/page.tsx:382-415 đặt aria-current="step" trên span không interactive. app/(kiosk)/kiosk/page.tsx:490-516 dùng role="tab" và aria-selected nhưng không có aria-controls, roving tabIndex hoặc hành vi arrow/Home/End.
- **Tác động:** Người dùng touch vẫn thao tác được, nhưng VoiceOver/keyboard có thể không nhận được stepper/tab model mạch lạc hoặc không biết content panel nào được điều khiển.
- **Khuyến nghị:** Hoặc dùng button/group semantics đơn giản cho category filter, hoặc triển khai đầy đủ tab pattern: aria-controls, chỉ một tab trong tab order, arrow/Home/End navigation và panel có label. Biến stepper thành labelled progress/status region thay vì gán step semantics cho span.
- **Effort:** S
- **Tiêu chí nghiệm thu:** Keyboard và VoiceOver có thể tìm category active, di chuyển giữa category mà không phải tab qua từng chip và nghe panel/result count tương ứng; step change chỉ announce active step một lần; axe/manual check không ghi nhận tab pattern không hợp lệ.

#### UX-KSK-004 — Chuyển bước chưa chủ động đưa focus tới nội dung mới

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P2
- **Bằng chứng:** app/(kiosk)/kiosk/page.tsx:273-277 và :347-350 thay đổi step sau button click nhưng không focus heading bước mới hoặc field đầu tiên. Focus chỉ được chuyển rõ ràng khi có validation error tại :307-334.
- **Tác động:** Người dùng keyboard hoặc assistive technology có thể vẫn đứng trên button trong khi content xung quanh đã bị thay thế, nhất là trên trang kiosk dài. Người dùng touch ít bị ảnh hưởng; đây chủ yếu là rủi ro accessibility/recovery.
- **Khuyến nghị:** Khi đổi bước, focus stable step heading hoặc control có thể thao tác đầu tiên và announce bước mới. Không cướp focus khỏi error target.
- **Effort:** S
- **Tiêu chí nghiệm thu:** Continue focus vào phone field hoặc step heading; submit thành công focus vào ticket heading; Change services trả focus về catalog heading; screen-reader announcement không bị lặp.

### Findings Staff Turn Board

#### UX-BRD-001 — Countdown verification bị announce mỗi giây

- **Phân loại:** Đã xác nhận
- **Mức độ:** P2
- **Bằng chứng:** app/(board)/board/page.tsx:134-138 cập nhật verificationNow mỗi giây. app/(board)/board/page.tsx:320-321 render text verification trong role="status" aria-live="polite", bao gồm formatVerificationRemaining(...).
- **Tác động:** VoiceOver có thể liên tục ngắt nội dung board hữu ích bằng countdown thay đổi. Countdown trực quan hữu ích, nhưng live region mỗi giây gây ồn.
- **Khuyến nghị:** Giữ countdown trực quan ngoài live region và chỉ announce verification success, expiry hoặc ngưỡng thưa hơn như còn một phút.
- **Effort:** S
- **Tiêu chí nghiệm thu:** Screen reader nghe một announcement thành công và một announcement expiry/threshold, không phải một announcement mỗi giây; người dùng nhìn vẫn thấy remaining time.

#### UX-BRD-002 — Board tabs là button dùng được nhưng chưa phải keyboard tab pattern đầy đủ

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P2
- **Bằng chứng:** app/(board)/board/page.tsx:326-332 có role="tablist", role="tab", aria-controls, aria-selected và tabpanel, nhưng tab chưa có selected-only tabIndex hoặc arrow/Home/End behavior.
- **Tác động:** Keyboard user phải tab qua từng tab và có thể không nhận được hành vi chuẩn của tab widget. Rủi ro thấp hơn modal cũ vì useDialogFocus hiện đã dùng chung và áp dụng tại :149/:434-435.
- **Khuyến nghị:** Hoàn thiện tab pattern hoặc thay role bằng labelled button group. Giữ focus-trapping dialog hiện có.
- **Effort:** S
- **Tiêu chí nghiệm thu:** Arrow/Home/End navigation hoạt động, chỉ tab active nằm trong tab order, panel có label đúng và Escape/Tab trong action dialog không thay đổi ngoài ý muốn.

#### UX-BRD-003 — Readability từ khoảng cách và touch behavior khi deployed chưa được xác minh

- **Phân loại:** Cần xác minh khi chạy thực tế
- **Mức độ:** P1
- **Bằng chứng:** docs/implementation/VIEWPORT_QA.md:31-35,48-52 ghi nhận quan sát Chromium portrait/landscape nhưng loại trừ physical iPad/WebKit, distance/readability, Dynamic Type, VoiceOver, real touch latency, safe area và Wi-Fi. app/globals.css có nhiều status/support text nhỏ, ví dụ :1118-1129 và :1855-1864.
- **Tác động:** Floor board có thể responsive về kỹ thuật nhưng vẫn không đạt mục đích vận hành nếu queue text không đọc được từ khoảng cách dự kiến hoặc touch khác Safari/WebKit.
- **Khuyến nghị:** Chạy tablet QA plan đã duyệt trên hardware board thật ở khoảng cách vận hành, kèm large-text và VoiceOver pass. Xem kết quả là launch gate, không phải proxy từ desktop screenshot.
- **Effort:** M (runtime validation)
- **Tiêu chí nghiệm thu:** Operator đọc được current/up-next/status ở khoảng cách đã thống nhất; action chính vẫn tối thiểu 44px khi touch thật; kết quả WebKit, safe-area, reduced-motion, Dynamic Type và VoiceOver được ghi nhận; stale/reconnecting state vẫn visible.

### Findings Admin Console

#### UX-ADM-001 — Lỗi refresh chỉ hiển thị trong Overview

- **Phân loại:** Đã xác nhận
- **Mức độ:** P1
- **Bằng chứng:** app/(admin)/admin/page.tsx:273-329 set một loadError cho parent refresh. app/(admin)/admin/page.tsx:523-537 chỉ render lỗi bên trong renderOverview(). renderSection() tại :1016-1058 render Queue, Appointments, Payments hoặc Config mà không có parent error.
- **Tác động:** Queue, Appointments và Payments có thể tiếp tục hiển thị snapshot cũ sau background refresh lỗi mà không có stale/error state visible. Operator có thể thao tác dựa trên dữ liệu assignment hoặc payment cũ.
- **Khuyến nghị:** Thêm global data-health banner/status trong Admin top bar/content shell, gồm last successful timestamp, stale age, retry và action-safety rules. Tách lỗi child module khỏi lỗi parent snapshot.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Mô phỏng refresh lỗi khi đang ở từng Admin section đều hiển thị stale state và retry; last successful time vẫn visible; destructive action bị disable hoặc ghi rõ đang thao tác trên dữ liệu cũ; banner chỉ clear sau refresh thành công đúng scope.

#### UX-ADM-002 — Mobile Admin navigation chưa focus-contained

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P1
- **Bằng chứng:** app/(admin)/admin/page.tsx:350-357 chỉ lock body scroll khi mobileNavOpen. :1065-1100 render sidebar và scrim nhưng không dùng useDialogFocus, aria-modal, inert hoặc focus boundary tương đương khi nav mở.
- **Tác động:** Keyboard user có thể tab ra content phía sau scrim trong khi navigation đang hiển thị như modal. Focus cũng có thể bị để lại trong drawer đã đóng sau khi chọn hoặc dismiss bằng pointer.
- **Khuyến nghị:** Xem mobile navigation là modal drawer: focus item đầu tiên, trap focus, đóng bằng Escape/scrim, restore focus về menu toggle và đánh dấu main content inert khi mở.
- **Effort:** S/M
- **Tiêu chí nghiệm thu:** Tab và Shift+Tab luôn ở trong drawer mở; Escape và scrim đóng drawer; focus trả về toggle; background control không reachable khi drawer mở; touch navigation vẫn chỉ cần một tap mỗi module.

#### UX-ADM-003 — Khám phá module portrait và bảng dày phụ thuộc horizontal scroll

- **Phân loại:** Cần xác minh khi chạy thực tế
- **Mức độ:** P1
- **Bằng chứng:** docs/implementation/VIEWPORT_QA.md:42-46 nêu portrait module discoverability yếu hơn. app/globals.css:3757-3783 và :4955-4988 triển khai horizontal Admin navigation; appointment table có min-width 1120px tại :2741-2743, các management table khác có width tối thiểu quanh :2368-2377 và :2575-2630.
- **Tác động:** Module/action quan trọng và identity/action column có thể nằm ngoài màn hình trên tablet portrait. Horizontal scroll có thể thực hiện được nhưng không có affordance rõ, làm tăng thời gian thao tác.
- **Khuyến nghị:** Giữ nguyên information architecture đã duyệt nhưng thêm scroll cue/position indicator visible và compact card/priority-column mode cho appointment/management table. Validate trên physical width được hỗ trợ trước khi chọn breakpoint.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Manager có thể tìm mọi module ở portrait mà không phải đoán; appointment identity/status/action vẫn visible ở compact mode; nếu giữ horizontal scroll phải có affordance và không che row action đang chọn.

#### UX-ADM-004 — Thời gian “Updated” của Admin dùng timezone thiết bị, khác board

- **Phân loại:** Đã xác nhận
- **Mức độ:** P2
- **Bằng chứng:** app/(admin)/admin/page.tsx:1121-1125 format lastUpdatedAt bằng toLocaleTimeString và không truyền shop.timezone. Board format thời gian last-update theo board.shop.timezone tại app/(board)/board/page.tsx:320.
- **Tác động:** Admin tablet ở timezone khác có thể hiển thị thời điểm refresh không khớp business timezone cấu hình hoặc board, làm giảm niềm tin của operator khi close/payment reconciliation.
- **Khuyến nghị:** Dùng một shop-timezone formatter cho operational timestamp, hoặc ghi rõ device-local time nếu đó là contract chủ ý.
- **Effort:** S
- **Tiêu chí nghiệm thu:** Khi browser timezone khác ShopConfig.timezone, Admin và Board hiển thị cùng timezone/label đã thống nhất; business-date filter không thay đổi.

#### UX-ADM-005 — Payment validation dựa vào toast tạm thời thay vì field recovery

- **Phân loại:** Đã xác nhận
- **Mức độ:** P2
- **Bằng chứng:** app/(admin)/admin/page.tsx:440-464 validate amount, tip và cash bằng setToast(...); payment form dùng keypad tại :1205-1235. Message không gắn với input cụ thể và không chuyển focus tới field sai.
- **Tác động:** Operator sửa cash hoặc tip phải tự đoán keypad nào cần chú ý; toast ngắn có thể biến mất trước khi sửa xong.
- **Khuyến nghị:** Giữ toast làm confirmation feedback, nhưng thêm inline field-level error gắn với keypad liên quan và focus input/display lỗi đầu tiên sau validation.
- **Effort:** S
- **Tiêu chí nghiệm thu:** Input amount/tip/cash không hợp lệ tạo inline message gắn đúng control; control lỗi đầu tiên nhận focus; modal vẫn mở và giữ giá trị đã nhập; confirm thành công clear lỗi.

### Findings UI dùng chung, typography và accessibility

#### UX-SHR-001 — Text token muted có contrast thấp hơn normal text trong các context phổ biến

- **Phân loại:** Đã xác nhận
- **Mức độ:** P1
- **Bằng chứng:** app/globals.css:25-27 định nghĩa --color-muted-taupe:#8d8183; usage gồm field metadata nhỏ tại :8854-8857, keypad footnote tại :7957-7960 và :10038-10040, placeholder tại :4616-4617. So với nền trắng, token có contrast xấp xỉ 3.75:1, thấp hơn target 4.5:1 cho normal text; một số usage ở 0.70–0.72rem.
- **Tác động:** Helper/footnote/placeholder có thể khó đọc và không đạt contrast normal text khi truyền đạt hướng dẫn hoặc state. Điều này đáng chú ý trên tablet có brightness thấp.
- **Khuyến nghị:** Thay token bằng neutral tối hơn cho meaningful text, chỉ dùng tone sáng cho nội dung trang trí/không thiết yếu và đo background thực tế bằng contrast check tự động.
- **Effort:** S
- **Tiêu chí nghiệm thu:** Mọi meaningful text đạt target WCAG AA đã thống nhất trong context background/size thật; decorative separator có thể được exempt; contrast audit bao phủ kiosk, board, Admin, sign-in và payment keypad state.

#### UX-SHR-002 — Role semantics dùng chung có các inconsistency accessibility nhỏ nhưng lặp lại

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P2
- **Bằng chứng:** src/components/ui.tsx:9-11 render initials mà không chỉ rõ decorative/standalone accessible name. src/components/account-menu.tsx:40-74 dùng aria-haspopup="dialog" và panel role="dialog", nhưng sign-out control gán role="menuitem" mà không có role="menu" bao quanh. Nhiều category/revenue/catalog tab group dùng tab semantics không đầy đủ; Payments tab tại app/(admin)/admin/page.tsx:3184-3260 là ví dụ hoàn chỉnh để so sánh.
- **Tác động:** Screen reader có thể đọc initials lặp hoặc announce menu/tab không nhất quán dù pointer/touch vẫn hoạt động.
- **Khuyến nghị:** Chuẩn hóa shared primitive: avatar trang trí dùng aria-hidden, avatar standalone có label, account panel chọn dialog semantics hoặc complete menu pattern, tab group dùng một implementation đã test.
- **Effort:** S/M
- **Tiêu chí nghiệm thu:** Manual screen-reader pass xác nhận không có avatar noise lặp, account action có role predictable và mọi tab group expose selected/controlled-panel/keyboard behavior nhất quán.

## 3. Phân tích khoảng trống business feature và business rule

### Truy vết workflow đầu-cuối

| Workflow | Implementation/bằng chứng hiện tại | Kết quả audit |
|---|---|---|
| Check-in | Kiosk service bundle, phone/name validation, returning-guest lookup, same-key receipt, customer upsert, code creation, service snapshot, routing | Đã triển khai; server-side open-hours enforcement còn thiếu (BUS-001). |
| Routing | Required skill intersection, active/present/available filter, fairness/stable ordering, persistent turn exclusion, explicit repair | Đã triển khai; cần đo lock/query cost khi scale (PERF-003). |
| Attendance | CHECK_IN/CHECK_OUT, chặn checkout khi còn active turn, closing logic, assignment release | Đã triển khai; regression coverage cho auth/PIN/automatic-close chưa đầy đủ. |
| Accept | Trực tiếp ASSIGNED → ACCEPTED/IN_SERVICE, attendance và assignment được kiểm tra trong transaction, có idempotency | Đã triển khai; concurrent DB accept test đã pass. |
| Skip | Bắt buộc active reason, turn event, exact service/staff exclusion, reroute, manager override | Đã triển khai; repeated-skip policy chưa được đặc tả rõ (BUS-002). |
| Service change | Chỉ Admin, chặn sau terminal boundary, revalidate skill, snapshot/audit, reroute | Đã triển khai; active-category predicate nên nhất quán ở mọi mutation entry point. |
| Support | Support present/available, shared appointment, release atomic khi primary finish | Đã triển khai; thiếu test concurrent-support riêng. |
| Completion | Finish release staff/support, chuyển appointment sang payment pending, giữ turn event | Đã triển khai; payment-pending/closing matrix rộng hơn vẫn chưa đầy đủ. |
| Cancellation | Scope service/visit, reason/confirmation cho in-service, turn close, release/reroute, idempotent receipt | Đã triển khai; no-show vẫn cố ý nằm ngoài scope. |
| Payment | Admin xác nhận từ external terminal, CARD/CASH/tip/cash detail, unique payment, adjustment/correction/refund audit record | Đã triển khai; thiếu DB/E2E proof riêng cho follow-up command. |
| Close/retention | Protected endpoint, closing theo timezone, cleanup path, structured job event | Đã triển khai ở dạng endpoint; schedule/alert/rollback vận hành bên ngoài chưa được xác minh. |

Các rule đã được duyệt sau đây không phải gap: cho phép các visit khác nhau trong cùng ngày; public board redaction customer identity; staff accept trực tiếp vào service; payment processing bên ngoài; cancellation không thêm state NO_SHOW; category chỉ ảnh hưởng catalog presentation, không ảnh hưởng routing; richer booking/customer-account/payroll/inventory vẫn ngoài scope.

### Business findings

#### BUS-001 — Kiosk check-in chưa có operating-hours guard ở server

- **Phân loại:** Đã xác nhận
- **Mức độ:** P1
- **Bằng chứng:** app/(kiosk)/kiosk/page.tsx:307-318 chỉ chặn bằng client isShopOpen. src/server/services/prisma-operations.ts:1281-1323 vào transaction, kiểm tra receipt/service và tạo visit mà không đọc opening/closing time. app/api/kiosk/check-in/route.ts:10-23 delegate trực tiếp tới createDbCheckIn.
- **Tác động:** Browser cũ hoặc caller gọi API từ trusted origin có thể tạo appointment ngoài khung giờ check-in đã cấu hình. Đây là vấn đề business rule và operational integrity, không chỉ là lỗi hiển thị.
- **Khuyến nghị:** Đọc ShopConfig trong transaction có lock và từ chối check-in mới ngoài local-time window. Viết rõ rule cho replay của command đã thành công khi đặt vị trí receipt replay trước/sau guard. Cập nhật clock state ở client để phản hồi UX.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Direct API ngoài giờ fail mà không tạo customer/appointment/receipt side effect; opening inclusive và closing exclusive; test timezone/DST boundary pass; kiosk và server trả cùng state cấu hình; replay cùng key đã thành công có behavior deterministic được ghi rõ và test.

#### BUS-002 — Repeated skip chưa có policy rõ ngoài exclusion theo staff

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P2
- **Bằng chứng:** src/server/services/prisma-operations.ts:3610-3721 cho phép SKIP cho active turn, ghi persistent exclusion cho staff/service hiện tại và reroute. Không có maximum/repeated-skip rule hoặc behavior terminal rõ khi mọi staff đủ điều kiện đều bị exclude. docs/requirements.md và docs/decisions.md định nghĩa exact exclusion nhưng chưa định nghĩa repeated-skip escalation policy.
- **Tác động:** Một service có thể tiếp tục chờ sau nhiều lần skip hợp lệ mà không có operational rule chung về thời điểm manager can thiệp hoặc event hiển thị trong report. MVP có thể chấp nhận, nhưng ambiguity tạo ra quyết định sàn không nhất quán.
- **Khuyến nghị:** Giữ permanent exact-service exclusion hiện tại. Chỉ thêm business decision ngắn và operational status/manager escalation rule nếu salon mong muốn; không thêm auto reassignment/cooldown khi chưa được duyệt.
- **Effort:** S/M
- **Tiêu chí nghiệm thu:** Written decision nêu rõ repeated skip là unlimited, manager-escalated hay bị giới hạn; behavior có DB test cho zero eligible staff và board/Admin message hướng dẫn staff bước tiếp theo.

#### BUS-003 — Catalog-active predicate không đồng nhất giữa read path và mutation path

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P2
- **Bằng chứng:** src/server/services/prisma-operations.ts:694-702 chỉ trả service active trong category active cho kiosk. :1314-1317 chỉ kiểm tra service.isActive khi kiosk tạo appointment và :2419-2423 chỉ kiểm tra service.isActive khi service change. Admin service write có gọi assertActiveServiceCategory tại src/server/services/admin-operations.ts:458-462,514-529; category archive bị chặn khi còn active service tại :431-453.
- **Tác động:** UI Admin bình thường ngăn phần lớn state không nhất quán, nhưng database stale/inconsistent hoặc migration tương lai có thể cho phép active service thuộc archived category đi qua direct mutation dù không nằm trong kiosk catalog.
- **Khuyến nghị:** Centralize active-catalog predicate và dùng trong transaction check-in/service-change như defense in depth. Giữ category archive protection.
- **Effort:** S
- **Tiêu chí nghiệm thu:** Check-in/service-change chỉ nhận khi cả service và category đều active; direct request tới archived category trả stable error; Admin archive/reactivate vẫn giữ historical safeguard hiện tại.

#### BUS-004 — Closing và retention là job có thể gọi, chưa phải schedule đã vận hành

- **Phân loại:** Cần xác minh khi chạy thực tế
- **Mức độ:** P1
- **Bằng chứng:** app/api/jobs/closing/route.ts:10-29 và app/api/jobs/retention/route.ts:11-41 là protected endpoint có telemetry. docs/implementation/RELEASE_CHECKLIST.md:31-39 và docs/runbook/LOCAL.md:58-68 ghi rõ external scheduling, retry, alerting và retention-window/backup approval vẫn giao cho operator.
- **Tác động:** Application có thể đúng bên trong nhưng attendance close hoặc data cleanup âm thầm không chạy khi deployed. Điều này ảnh hưởng end-of-day operation, cleanup lockout/session và tăng trưởng operational data.
- **Khuyến nghị:** Trước unattended launch, cấu hình external scheduler với secret rotation, timeout/retry policy, alerting và operator runbook. Giữ route idempotent và không thêm in-process scheduler vào MVP.
- **Effort:** M (operator/infrastructure)
- **Tiêu chí nghiệm thu:** Staging schedule gọi cả hai job đúng thời gian; success/failure/blocked outcome tới được alert channel; replay an toàn; retention days, backup/restore approval và exception handling được ghi rõ.

## 4. Findings performance và database

### Phân biệt số liệu đo được và rủi ro lý thuyết

Các benchmark local trong phần Tóm tắt điều hành là **số liệu đo được** trên disposable data và PostgreSQL local/loopback. Các finding được đánh dấu Rủi ro tiềm ẩn **không** khẳng định run 20.000 row hiện tại đã fail. Chúng chỉ ra các code path có work tăng theo volume active/history hoặc benchmark hiện tại chưa tách đúng workload liên quan.

#### PERF-001 — Admin background refresh phát sinh bốn request mỗi mười giây

- **Phân loại:** Đã xác nhận
- **Mức độ:** P1
- **Bằng chứng:** app/(admin)/admin/page.tsx:273-320 tạo bốn request song song ở mỗi refresh: unpaginated /api/admin/appointments, paginated appointments, reports và config. :331-346 chạy refresh khi mount và mỗi 10 giây bất kể active section. Endpoint không phân trang dùng getDbAppointmentsFiltered tại app/api/admin/appointments/route.ts:57-80.
- **Tác động:** Một Admin tablet idle vẫn tạo database work và payload lặp lại dù operator đang ở Settings hoặc Customers. Nhiều tablet sẽ nhân chi phí. Request appointment đầu tiên dùng heavy appointmentInclude path tại src/server/services/prisma-operations.ts:369-389,986-1080, không phải bounded 25-row history path đã được benchmark.
- **Khuyến nghị:** Tách live queue/attention data khỏi historical/report data; chỉ refresh dữ liệu section đang dùng, pause hoặc kéo dài refresh khi hidden/idle và thêm dashboard projection nhỏ nếu Overview cần nhiều card. Vẫn giữ explicit refresh cho ý định operator.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Trace idle 30 phút ở mỗi section ghi nhận request budget đã thống nhất; không fetch unbounded appointment projection nếu section không cần; payload bytes và DB duration nằm trong budget; Queue/Payments active vẫn refresh trong operating target.

#### PERF-002 — Admin parent refresh có thể chồng lấn và áp dụng response cũ sau cùng

- **Phân loại:** Đã xác nhận
- **Mức độ:** P1
- **Bằng chứng:** app/(admin)/admin/page.tsx:273-329 không có AbortController, request sequence hoặc query-key check. :331-346 có thể khởi động interval refresh khi manual section/date refresh còn pending; :510-520 khởi động refresh ngay khi period/date thay đổi.
- **Tác động:** Request chậm có thể ghi đè selection report/appointment/config mới hơn. Kết hợp PERF-001, điều này tạo ra “time travel” khó hiểu trong report hoặc stale queue/payment state mà không có lỗi rõ ràng.
- **Khuyến nghị:** Dùng một refresh controller/revision dùng chung. Abort request trước, hoặc chỉ nhận response nếu scope/revision vẫn hiện hành. Giữ abort/order guard hiện có của child appointment loader.
- **Effort:** S
- **Tiêu chí nghiệm thu:** Response cũ bị delay không thể ghi đè snapshot date/month/section mới; request bị abort không tạo user-facing error; revision thành công mới nhất kiểm soát lastUpdatedAt, dataRevision và dữ liệu visible.

#### PERF-003 — Reroute waiting appointment load lại cùng staff snapshot cho từng appointment

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P1
- **Bằng chứng:** src/server/services/prisma-operations.ts:2646-2749 load appointment, routing config và staffForBusinessDate cho mỗi lần gọi routeAppointmentServices. :3309-3320 lặp qua toàn bộ waiting appointment khi staff check-in và gọi function cho từng appointment; :2752-2768 lặp pattern khi explicit reconciliation.
- **Tác động:** Check-in hoặc repair transaction có thể làm việc tỷ lệ với waiting appointments × services trong khi giữ một shop/date advisory lock. Một staff check-in bình thường có thể làm queue pause dài và tăng lock contention. Local profile hiện tại chưa tách reconciliation với waiting queue lớn.
- **Khuyến nghị:** Giữ fairness và exclusion semantics nhưng load một routing snapshot mỗi transaction. Reuse staff/config data, cập nhật candidate availability trong memory và giữ write transactional. Đo query count trước/sau; không bỏ advisory lock nếu chưa có bằng chứng.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Fixture 1.000 waiting appointment và visit nhiều service đại diện ghi nhận query count được giới hạn mỗi reconciliation; assignment result khớp routing rule hiện tại; lock wait/p95 nằm trong budget; không regression skip-staff.

#### PERF-004 — Appointment code allocation scan toàn bộ code trong ngày dưới cùng lock

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P1
- **Bằng chứng:** src/server/services/prisma-operations.ts:844-857 select mọi appointment code của business date và reduce A### cao nhất bằng JavaScript. createDbCheckIn gọi function trong advisory-locked transaction tại :1288-1337.
- **Tác động:** Chi phí check-in tăng theo daily volume và mọi concurrent check-in serialize sau lock trong lúc scan. Benchmark 20.000 appointment chưa tách allocator ở daily volume đó.
- **Khuyến nghị:** Dùng per-shop/business-date sequence row hoặc indexed numeric sequence được allocate atomically. Giữ format A001 và receipt behavior; validate migration với code hiện có.
- **Effort:** M/L
- **Tiêu chí nghiệm thu:** 20.000 appointment có sẵn cộng concurrent new check-in cho allocator latency bounded và không duplicate code; format không đổi; transaction rollback không tạo code conflict theo policy đã chọn; lock-wait telemetry được ghi.

#### PERF-005 — Duration/payment sort scan và sort toàn bộ ID match trước khi phân trang

- **Phân loại:** Đã xác nhận
- **Mức độ:** P1
- **Bằng chứng:** src/server/services/prisma-operations.ts:1184-1250 load toàn bộ row match cho DURATION_DESC hoặc PAYMENT_NEWEST/OLDEST, sort trong Node rồi mới fetch page được chọn. Normal sort tại :1251-1259 dùng database skip/take.
- **Tác động:** Endpoint bounded ở payload trả về nhưng không bounded ở database transfer hoặc server memory cho các sort này. Query theo month/range tăng tuyến tính theo date range và số Admin user đồng thời.
- **Khuyến nghị:** Đẩy khả năng sort vào database projection/column hoặc queryable aggregate, hoặc tạm thời cap/date-limit các mode này cho tới khi có indexed design được đo đạc. Dùng EXPLAIN ANALYZE trước khi thêm index.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Fixture 20.000 appointment với duration/payment sort giữ server memory, query rows, payload và p95 trong budget; page result deterministic; production path không còn full-match ID scan trừ khi được biện minh bằng budget đo được.

#### PERF-006 — Board load toàn bộ active appointment trước khi chỉ trả bốn up-next row

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P2
- **Bằng chứng:** src/server/services/prisma-operations.ts:747-765 tìm mọi appointment current-day ở active status với nested board relation. :809-821 chỉ slice upNext còn bốn row sau khi map.
- **Tác động:** Response có thể nhỏ, nhưng database relation work và object mapping tăng theo toàn bộ active queue. Benchmark board 20.000 appointment local có active subset nhỏ và chưa chứng minh queue live lớn.
- **Khuyến nghị:** Query current turn và top queue window riêng, hoặc dùng lean capped projection có chủ đích nhưng vẫn đủ state multi-service hiện tại. Giữ public redaction và version semantics.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Fixture active queue lớn chứng minh DB row/relation load bị giới hạn theo current/next window cấu hình; current turn đầy đủ; public/authenticated payload contract vẫn đúng/redacted; board p95 trong target.

#### PERF-007 — Customer directory và customer history không giới hạn

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P2
- **Bằng chứng:** src/server/services/admin-operations.ts:250-256 trả mọi customer với client-side search tại src/components/admin-management.tsx:169-190. :258-270 trả toàn bộ appointment history match của customer, và src/components/admin-management.tsx:215-236 mở complete history trước khi áp dụng filter.
- **Tác động:** Salon hoạt động lâu năm có thể load directory lớn và history lớn vào một client render. Search/history có thể chậm trên tablet dù appointment history ở nơi khác đã bounded.
- **Khuyến nghị:** Thêm server-side customer search/pagination và customer history paging với summary query tách khỏi row query. Giữ filter hiện tại và historical snapshot.
- **Effort:** M
- **Tiêu chí nghiệm thu:** 20.000 customer và một customer có 1.000 visit load row/payload bounded; đo search latency; summary total vẫn chính xác; mở history không fetch toàn bộ lifetime trước khi user yêu cầu page.

#### PERF-008 — Một số history filter phụ thuộc broad scan hoặc substring search chưa có index plan được đo

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P2
- **Bằng chứng:** src/server/services/prisma-operations.ts:921-927 dùng contains search trên code/customer name/phone; :955-968 chạy GROUP BY appointment_id không scope trên toàn bộ appointment_services cho SINGLE/MULTI filter. prisma/schema.prisma:227-254 không có serviceId index trên AppointmentService; index hiện tại hữu ích cho appointment/status và primary staff nhưng chưa chứng minh mọi filter plan.
- **Tác động:** Month/range history query có thể scan relation data suốt lifetime khi salon tăng trưởng. Disposable fixture chưa cho thấy failure hiện tại, nhưng đây là scale risk.
- **Khuyến nghị:** Capture EXPLAIN ANALYZE cho day/month/range/search/service-count/staff filter đại diện. Chỉ thêm index hoặc search structure được hỗ trợ bởi plan; thêm date scoping cho service-count aggregation nếu an toàn.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Query plan và row count được capture ở 20.000 row và staging volume đã thống nhất; search/filter p95 và memory đạt target; index addition có before/after plan biện minh, không thêm theo suy đoán.

#### PERF-009 — Admin là client boundary rất lớn và stylesheet/font chưa có budget đo được

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P2
- **Bằng chứng:** app/(admin)/admin/page.tsx:1-44 là một page use client duy nhất import toàn bộ Admin management/access/config/action/keypad module và dài 4.282 dòng. app/globals.css dài 11.909 dòng/khoảng 252 KB unminified và bắt đầu bằng remote Google Fonts import tại :1. package.json không có bundle-analyzer script.
- **Tác động:** Initial Admin JS/CSS và external font request có thể làm tăng time-to-interactive trên shared tablet hoặc Wi-Fi salon chậm. Source size là bằng chứng cần đo, chưa phải bằng chứng production đang fail.
- **Khuyến nghị:** Đo compressed JS/CSS theo route, FCP/LCP/TTI và font timing trong production build trên target network. Nếu vượt budget, split client island/route-level module, loại dead/duplicate CSS và self-host hoặc fallback font có chủ ý mà không đổi visual system đã duyệt.
- **Effort:** M/L
- **Tiêu chí nghiệm thu:** Có asset budget cho Admin/kiosk/board; capture production-build measurement trên hardware/network mục tiêu; Admin không load unused management chunk vượt budget; font có fallback/timeout bounded.

#### PERF-010 — Tài liệu và implementation về board polling không thống nhất

- **Phân loại:** Đã xác nhận
- **Mức độ:** P2
- **Bằng chứng:** docs/requirements.md:21, docs/architecture.md:110 và docs/decisions.md:66 mô tả polling mỗi ba giây. app/(board)/board/page.tsx:207-212 poll mỗi năm giây và kiểm tra stale mỗi năm giây.
- **Tác động:** QA/SLO expectation, perceived latency khi có check-in mới và documentation vận hành không thống nhất. Năm giây có thể là cải tiến có chủ ý, nhưng contract hiện không đơn nhất.
- **Khuyến nghị:** Chọn polling interval được duyệt dựa trên tablet/DB cost đo được, sau đó cập nhật toàn bộ requirements/architecture/decision hoặc đổi implementation. Giữ visible sync-state contract độc lập với interval chính xác.
- **Effort:** S
- **Tiêu chí nghiệm thu:** Một interval duy nhất được ghi trong source/config và toàn bộ product/architecture docs; browser/network test xác nhận check-in mới xuất hiện trong bound đã nêu và thay đổi không vượt DB/request budget.

#### PERF-011 — Production performance và pool SLO vẫn chưa được xác minh

- **Phân loại:** Cần xác minh khi chạy thực tế
- **Mức độ:** P1
- **Bằng chứng:** docs/implementation/RELEASE_CHECKLIST.md:28-39 và docs/project_state.md:105-120 ghi staging/deployed pool, lock-wait, network, memory, bundle và representative-history measurement còn mở. Local profile được ghi rõ là disposable/loopback.
- **Tác động:** App có thể pass local load nhưng proxy buffering, Wi-Fi latency, pool limit, CPU/memory hoặc multi-tablet burst production làm thay đổi behavior.
- **Khuyến nghị:** Định nghĩa launch SLO và chạy authenticated HTTP/load, lock/pool, SSE và asset test trên staging với real proxy và representative data volume. Giữ local measurement làm regression baseline.
- **Effort:** M (runtime validation)
- **Tiêu chí nghiệm thu:** Staging ghi p50/p95/p99, error rate, pool saturation, lock wait, SSE reconnect time, payload size, memory và bundle metric cho scenario ba tablet và burst; threshold và escalation owner được viết trước launch.

## 5. Findings security và reliability

#### SEC-001 — Cập nhật persistent PIN lockout là read-then-write race giữa các process

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P1
- **Bằng chứng:** src/server/security.ts:41-64 đọc failureCount, tăng trong application code rồi upsert count mới. In-memory protection synchronous theo từng process, nhưng các app process khác nhau có thể cùng đọc một DB count và ghi đè lên nhau.
- **Tác động:** Khi nhiều wrong-PIN attempt đồng thời chạy qua các replica, persistent failure count có thể bị đếm thiếu và lockout xảy ra muộn hơn dự kiến. Điều này làm yếu cross-process protection dù single-process path tốt hơn.
- **Khuyến nghị:** Dùng atomic database increment/upsert, row lock/transaction hoặc SQL update riêng tính lockedUntil từ committed count. Giữ in-memory fast path nhưng xem DB record là authority.
- **Effort:** S/M
- **Tiêu chí nghiệm thu:** Từ năm concurrent wrong-PIN attempt trở lên qua hai app process tạo một lockout window deterministic; attempt trong window bị reject; PIN đúng clear cả in-memory và persistent state; không có failure bị mất do race.

#### SEC-002 — Production CSP cho phép unsafe inline script/eval và external font origin

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P1
- **Bằng chứng:** proxy.ts:11-22 đặt script-src self, unsafe-inline, unsafe-eval; style-src unsafe-inline và fonts.googleapis.com; font-src fonts.gstatic.com cho mọi request match.
- **Tác động:** Policy cung cấp ít XSS defense hơn policy dựa trên nonce/hash. External font dependency cũng mở rộng browser trust/network surface. Một số directive có thể cần cho framework/runtime, nhưng policy hiện tại chưa được validate là minimum production policy.
- **Khuyến nghị:** Chạy production CSP report-only pass, xác định inline/eval cần thiết cho framework/runtime rồi tiến tới nonce/hash và self-hosted font nếu tương thích. Giữ frame-ancestors, base-uri, form-action và security header.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Staging CSP report được review; production policy không còn unsafe directive không cần thiết; Next/Auth.js/PWA vẫn hoạt động; security-header test assert CSP, HSTS, frame, referrer và permissions policy.

#### SEC-003 — Nginx optional profile và app port exposed có thể bypass TLS/rate limit

- **Phân loại:** Cần xác minh khi chạy thực tế
- **Mức độ:** P0
- **Bằng chứng:** docker/docker-compose.yml:18-44 publish app trực tiếp trên host port 3000. docker/docker-compose.yml:65-74 để nginx ở proxy profile tùy chọn. docker/nginx.conf:4-6,18-40 có kiosk/API rate limit, SSE buffering và HTTP proxy, còn :50-52 chỉ để TLS production dưới dạng operator comment.
- **Tác động:** Nếu port 3000 truy cập được từ salon/LAN/WAN, traffic có thể bypass nginx rate limit và TLS termination. Abuse lookup/check-in, credentials, session cookie và direct-origin assumption khi đó phụ thuộc firewall bên ngoài chưa được xác minh.
- **Khuyến nghị:** Làm rõ deployment topology: bind app chỉ vào internal network/loopback, terminate TLS tại ingress đã duyệt, giữ forwarded-host/proto đúng, áp rate limit tại public edge thật và xác minh direct 3000 không reachable. Không expose giá trị .env trong diagnostics.
- **Effort:** M (deployment)
- **Tiêu chí nghiệm thu:** External scan không reach được app container port; chỉ TLS ingress serve app; kiosk/API rate limit được quan sát tại public edge; SSE không bị buffer; security cookie/HSTS/origin check được validate qua proxy thật.

#### SEC-004 — Kiosk name lookup đã được duyệt vẫn phụ thuộc privacy của trusted kiosk và edge control

- **Phân loại:** Cần xác minh khi chạy thực tế
- **Mức độ:** P1
- **Bằng chứng:** app/api/kiosk/customer-lookup/route.ts:15-32 trả {found,name} cho normalized phone và đánh dấu response no-store. src/server/services/prisma-operations.ts:739-745 select stored name. Privacy decision đã duyệt được ghi trong docs/decisions.md và docs/project_state.md; application-level rate limiting không có, còn edge limit nằm ở docker/nginx.conf:4-6,18-23.
- **Tác động:** Đây là business behavior đã duyệt, không phải feature ngoài ý muốn. Tuy nhiên, người đứng tại kiosk có thể thử phone number, và direct app exposure hoặc ingress khác có thể loại bỏ edge rate limit đã ghi nhận. Rủi ro nằm ở privacy/abuse, không phải response caching.
- **Khuyến nghị:** Chỉ giữ option A trên trusted kiosk, xác minh edge rate limiting và monitoring khi deploy, đồng thời ghi rõ privacy assumption. Chỉ xem lại masked/no-lookup khi có product decision.
- **Effort:** S/M (deployment/policy)
- **Tiêu chí nghiệm thu:** Public-edge request bị rate-limit và log mà không ghi full phone/name; direct app access bị chặn; response header là no-store/no-referrer; abuse alert và kiosk placement/privacy signage được ghi rõ.

#### REL-001 — PWA online-first không cung cấp offline mutation recovery

- **Phân loại:** Đã xác nhận
- **Mức độ:** P2
- **Bằng chứng:** public/sw.js:1-11 đăng ký install/activate/fetch listener nhưng không cache hoặc queue request. src/components/PWAProvider.tsx:5-16 đăng ký silent sau page load. Kiosk mutation recovery phụ thuộc in-memory idempotency key tại app/(kiosk)/kiosk/page.tsx:337-353.
- **Tác động:** Tablet mất network trong lúc load catalog, lookup hoặc submit không có offline shell hoặc durable command status. Same-session retry an toàn hơn duplicate, nhưng refresh browser hoặc process restart làm mất form/key và có thể để khách hàng không biết trạng thái.
- **Khuyến nghị:** Giữ online-only MVP scope. UI phải nói rõ submit cần online, giữ form state và trạng thái “checking status/retry with same key” cho request đang chạy, đồng thời validate refresh-during-mutation. Không tạo kỳ vọng offline success chỉ vì có PWA shell.
- **Effort:** S/M
- **Tiêu chí nghiệm thu:** Offline catalog/lookup/submit state rõ ràng; timeout không hiển thị success nếu chưa có server receipt; retry trong cùng session reuse key; refresh-during-mutation có recovery path được ghi rõ; manifest không ngụ ý hỗ trợ offline mutation.

#### REL-002 — Migration rollback và production restore chưa được rehearsal

- **Phân loại:** Cần xác minh khi chạy thực tế
- **Mức độ:** P1
- **Bằng chứng:** docker/docker-compose.yml:46-63 chạy prisma migrate deploy trước app. docs/implementation/FINAL_REPORT.md và docs/implementation/RELEASE_CHECKLIST.md:36-39 ghi nhận migration additive không có generated down migration và backup/restore rollback rehearsal còn mở.
- **Tác động:** Follow-up migration hoặc application release lỗi không thể undo bằng down command đơn giản. Không có staging restore rehearsal thì recovery time và data-loss boundary chưa biết.
- **Khuyến nghị:** Rehearse backup/restore và forward corrective migration trên staging; ghi release gate trước khi áp migration production. Giữ migration service ordering và database-volume preservation.
- **Effort:** M (operations)
- **Tiêu chí nghiệm thu:** Staging backup restore được vào PostgreSQL instance sạch; failed app deploy có thể rollback theo procedure đã ghi; migration/seed log và schema version được lưu; không reset production volume.

#### OBS-001 — Request timing/command telemetry chưa bao phủ toàn bộ API surface

- **Phân loại:** Đã xác nhận
- **Mức độ:** P1
- **Bằng chứng:** src/server/observability.ts:12-40 cung cấp wrapper. Chỉ các route file health, board, kiosk check-in, payment confirm, cancellation, closing và retention import wrapper này. app/api/admin/appointments/route.ts:1-80, app/api/admin/reports/route.ts:1-24, app/api/admin/config/route.ts:1-27 và Admin CRUD route không wrap request. Release checklist thừa nhận full admin-route coverage còn mở.
- **Tác động:** Admin read volume lớn nhất và nhiều mutation failure chưa có request ID, duration, outcome và rejection telemetry thống nhất, làm khó chẩn đoán stale-data, slow-query và operator failure.
- **Khuyến nghị:** Thêm wrapper nhất quán ở route boundary hoặc shared handler adapter cho Admin/API route, với metadata đã redact. Thêm dashboard/alert cho p95, 4xx/5xx, pool/lock wait, stale board, job failure và kiosk lookup abuse.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Mọi operational route phát request ID/status/duration; sensitive body field bị loại; dashboard có Admin refresh latency/error và job/board/lookup health; alert threshold được test bằng staging fault.

#### REL-003 — Generic Admin create command không retry-safe sau unknown outcome

- **Phân loại:** Rủi ro tiềm ẩn
- **Mức độ:** P2
- **Bằng chứng:** src/components/admin-management.tsx:84-105 POST generic customer/staff/service/category mutation không có idempotency key; app/api/admin/customers/route.ts:15-26 và Admin route tương tự tạo record không có CommandReceipt. UI disable button trong lúc chờ, nhưng network timeout khiến operator có thể submit lại.
- **Tác động:** Create thành công rồi mất response có thể tạo duplicate service/category/staff/account record hoặc uniqueness error khó hiểu khi retry. Critical operational command đã có stable receipt; finding này chỉ áp dụng generic master-data create.
- **Khuyến nghị:** Hoặc thêm idempotency chỉ cho create command có thể retry, hoặc cung cấp “kiểm tra đã lưu chưa”/refresh recovery trước khi cho create lần hai. Không thêm receipt cho update idempotent không cần thiết.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Create response mất sau commit có một recovery path deterministic và chỉ một record; payload thay đổi khi reuse key bị reject; create/edit/delete workflow bình thường và audit record không đổi.

## 6. Khoảng trống test coverage và chất lượng bằng chứng

Bằng chứng static mới nhất được ghi nhận: 34 unit/default test pass, 9 DB-gated test skip khi không có DB variable; coverage statement/line 24.88%, branch 68.75%, function 11.39%; sequential disposable PostgreSQL suite postgres 3/3, admin-access 1/1, critical-workflows 5/5; protected tablet E2E 7/7; returning-guest kiosk E2E 2/2; resilience E2E 3/3; Chromium viewport review pass ở 810×1080 và 1080×810. Coverage percentage tự nó không phải quality score; scenario gap bên dưới quan trọng hơn.

#### QA-001 — Catalog/payment traceability follow-up path thiếu DB/E2E evidence riêng

- **Phân loại:** Đã xác nhận
- **Mức độ:** P1
- **Bằng chứng:** docs/implementation/TEST_MATRIX.md:28-29 đánh dấu catalog lifecycle là NOT RUN và payment adjustment/correction/refund là NOT RUN. :29 cũng xác định turn-history DB/API coverage là NOT RUN. tests/e2e/appointment-history.spec.ts có basic browser turn-history happy path nhưng chưa có actor/snapshot/filter/edge matrix đầy đủ.
- **Tác động:** Category archive guard mới, payment audit semantics, refund và turn-event snapshot có thể pass static/type check trong khi transaction boundary hoặc report calculation sai.
- **Khuyến nghị:** Thêm sequential disposable-PostgreSQL test và Admin E2E tập trung cho từng follow-up command. Giữ external terminal/refund execution bên ngoài app và chỉ assert evidence đã ghi.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Category create/update/archive/reactivate, archived-service rejection, payment adjustment/correction/refund cap/idempotency/audit history và turn-event actor/staff snapshot/filter rendering đều pass DB/API/browser test.

#### QA-002 — Session revocation, PIN lockout concurrency và key-reuse conflict chưa được exercise đầy đủ

- **Phân loại:** Đã xác nhận
- **Mức độ:** P1
- **Bằng chứng:** docs/implementation/TEST_MATRIX.md:25-29 đánh dấu deactivated-account access và verified-session revocation NOT RUN; :14 đánh dấu changed-payload same-key check-in NOT RUN. src/server/security.ts:41-64 có cross-process race risk. Concurrency coverage hiện tại trong tests/integration/concurrency.test.ts dùng in-memory AssignmentMutex, trong khi real DB accept concurrency nằm ở tests/integration/critical-workflows.test.ts:92-109.
- **Tác động:** Auth/session và retry safety là trung tâm của shared-tablet system; pass set hiện tại chưa chứng minh immediate invalidation, persistent lockout dưới replica concurrency hoặc mọi request-hash conflict response.
- **Khuyến nghị:** Thêm auth integration test với session cookie/JWT read thật, two-process hoặc transaction-level PIN attempt và changed-payload receipt test cho kiosk/staff/payment command.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Account bị deactivate/đổi role fail ở protected request kế tiếp; revoked staff session fail; năm concurrent wrong PIN lockout; mọi critical command reject payload thay đổi khi dùng cùng key và chỉ tạo một side-effect set.

#### QA-003 — Admin stale/error race và accessibility interaction chưa được test

- **Phân loại:** Đã xác nhận
- **Mức độ:** P1
- **Bằng chứng:** docs/implementation/TEST_MATRIX.md:47-54 ghi modal focus/loading/empty/error/stale message là NOT RUN. E2E suite không có delayed-response test cho app/(admin)/admin/page.tsx:273-346, không có background-refresh failure test ngoài Overview và không có VoiceOver/WebKit test.
- **Tác động:** Hành vi operator UI có rủi ro cao nhất hiện mới được code-review: stale data có thể bị sử dụng, focus có thể thoát mobile navigation và accessibility semantics có thể regression mà không bị phát hiện.
- **Khuyến nghị:** Thêm Playwright route interception test cho delayed/out-of-order refresh, section-specific failure, retry/recovery, keyboard tab/dialog/drawer behavior và visible stale indicator. Chạy manual WebKit/VoiceOver trên hardware.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Response cũ không ghi đè scope mới; mọi Admin section expose refresh failure/staleness; modal/drawer focus/escape/restore pass; loading/empty/error state được assert cho kiosk, board, Admin và payment flow.

#### QA-004 — Performance test chưa tách allocator/routing/history-sort workload

- **Phân loại:** Đã xác nhận
- **Mức độ:** P1
- **Bằng chứng:** docs/implementation/TEST_MATRIX.md:64-78 ghi broad local/representative benchmark, nhưng không có dedicated 20.000-appointment check-in allocator, 1.000-waiting-appointment reconcile, duration/payment-sort memory test hoặc large customer directory/history test. Benchmark hiện tại chứng minh bounded default history path, không phải mọi sort mode.
- **Tác động:** Các lock/CPU risk tăng theo volume có thể regression trong khi headline benchmark vẫn xanh.
- **Khuyến nghị:** Mở rộng disposable benchmark fixture và ghi query count, rows, memory, lock wait, p95/p99 và payload cho từng path PERF-003 đến PERF-008.
- **Effort:** M
- **Tiêu chí nghiệm thu:** Mỗi high-risk path có benchmark threshold có tên và fixture lặp lại được; kết quả được lưu trong release evidence; failure chặn performance claim nhưng không tự động dẫn tới thêm index suy đoán.

#### QA-005 — Physical device, live-network và deployment gate còn mở

- **Phân loại:** Cần xác minh khi chạy thực tế
- **Mức độ:** P0
- **Bằng chứng:** docs/implementation/VIEWPORT_QA.md:48-52, docs/implementation/RELEASE_CHECKLIST.md:32-39 và docs/project_state.md:105-126 ghi rõ physical iPad/WebKit, distance readability, Dynamic Type/VoiceOver, live Wi-Fi, offline/refresh-during-mutation, production SLO, scheduler, security audit, rollback và follow-up test còn mở.
- **Tác động:** Quyết định production release sẽ dựa trên Chromium/local evidence mà thôi. Failure ở gate này có thể ảnh hưởng customer check-in, shared-board visibility, payment operation hoặc recovery sau network event.
- **Khuyến nghị:** Chạy docs/implementation/TABLET_QA_PLAN.md trên iPad model đã chọn và staging network, sau đó chạy deployment/security/rollback checklist. Tách kết quả khỏi local test pass count.
- **Effort:** L (validation)
- **Tiêu chí nghiệm thu:** Physical Kiosk/Board/Admin journey pass portrait/landscape; VoiceOver/Dynamic Type/focus/touch/safe-area check pass; network interruption/recovery thực và refresh-during-mutation được quan sát; staging proxy/TLS/pool/SLO/rollback/scheduler evidence được gắn vào release approval.

## 7. Backlog ưu tiên P0/P1/P2

| ID | Hạng mục backlog | Ưu tiên | Phân loại | Effort | Phụ thuộc | Definition of done |
|---|---|---:|---|---:|---|---|
| SEC-003 | Đóng khoảng trống direct-app-port/TLS/rate-limit ingress | P0 | Cần xác minh khi chạy thực tế | M | Deployment topology được chọn | App port không externally reachable; public TLS ingress và edge rate limit được xác minh; cookie/origin/SSE hoạt động qua proxy thật. |
| QA-005 | Hoàn tất physical tablet, live Wi-Fi, accessibility và staging release gate | P0 | Cần xác minh khi chạy thực tế | L | Hardware, staging network, operator | Có run sheet physical three-surface, accessibility, network interruption, pool/SLO và rollback được sign-off. |
| BUS-001 | Enforce kiosk hours ở server và refresh client status | P1 | Đã xác nhận | M | Quyết định business boundary | Direct và UI check-in khớp rule timezone/open-close; không tạo appointment ngoài giờ. |
| UX-ADM-001 | Hiển thị Admin stale/error state toàn cục ngoài Overview | P1 | Đã xác nhận | M | Quyết định data-health copy | Queue, Appointments, Payments, Customers và Settings hiển thị last success/stale/retry và action safety. |
| PERF-001/002 | Giảm Admin refresh fan-out và làm refresh revision abort/order-safe | P1 | Đã xác nhận | M | Thống nhất request/payload budget | Active-section refresh đạt request budget; delayed old response không ghi đè dữ liệu mới; background refresh có visibility awareness. |
| PERF-003/004 | Giới hạn routing/check-in work dưới shop/date lock | P1 | Rủi ro tiềm ẩn | M/L | Routing fixture và code policy | Waiting-queue và high-volume code benchmark pass; query count/lock/p95 evidence hỗ trợ implementation đã chọn. |
| PERF-005 | Thay scan duration/payment toàn bộ match bằng database/page strategy đã đo | P1 | Đã xác nhận | M | Query-plan review | Sort page bounded về rows/memory/p95 ở volume đại diện và deterministic ordering giữ nguyên. |
| SEC-001 | Atomic hóa persistent PIN failure counting | P1 | Rủi ro tiềm ẩn | S/M | Replica/concurrency test harness | Wrong-PIN qua process chéo tạo lockout deterministic và reset an toàn. |
| SEC-002 | Harden/measure production CSP và self-host/fallback font | P1 | Rủi ro tiềm ẩn | M | Production Next/Auth/PWA CSP test | CSP report được review; unsafe directive không cần thiết đã bỏ; operational route vẫn hoạt động. |
| OBS-001 | Instrument toàn bộ Admin/API route còn lại và dashboard | P1 | Đã xác nhận | M | Logging/alert destination | Mọi route emit request ID/status/duration redacted; alert stale-board, job, lock, pool và lookup được test. |
| QA-001/002/003/004 | Bổ sung catalog/payment/session/PIN/race/stale/focus/scale evidence | P1 | Đã xác nhận | M | Disposable PostgreSQL CI job | Case còn thiếu pass trong CI hoặc staging job lặp lại được. |
| UX-ADM-003 / UX-BRD-003 / UX-KSK-002 | Hoàn tất portrait/landscape/table/distance validation và quyết định compact mode | P1 | Cần xác minh khi chạy thực tế | M | Hardware và supported-width decision | Không clipped primary action hoặc module không discoverable; board đọc được từ khoảng cách thống nhất; physical touch pass được ghi. |
| BUS-003 | Centralize active service + active category predicate | P2 | Rủi ro tiềm ẩn | S | Không có | Direct check-in/service-change không chọn service thuộc archived category; archive guard hiện tại vẫn giữ. |
| PERF-006/007/008 | Giới hạn board queue, customer directory/history và filter scan còn lại | P2 | Rủi ro tiềm ẩn | M | Representative fixture | Row/payload/query plan bounded và search/history vẫn usable ở scale thống nhất. |
| PERF-009 | Đo route bundle và giảm Admin client/CSS/font cost nếu vượt budget | P2 | Rủi ro tiềm ẩn | M/L | Production asset trace | Route asset budget và tablet TTI được ghi; optimization dựa trên evidence. |
| UX-KSK-003/004, UX-BRD-001/002, UX-ADM-002/005, UX-SHR-001/002 | Hoàn tất accessibility semantics, live-region, contrast, focus và payment-error pass | P2 | Đã xác nhận/Rủi ro tiềm ẩn | S/M | VoiceOver/manual keyboard review | Shared primitive pass keyboard/screen-reader/contrast mà không regression. |
| REL-001 / REL-003 | Làm rõ online-only recovery và retry-safe cho generic Admin create | P2 | Đã xác nhận/Rủi ro tiềm ẩn | S/M | Product copy và receipt scope | Không mutation nào hiển thị success khi chưa có server response; unknown outcome có recovery an toàn; duplicate generic create bị ngăn hoặc phát hiện. |
| BUS-002 / PERF-010 | Ghi repeated-skip và polling contract vào product/architecture docs | P2 | Rủi ro tiềm ẩn/Đã xác nhận | S | Product decision | Repeated-skip escalation và board freshness interval rõ ràng, nhất quán và có test. |
| BUS-004 / REL-002 | Hoàn tất scheduler, alerting, retention policy và rollback rehearsal | P1 | Cần xác minh khi chạy thực tế | M | Operator approval/backup | Job chạy đúng lịch có alert; retention window và restore procedure được duyệt và rehearsal. |

## 8. Quick wins

Các quick win sau có scope nhỏ và không thay đổi business scope MVP:

1. Thêm open-hours check ở server và client clock/visibility refresh ngắn cho kiosk.
2. Thêm global Admin stale/error banner và refresh revision/AbortController; chưa cần chờ read-model redesign lớn.
3. Bỏ aria-live countdown theo từng giây và chỉ announce thay đổi verification state.
4. Đồng bộ board polling interval trong docs với implementation 5 giây sau khi chọn target dựa trên measurement.
5. Làm tối --color-muted-taupe cho meaningful helper text và thêm contrast regression check.
6. Thêm mobile-drawer focus trap/restore cho Admin bằng behavior useDialogFocus hiện có.
7. Thêm direct API test cho out-of-hours check-in, changed request-hash reuse và archived-category service selection.
8. Thêm route-level request wrapper cho Admin GET volume cao trước khi xây dashboard.

## 9. Các batch implementation đề xuất

### Batch 0 — Release gate và quyết định vận hành

**Mục tiêu:** Làm rõ giới hạn supervised-pilot và thu thập runtime evidence.

- Xác nhận iPad model/orientation, board viewing distance, staged network, TLS/ingress, public port exposure, pool limit và SLO.
- Quyết định repeated-skip escalation và board freshness interval được ghi nhận.
- Duyệt retention window, scheduler ownership, alert channel và backup/restore rollback procedure.

**Exit criteria:** Evidence của QA-005, SEC-003, BUS-004 và REL-002 được gắn; batch này không ngụ ý source fix trước khi quyết định được duyệt.

### Batch 1 — Hardening correctness và security boundary

**Mục tiêu:** Loại bỏ các business-rule/security gap đáng tin cậy nhất bằng thay đổi nhỏ, có mục tiêu.

- Implement BUS-001 server-side hours và BUS-003 catalog predicate centralization.
- Atomic hóa persistent PIN counting cho SEC-001.
- Validate CSP policy và edge privacy/rate-limit behavior cho SEC-002/SEC-004.
- Thêm QA-002 direct test cho session, PIN lockout, request-hash conflict và generic command recovery.

**Exit criteria:** Tất cả boundary test mới pass với disposable PostgreSQL; không đổi workflow rule đã duyệt; audit/telemetry record vẫn nguyên.

### Batch 2 — Admin data path và database scale

**Mục tiêu:** Giảm work không cần thiết và đo scale behavior trước khi tối ưu schema.

- Sửa refresh scope/order/error behavior của PERF-001/002.
- Profile routing và code allocation PERF-003/004 với waiting volume đại diện.
- Xử lý sort mode PERF-005 bằng measured query plan.
- Chỉ thêm bounded customer directory/history và board queue projection khi fixture chứng minh cần.

**Exit criteria:** Query count, payload, memory, lock-wait và p95/p99 budget được ghi cho từng path; schema change được biện minh bằng EXPLAIN ANALYZE.

### Batch 3 — Tablet UX và accessibility

**Mục tiêu:** Đóng interaction gap mà không redesign information architecture đã duyệt.

- Hoàn thiện tab/live-region/contrast semantics.
- Thêm Admin drawer focus containment và payment inline error.
- Validate kiosk CTA/step focus, portrait navigation/table affordance, board distance readability và real touch.

**Exit criteria:** Physical WebKit/VoiceOver/Dynamic Type/manual keyboard result pass; không clipped hoặc hidden primary action; accessibility regression note được lưu.

### Batch 4 — Observability và operational proof

**Mục tiêu:** Làm incident production có thể chẩn đoán và chứng minh unattended operation.

- Instrument mọi Admin/API route bằng timing/status/request ID đã redact.
- Cấu hình job scheduling/retry/alerting và retention runbook.
- Rehearse migration backup/restore, deployment rollback, direct-port blocking, CSP và pool saturation.

**Exit criteria:** Operator dashboard hiển thị board freshness, command failure, API p95/5xx, lock/pool health, kiosk lookup abuse và job outcome; rollback được thực hành trên staging.

## 10. Tiêu chí nghiệm thu và test case

| ID | Test case | Kết quả mong đợi |
|---|---|---|
| AC-01 | POST check-in ngay trước opening, tại opening, ngay trước closing, tại closing và ngoài window | Opening được nhận; closing bị từ chối; boundary/timezone rule được ghi rõ và nhất quán ở UI/API. |
| AC-02 | Để kiosk mở qua closing rồi submit không reload | UI đổi sang Closed và server reject visit mới; không có customer/appointment side effect. |
| AC-03 | Replay successful in-hours check-in key sau khi window đã đóng | Behavior theo replay rule đã ghi và không tạo visit thứ hai. |
| AC-04 | Direct check-in/service-change cho active service thuộc archived category | Bị reject với error stable; không có receipt/appointment/service-change side effect. |
| AC-05 | Năm concurrent wrong PIN qua hai app process | Persistent lockout đạt một lần deterministic; attempt sau đó fail tới khi hết hạn; PIN đúng clear state. |
| AC-06 | Deactivate/role-change account đang có JWT; revoke verified staff session | Protected request kế tiếp fail; public board/kiosk vẫn available; không có stale privilege. |
| AC-07 | Delay Admin report/appointment response cũ rồi đổi date/month và complete request mới | Response cũ bị ignore/abort; scope mới nhất visible; timestamp/revision phản ánh success mới nhất. |
| AC-08 | Làm background refresh fail khi đang ở Queue, Payments, Appointments, Customers và Settings | Mỗi section hiển thị stale/error/retry; operator không thể nhầm dữ liệu cũ là live. |
| AC-09 | Để Admin idle 30 phút ở mỗi section | Request count/payload khớp budget; hidden tab không gây polling không cần thiết; manual refresh hoạt động. |
| AC-10 | Reconcile 1.000 waiting appointment với multi-service bundle | Query count và transaction/lock p95 đạt budget; assignment giữ nguyên skill, fairness và exclusion. |
| AC-11 | Tạo check-in mới khi có 20.000 same-day code và concurrent client | Code format tuần tự unique, p95/p99 bounded, không duplicate/receipt conflict, gap/rollback policy được ghi. |
| AC-12 | Duration/payment sort trên 20.000 appointment, page 1/100/last | Page trả đúng/deterministic; full-match memory/rows/p95 trong budget. |
| AC-13 | Customer directory lớn và history 1.000 visit | Server pagination/search giới hạn row/payload; summary total đúng; không fetch toàn bộ lifetime trước khi user yêu cầu page. |
| AC-14 | Board có active queue lớn và public/authenticated view | Current turn đầy đủ; chỉ load/return next window cấu hình; redaction và version đúng. |
| AC-15 | Board verified PIN dialog và countdown với VoiceOver/keyboard | Focus enter/trap/restore; Escape close; countdown không announce mỗi giây; action status announce một lần. |
| AC-16 | Kiosk category tab, step change, Admin tab, mobile drawer | Tab semantics/keyboard navigation đúng; focus chuyển tới content mới; drawer trap/restore focus. |
| AC-17 | Kiosk landscape, Board portrait/distance, Admin portrait, Dynamic Type ở mức lớn nhất | Không clipped primary action; text/status đọc được; table/nav discoverable; safe-area giữ nguyên. |
| AC-18 | Payment invalid amount/tip/cash và lost response sau commit | Inline field error/focus; giữ giá trị; retry/refresh resolve một payment state; không duplicate payment/audit event. |
| AC-19 | Category lifecycle, payment adjustment/correction/refund, turn history | DB transaction, audit metadata, idempotency, cap, actor/staff snapshot và UI filter đều pass. |
| AC-20 | Public ingress security smoke | Port 3000 không externally reachable; TLS/HSTS/cookie/origin/rate-limit/SSE header đúng; log không có secret. |
| AC-21 | Closing và retention scheduler replay/failure | Job chạy đúng lịch, emit success/failure/blocked alert, replay an toàn và tuân thủ retention/backup policy. |
| AC-22 | Migration backup/restore và failed-release rollback | Staging restore và forward corrective migration được rehearsal; production rollback instruction chạy được mà không reset volume. |

## 11. Bàn giao cuối

Audit ban đầu được thực hiện ở chế độ đọc-only. Sau đó, theo phê duyệt tiếp theo của người dùng, các hạng mục có thể triển khai an toàn trong MVP đã được áp dụng ở source/config/test và chạy xác minh local. Không có migration/schema mới, dữ liệu nghiệp vụ, Docker volume hoặc database record nào bị reset/xóa.

## 12. Trạng thái implementation follow-up — 2026-10-12

Đã triển khai và kiểm tra:

- Enforce operating hours ở server transaction theo timezone của salon; kiosk tự cập nhật đồng hồ, visibility/focus và xử lý boundary mở/đóng.
- Hoàn thiện kiosk category keyboard semantics, focus chuyển bước, board tab keyboard pattern, live-region countdown, avatar/account semantics và payment field-level error/focus.
- Thêm Admin stale-data banner, retry, last-success timestamp, abort/revision guard và pause background refresh khi tab bị ẩn.
- Giảm Admin refresh fan-out theo section; thêm live appointment projection, customer search/pagination và history pagination.
- Reuse routing snapshot trong reconciliation/check-in; giới hạn board up-next query ở bốn lượt và hiển thị “Manager review” khi exclusion khiến service phải chờ.
- Atomic hóa persistent PIN failure counter; bổ sung request timing/status/request-id wrapper cho operational Admin/API routes.
- Bind Compose app vào `127.0.0.1:3000`, PostgreSQL host port mặc định `127.0.0.1:5433`, cập nhật polling contract lên 5 giây.
- Thêm unit coverage cho operating-hours và cập nhật policy/runbook/checklist tương ứng.

Kết quả local:

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run test`: 37 pass; 9 DB-gated test bị skip khi test environment không bật database.
- Docker production build: pass; container app healthy; `GET /api/health` trả `status: ok`; `/kiosk` và `/board` trả HTTP 200; `/admin` redirect tới sign-in đúng thiết kế.

Các mục vẫn là release/runtime gate, không thể chứng minh chỉ bằng source local: physical iPad/WebKit/VoiceOver/distance touch QA, staging TLS/edge rate-limit/direct-port scan, scheduler/alerting, backup/restore/rollback rehearsal, production pool/SLO, và benchmark representative cho duration/payment sort, allocator, routing contention. Không nên coi các mục này là đã hoàn tất chỉ vì local test pass.
