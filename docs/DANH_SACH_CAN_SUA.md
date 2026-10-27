# Danh sách cần sửa

Nguồn: audit logic backend + đối chiếu SRS (`BaoCaoTienDo1_QuanLySalonToc`) ngày 27/10/2026. Đây là kết quả đọc code, chưa chạy kiểm thử. Đường dẫn tính từ gốc repo.

Mức độ: 🔴 sai tiền / bảo mật · 🟠 sai nghiệp vụ · 🟡 phân quyền, toàn vẹn · ⚪ chất lượng · ➕ chức năng còn thiếu.

---

## Trạng thái: đã xử lý cả 31 mục (backend, kèm cập nhật giao diện nhân viên)

Migration: `backend/src/migrations/1793600000000-Audit31Fixes.ts`. Kiểm thử: 29 unit test, 9 e2e (`backend/test/flow.e2e-spec.ts`). Biến môi trường mới: xem `backend/.env.example`.

Còn giản lược có chủ đích (đánh dấu `ponytail:` trong code):

- Mục 10: thiết bị hỏng chỉ cảnh báo lịch đã đặt, chưa tự dời lịch.
- Hủy hóa đơn đã thu tiền rồi mở lại: lịch hẹn vẫn ở trạng thái COMPLETED.
- Thiết bị (BR-14) chưa kiểm tra cho dịch vụ thêm trong phiên.
- Giới hạn tần suất (rate limit) lưu trong bộ nhớ, mất khi khởi động lại và không chia sẻ giữa nhiều tiến trình.
- Giao diện: đã có duyệt nghỉ, nhãn thanh toán cọc/hoàn; chưa có màn hình riêng cho dòng điều chỉnh hóa đơn, hủy kèm hoàn cọc, gắn khách walk-in, hàng chờ (API đã có, xem `docs/API.md`).

---

## 🔴 P1 — Phải sửa trước

### 1. Tiền cọc: khách trả hai lần, không hoàn cọc
- **Vị trí:** `backend/src/appointments/appointments.service.ts:302` (`markDepositPaid`), `:311` (`cancel`), `backend/src/billing/billing.service.ts:59` (`createFromSession`)
- **Lỗi:**
  - Ghi nhận cọc chỉ đổi `depositStatus`. Không tạo `Payment`, không trừ vào hóa đơn, nên khách trả cả cọc lẫn toàn bộ hóa đơn.
  - Hủy lịch hợp lệ (trước mốc khóa) không hoàn cọc. Trạng thái `REFUNDED` không bao giờ được đặt.
  - Lịch chưa đóng cọc vẫn giữ chỗ mãi. Không có gì bắt buộc phải có cọc trước khi xác nhận hoặc check-in.
- **Cách sửa:**
  - Khi tạo hóa đơn từ phiên, nếu lịch có `depositStatus = PAID` thì thêm một `Payment SUCCEEDED` (method ghi rõ là cọc) bằng `depositAmount`.
  - `cancel`: đã cọc và hủy trước mốc khóa thì đặt `REFUNDED`, ghi audit. Hủy sau mốc khóa hoặc no-show thì đặt `FORFEITED` (đã có).
  - Chặn `confirm` khi `depositStatus = REQUIRED`, hoặc tự hủy lịch chưa cọc sau N giờ.
  - Thêm `REFUNDED` vào type ở `web-customer/src/lib/types.ts:74`.

### 2. Hóa đơn 0đ không bao giờ chuyển sang PAID
- **Vị trí:** `backend/src/billing/billing.module.ts:18` (`@Min(1) amount`), `backend/src/billing/billing.service.ts:200` (`finalizeIfPaid` chỉ được gọi từ `pay` và `resolvePayment`)
- **Lỗi:** Khuyến mãi 100% hoặc giá thỏa thuận 0đ làm phiên kẹt ở `AWAITING_PAYMENT`. Không sinh hoa hồng, không trừ kho, không ghi lượt ghé.
- **Cách sửa:** Trong `submit`, nếu `total === 0` thì gọi `finalizeIfPaid` ngay.
- **UI liên quan:** `web-staff/src/pages/reception/SessionsPage.tsx:199`, `Number(price) || 0` biến ô giá để trống thành 0đ. Ô trống thì báo lỗi hoặc không gửi `agreedPrice`.

