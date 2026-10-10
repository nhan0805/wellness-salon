---
artifact_id: PO-NSM-001
type: product-outline
stage: PO
status: approved-for-build
version: 1
created_at: 2026-10-07
source_artifacts: ["Nail_Shop_Management_V1.0", "master prompt AI Development Lifecycle Multi-Agent"]
requirement_ids: [FR-KSK-001, FR-BRD-001, FR-ADM-001, NFR-SEC-001, NFR-CON-001]
---

# Product outline

Nail Shop Management là hệ thống vận hành một tiệm nail, chạy tốt trên tablet. Sản phẩm kết nối ba trải nghiệm trong cùng một codebase: khách tự check-in, nhân viên điều phối lượt, và admin vận hành/thanh toán/báo cáo.

## Kết quả kinh doanh cần đạt

- Khách đến tiệm có thể gia nhập hàng chờ mà không cần tài khoản.
- Lượt được phân công theo skill và công bằng theo thời gian chờ.
- Nhân viên có thể làm việc từ một turn board chung, không cần lặp PIN cho mọi hành động.
- Admin kết thúc giao dịch sau khi đã thu tiền thật trên merchant terminal.
- Báo cáo cuối ngày cân bằng: system revenue = card + cash.

## Ngoài phạm vi

Online booking, payroll, commission, inventory, loyalty, payment gateway/card processing thật, và multi-tenant.
