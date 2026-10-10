---
artifact_id: PRD-NSM-001
type: product-requirements-document
stage: PRD
status: approved-for-build
version: 1
created_at: 2026-10-07
source_artifacts: [PO-NSM-001]
requirement_ids: [FR-KSK-001, FR-KSK-002, FR-BRD-001, FR-BRD-002, FR-ADM-001, FR-ADM-002, FR-ADM-003]
---

# PRD

## Actors

Customer, station device, staff member, admin, and system scheduler.

## Acceptance criteria

| ID | Tiêu chí chấp nhận | Trải nghiệm |
| --- | --- | --- |
| FR-KSK-001 | Khách chọn service, thấy duration/price, nhập phone + name, nhận mã lượt và trạng thái | `/kiosk` |
| FR-KSK-002 | Kiosk tự reset sau khi hoàn tất hoặc hết thời gian chờ; không tạo customer account | `/kiosk` |
| FR-BRD-001 | Board hiển thị current turn, up next, staff hiện diện và availability; màn hình read-only mở được không cần đăng nhập | `/board` |
| FR-BRD-002 | Accept/skip/add supporting/check-in/out yêu cầu station/admin sign-in, staff name + PIN, skip có reason và re-route | `/board` |
| FR-ADM-001 | Admin xem queue, appointment history, attendance và payment pending | `/admin` |
| FR-ADM-002 | Chỉ admin xác nhận CARD/CASH sau merchant terminal; một appointment có một payment | `/admin` |
| FR-ADM-003 | Reports có revenue, completed count, card/cash, by service/staff, difference bằng 0 | `/admin` |
| NFR-SEC-001 | Password/PIN hash bằng Argon2id, cookie httpOnly/secure/sameSite=strict, CSP và rate limit | Platform |
| NFR-CON-001 | Chuỗi eligible → assign → BUSY serialized theo shop + business date | Backend |