### 3. `confirmItem` không kiểm tra trạng thái phiên và dòng
- **Vị trí:** `backend/src/sessions/sessions.module.ts:167`
- **Lỗi:**
  - Dòng `REMOVED` bị khôi phục.
  - Dòng `DONE` bị lùi về `CONFIRMED`. Hóa đơn chỉ lấy dòng `DONE` nên dịch vụ đã làm bị mất khỏi hóa đơn.
  - Giá sửa được cả sau khi phiên đã hoàn tất.
- **Cách sửa:** Yêu cầu `session.isEditable()` và dòng đang ở trạng thái chờ khách đồng ý. Ngoài ra thì ném `BusinessRuleError`.

### 4. Chiếm hồ sơ khách qua số điện thoại
- **Vị trí:** `backend/src/appointments/appointments.service.ts:234` (`findOrCreateCustomer`), `:536` (hồ sơ chung `0000000000`), `backend/src/auth/auth.module.ts:141` (`registerCustomer`)
- **Lỗi:**
  - Đăng ký hoặc đặt lịch bằng `0000000000` (regex vẫn chấp nhận) sẽ gắn vào hồ sơ "Khách vãng lai" chung, xem được toàn bộ lịch sử khách lạ.
  - Không có OTP: đăng ký bằng SĐT người khác là chiếm luôn hồ sơ và lịch sử của họ.
  - Đặt lịch khách vãng lai bằng SĐT người khác làm tăng `noShowCount` của họ, có thể khiến họ bị bắt đặt cọc.
- **Cách sửa:**
  - Chặn `0000000000` ở `ContactDto`, `RegisterDto` và `UpdateCustomerDto`. Hồ sơ chung đánh dấu bằng cờ (ví dụ `isAnonymous`) thay vì dựa vào SĐT.
  - Đăng ký trùng SĐT với hồ sơ đã có lịch sử: không tự gắn, mà bắt xác minh (OTP) hoặc nhờ lễ tân liên kết.

### 5. Tài khoản bị khóa vẫn dùng được, reset mật khẩu tự mở khóa
- **Vị trí:** `backend/src/common/auth.guard.ts:20`, `backend/src/auth/auth.module.ts:230`
- **Lỗi:**
  - Guard chỉ xác thực JWT, nên tài khoản bị khóa hoặc nhân viên `INACTIVE` vẫn gọi API được tới khi token hết hạn (12 giờ).
  - `mustChangePassword` chỉ chặn ở frontend. Gọi API trực tiếp là bỏ qua được.
  - `resetPassword` đặt `active: true`, tức là mở khóa tài khoản chủ salon đã khóa.
- **Cách sửa:**
  - Guard tra `UserAccount` (theo `sub`) để kiểm tra `active`. Nếu `mustChangePassword` thì chỉ cho gọi `change-password` và `me`.
  - Bỏ `active: true` trong `resetPassword`.

### 6. Hủy hóa đơn đã thu tiền, thanh toán thừa
- **Vị trí:** `backend/src/billing/billing.service.ts:138` (`cancel`), `:182` (`resolvePayment`)
- **Lỗi:**
  - Hóa đơn đã có payment `SUCCEEDED` vẫn hủy được. Tiền đã thu không được ghi hoàn.
  - Chuyển khoản `PROCESSING` được xác nhận sau khi hóa đơn đã trả đủ bằng tiền mặt sẽ thành thu thừa, không có cảnh báo.
- **Cách sửa:**
  - Chặn hủy khi `paidAmount() > 0`, trừ khi có ghi nhận hoàn tiền.
  - Khi tạo payment mới, hủy các payment `PROCESSING` còn treo của hóa đơn đó. Hoặc trong `resolvePayment`, từ chối nếu hóa đơn đã `PAID`.

