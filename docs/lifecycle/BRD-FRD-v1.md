---
artifact_id: BA-NSM-001
type: business-and-functional-requirements
stage: BA
status: approved-for-build
version: 1
created_at: 2026-10-07
source_artifacts: [PRD-NSM-001]
requirement_ids: [FR-KSK-001, FR-KSK-002, FR-BRD-001, FR-BRD-002, FR-ADM-001, FR-ADM-002, FR-ADM-003, FR-ENG-001, FR-ENG-002]
---

# BRD / FRD

## Use case chính: customer arrives → payment

1. Customer chọn service trên kiosk.
2. Customer nhập tên và phone; hệ thống tìm customer cũ hoặc tạo profile tối thiểu.
3. Turn engine lock business date, lọc staff PRESENT + skill đúng + AVAILABLE, rồi chọn người chờ lâu nhất.
4. Nếu có staff, appointment thành ASSIGNED và tạo turn mới; nếu không, WAITING.
5. Staff nhận/skip/finish trên board. Accept đưa service trực tiếp vào trạng thái đang phục vụ; không có bước Start riêng. Skip ghi reason, kết thúc turn cũ và quay về engine.
6. Finish chuyển appointment sang PAYMENT_PENDING.
7. Admin xác nhận CARD hoặc CASH đã thu trên terminal, tạo payment unique, chuyển COMPLETED.
8. Reports tính lại doanh thu và reconciliation.

## Quy tắc nghiệp vụ

- SKIP không phải CANCEL. Appointment vẫn hoạt động.
- Supporting staff không tạo payment thứ hai.
- Staff chưa check-in không được nhận lượt.
- Chỉ admin được confirm payment.
- Revenue-by-staff là số liệu vận hành, không phải điểm xếp hạng.