---

## 🟠 P2 — Sai nghiệp vụ

### 7. Thêm dịch vụ trong phiên không kiểm tra trùng lịch
- **Vị trí:** `backend/src/sessions/sessions.module.ts:136` (`addItem`)
- **Lỗi:**
  - Không kiểm tra BR-01 và không kéo dài `appointment.endAt`, nên lịch kế tiếp của thợ bị chồng (ngoại lệ 5 và 8).
  - Không kiểm tra thợ chính (chức vụ, trạng thái) như `setAssignments` đang làm. Không validate `assistantId`, không kiểm tra trước cách chia hoa hồng.
- **Cách sửa:** Tính giờ kết thúc mới, rồi dùng lại phần kiểm tra bận của `AvailabilityEngine` (BR-01, BR-02, BR-17) cho thợ đang phục vụ. Trùng thì báo lỗi kèm lịch bị chồng. Hợp lệ thì cập nhật `endAt`.

### 8. Hủy phiên bỏ qua state machine
- **Vị trí:** `backend/src/sessions/sessions.module.ts:219-227`
- **Lỗi:**
  - Gán thẳng `a.status = CANCELLED`, nên `IN_SERVICE → CANCELLED` lọt qua dù không hợp lệ.
  - Không kiểm tra hóa đơn `DRAFT` đang có.
  - Không chạy trong transaction.
- **Cách sửa:** Bọc trong `ds.transaction`, dùng `a.transitionTo(...)` (bổ sung chuyển trạng thái hợp lệ nếu nghiệp vụ cho phép), hủy hoặc chặn khi đang có hóa đơn nháp.

### 9. Thay đổi ca và trạng thái nhân viên không xếp lại lịch
- **Vị trí:** `backend/src/employees/employees.module.ts:253` (`deleteShift`), `:207` (`updateShift`), `:131` (`update`)
- **Lỗi:**
  - Xóa ca không xử lý các lịch nằm trong ca và không ghi audit.
  - `updateShift` chỉ gọi `rearrangeForLeave` khi chuyển `ABSENT`. Thu ngắn giờ ca hoặc thêm giờ nghỉ giữa ca làm lịch nằm ngoài ca.
  - Nhân viên chuyển `ON_LEAVE` hoặc `INACTIVE` mà lịch tương lai vẫn giữ.
- **Cách sửa:** Sau mọi thay đổi ca hoặc trạng thái, tìm các lịch `BOOKED`/`CONFIRMED` không còn được ca che (`Shift.covers`), rồi gọi `rearrangeForLeave` hoặc chặn thao tác. Thêm audit cho `deleteShift`.

### 10. Thiết bị hỏng không cảnh báo lịch đã đặt
- **Vị trí:** `backend/src/operations/operations.module.ts` (`saveEquipment`, `addMaintenance`)
- **Lỗi:** Chuyển thiết bị sang `BROKEN` hoặc `MAINTENANCE` chỉ chặn lịch mới. Lịch đã đặt cần loại thiết bị đó vẫn giữ nguyên.
- **Cách sửa:** Khi số máy dùng được giảm, liệt kê các lịch tương lai vượt công suất và trả về cảnh báo cho lễ tân, hoặc tạo thông báo.

### 11. Check-in
- **Vị trí:** `backend/src/appointments/appointments.service.ts:473`
- **Lỗi:**
  - Check-in được trước ngày hẹn nhiều ngày.
  - Khách đến trễ không làm dời `endAt`, nên lịch khả dụng phía sau tính sai.
- **Cách sửa:** Chỉ cho check-in trong ngày hẹn, trong một cửa sổ quanh `startAt`. Khi check-in trễ, tính lại `endAt` theo giờ thực tế và kiểm tra trùng với lịch sau của thợ.

### 12. Đổi số điện thoại khách
- **Vị trí:** `backend/src/customers/customers.module.ts:88` (`update`)
- **Lỗi:** SĐT trùng gây lỗi 500. `UserAccount.username` không được cập nhật, nên khách không đăng nhập được và không dùng được quên mật khẩu.
- **Cách sửa:** Kiểm tra trùng thì trả `ConflictException`. Cập nhật `username` của tài khoản liên kết trong cùng transaction.

### 13. Tỷ lệ hoa hồng lấy tại lúc thanh toán
- **Vị trí:** `backend/src/billing/billing.service.ts:224`
- **Lỗi:** Đọc `item.service.commissionRate` hiện tại. Đổi tỷ lệ khi phiên đã xong nhưng chưa thanh toán thì phiên đó áp tỷ lệ mới (ngoại lệ 14).
- **Cách sửa:** Snapshot `rate`, `mode`, `leadShare`, `assistantFixedFee` vào `ServiceSessionItem` khi thêm dịch vụ, và tính hoa hồng từ snapshot.

### 14. Cờ "khuyến mãi lần đầu" dò theo tên
- **Vị trí:** `backend/src/billing/billing.service.ts:250`
- **Lỗi:** Tìm chương trình khuyến mãi theo tên, trong khi tên không unique.
- **Cách sửa:** Lưu `promotionId` trên `Invoice` khi `applyPromotion`, rồi đọc lại bằng id.

---

## 🟡 P3 — Phân quyền, bảo mật, toàn vẹn

### 15. Thợ xem được dữ liệu của mọi khách (SRS §22)
- STYLIST và ASSISTANT xem được toàn bộ khách hàng, `hairNotes`, hóa đơn, mọi phiên, mọi phiếu tư vấn.
- **Cách sửa:** Với hai vai trò này, chỉ trả khách và phiên có lịch do mình phụ trách. Ẩn hóa đơn và bỏ `STAFF_ROLES` ở `GET /consultations`.

### 16. API công khai lộ dữ liệu nội bộ
- `GET /services?all=true` và `GET /services/:id` trả cấu hình hoa hồng và dịch vụ đã ngừng.
- **Cách sửa:** Người chưa đăng nhập chỉ nhận dịch vụ `ACTIVE`, bỏ các trường hoa hồng.

### 17. Đặt lịch công khai không giới hạn
- `POST /appointments` không rate-limit và không giới hạn số lịch đang mở trên mỗi SĐT, nên có thể bị giữ chỗ ảo hàng loạt.
- **Cách sửa:** Giới hạn số lịch tương lai trên mỗi SĐT (ví dụ 3) và rate-limit theo IP. Làm tương tự cho `forgot-password`.

### 18. Kho: thợ được điều chỉnh tồn
- **Vị trí:** `backend/src/inventory/inventory.module.ts`
- STYLIST và ASSISTANT tạo được movement `ADJUSTMENT` và `DAMAGE`.
- **Cách sửa:** Chỉ OWNER và RECEPTIONIST được `ADJUSTMENT`. Ghi audit cho mọi movement và phiếu nhập.

### 19. Nhân viên tự xin nghỉ, không cần duyệt
- **Vị trí:** `backend/src/employees/employees.module.ts:227` (`requestLeave`)
- **Cách sửa:** Tạo yêu cầu ở trạng thái chờ duyệt. Chủ salon duyệt thì mới áp dụng và xếp lại lịch.

### 20. Thiếu transaction (NFR-12)
- `sessions.module.ts`: `start` (`:121`), `cancel` (`:219`), `confirmItem` (`:167`)
- `operations.module.ts`: `updateComplaint`
- `employees.module.ts:191`: `bulkShifts`. Ngoài ra không kiểm tra `from ≤ to` và không giới hạn độ dài khoảng ngày.

### 21. Thiếu audit (NFR-08)
- Xóa ca; tạo và sửa thiết bị; nhập kho; xuất dùng, điều chỉnh, hủy hàng; thêm sản phẩm vào hóa đơn (`billing.service.ts:101`); tạo sản phẩm.

---

## ⚪ P4 — Chất lượng

- [x] Trùng mã hoặc SKU của dịch vụ, sản phẩm, thiết bị trả về 500. Bắt lỗi unique và trả `409 Conflict`.
- [x] `EmployeeDto.password` dùng `MinLength(6)` (`employees.module.ts:31`, `:43`). Đổi sang `PASSWORD_RULE` của module auth.
- [x] `addProduct` cho phép hai dòng trùng sản phẩm. Gộp vào dòng sẵn có (cộng số lượng).
- [x] Khuyến mãi: kiểm tra `startDate ≤ endDate`; giá trị âm; danh mục áp dụng tồn tại.
- [x] `updateComplaint`: validate `assigneeId` có tồn tại. Khi lễ tân tạo khiếu nại kèm `invoiceId`, kiểm tra hóa đơn thuộc đúng `customerId`.
- [x] `createConsultation`: validate `customerId` (hiện là lỗi FK, trả 500).
- [x] `salon-info` đọc thẳng `process.env`, lặp lại giá trị mặc định. Lấy từ `BusinessRulesConfig` và bổ sung các tham số cọc.
- [x] Mức cọc 20%, tối thiểu 100.000đ đang hardcode (`appointments.service.ts:171`). Chuyển vào `BusinessRulesConfig`.
- [x] Báo cáo (`backend/src/reports/reports.module.ts`):
  - `profitEstimate` chưa trừ hoa hồng và tiền nhập hàng.
  - Tiền cọc bị giữ (`FORFEITED`) chưa được tính vào doanh thu.
  - `busyHours` chỉ tính lịch đã đến. Ghi chú rõ định nghĩa, hoặc tính cả lịch đã đặt.
- [x] `auditLogs` lấy cố định 200 dòng. Thêm phân trang hoặc lọc theo ngày.

---

## ➕ Chức năng còn thiếu so với SRS

| # | Chức năng | Nguồn SRS | Ưu tiên |
|---|---|---|---|
| 22 | Gắn hoặc tạo hồ sơ khách cho phiên walk-in sau khi phục vụ, trước khi lập hóa đơn | §7.3, FR-07 | Must |
| 23 | Chính sách hoa hồng theo nhân viên (hiện tính theo dịch vụ) | §6.2, §9.4, FR-16 | Must |
| 24 | Sửa hóa đơn bị nhập sai: mở lại phiên hoặc thêm dòng điều chỉnh/giảm giá thủ công có audit | Ngoại lệ 12, FR-13 | Must |
| 25 | Hoàn tiền: cọc, hóa đơn hủy sau khi đã thu | Ngoại lệ 2, 11; §11 | Should |
| 26 | Ca trước kéo dài: cập nhật giờ kết thúc thực tế, cảnh báo và đề xuất dời lịch kế tiếp | Ngoại lệ 5 | Should |
| 27 | Định mức vật tư theo dịch vụ: trừ kho theo phiên, cảnh báo thiếu nguyên liệu khi nhận khách | Ngoại lệ 9, FR-18 | Should |
| 28 | Ngày nghỉ lễ, ngày salon đóng cửa (chặn đặt lịch) | FR-05 | Should |
| 29 | Gộp, xóa, ẩn danh hồ sơ khách | §22, FR-01 | Should |
| 30 | Hàng chờ walk-in | §7.3 | Could |
| 31 | Gửi nhắc lịch thật qua SMS, Zalo hoặc email (hiện chỉ giả lập trong app) | FR-25 | Could |

---

## Thứ tự đề xuất

1. Mục 1–6 (tiền và bảo mật).
2. Mục 7, 8, 11 (luồng phục vụ tại quầy).
3. Mục 22, 23, 24 (chức năng Must còn thiếu).
4. Mục 9, 10, 12, 13, 14.
5. Nhóm P3, rồi P4, rồi phần chức năng còn lại.

Sau mỗi nhóm: bổ sung test cho domain class liên quan (`AvailabilityEngine`, `CommissionCalculator`, `Appointment.transitionTo`) và chạy lại toàn bộ test backend.
