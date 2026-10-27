# Phần mềm quản lý salon tóc — SE100.R11

Đồ án môn Phương pháp phát triển phần mềm hướng đối tượng (UIT). Hệ thống cho một salon unisex một chi nhánh gồm 3 phần:

| Thư mục | Vai trò | Công nghệ | Cổng |
|---|---|---|---|
| `backend/` | API + nghiệp vụ + CSDL | NestJS 11, TypeORM, PostgreSQL 16 | 3000 |
| `web-customer/` | Website khách hàng: xem dịch vụ, đặt lịch không cần tài khoản, tài khoản thành viên | React 19 + Vite | 5173 |
| `web-staff/` | Cổng nhân viên — giao diện đổi theo vai trò Chủ / Lễ tân / Stylist–Thợ phụ | React 19 + Vite | 5174 |

Cả hai web dùng chung design system **Atelier Luxury Haircare** (`shared/theme.css`) với chế độ sáng/tối (nút “Chế độ tối/sáng”, lựa chọn được nhớ theo trình duyệt).

## Chạy thử

Yêu cầu: Node.js ≥ 20, PostgreSQL 16 (hoặc Docker).

```bash
# 1. CSDL
docker compose up -d                # hoặc tự tạo DB "salon", user/pass salon/salon

# 2. Backend
cd backend
cp .env.example .env
npm install
npm run seed                        # dữ liệu mẫu; "npm run seed -- --reset" để xóa và tạo lại
npm run start:dev                   # http://localhost:3000/api — Swagger: /api/docs

# 3. Web khách hàng (terminal khác)
cd web-customer && npm install && npm run dev     # http://localhost:5173

# 4. Cổng nhân viên (terminal khác)
cd web-staff && npm install && npm run dev        # http://localhost:5174
```

Tài khoản mẫu (mật khẩu `123456`):

| Vai trò | Đăng nhập |
|---|---|
| Chủ salon | `owner` |
| Lễ tân | `letan` |
| Stylist (thợ chính) | `ST-001` … `ST-004` |
| Thợ phụ | `TP-001`, `TP-002` |
| Khách thành viên (web khách) | `0901234567` |

## Kiểm thử

```bash
cd backend
npm test             # 23 unit test: hoa hồng, khuyến mãi, tính khung giờ, vòng đời lịch hẹn
npm run test:e2e     # 7 kịch bản trên CSDL thật (chạy "npm run seed -- --reset" trước)
```

Kịch bản e2e đi hết luồng trung tâm: đặt lịch → chống trùng lịch (kể cả 2 request đồng thời) → check-in → phục vụ, thêm dịch vụ phát sinh → hóa đơn giữ giá cũ khi đổi bảng giá → thanh toán chuyển khoản chống trùng → trừ kho → chốt hoa hồng → báo cáo → khóa hủy sát giờ → no-show giải phóng thợ.

## Kiến trúc (mục 6.1.2)

`Presentation (2 web React)` → `Application (NestJS controllers + services)` → `Domain (entity + lớp nghiệp vụ thuần)` → `Persistence (TypeORM)` → `PostgreSQL`.

Các lớp nghiệp vụ thuần, không phụ thuộc framework, có unit test riêng:

- `appointments/availability.engine.ts` — tính khung giờ khả dụng: BR-01 trùng lịch, BR-02 ca làm, BR-03 giờ mở cửa, BR-04 chuyên môn, BR-05 dịch vụ ngừng, BR-17 thợ phụ.
- `billing/commission.calculator.ts` — chia hoa hồng theo % hoặc định mức cố định (mục 3.8.4, BR-19).
- `billing/promotion.engine.ts` — chọn khuyến mãi có lợi nhất cho khách (mục 3.5).
- `Appointment.transitionTo()` — máy trạng thái lịch hẹn (mục 4.3.1).

Ánh xạ quy tắc nghiệp vụ → mã nguồn:

| Quy tắc | Nơi xử lý |
|---|---|
| BR-01, R-06, ngoại lệ 16 (2 lễ tân đặt cùng khung giờ) | `AvailabilityEngine` + khóa `pg_advisory_xact_lock` theo ngày, kiểm tra lại trong transaction |
| BR-07, BR-08 (giá & hoa hồng lịch sử) | `InvoiceItem.unitPrice`, `CommissionLine` chốt khi hóa đơn PAID |
| BR-09 (không xuất âm kho) | `InventoryService`, `BillingService.finalizeIfPaid` (cấu hình `ALLOW_NEGATIVE_STOCK`) |
| BR-10, BR-15 (thanh toán) | `BillingService.pay` — mã giao dịch duy nhất, chuyển khoản chờ xác nhận |
| BR-11, BR-12 (dịch vụ thực hiện / xác nhận phát sinh) | `SessionsService.addItem/confirmItem/complete` |
| BR-13 (khiếu nại) | `OperationsService` — luồng trạng thái + lịch sử, không xóa |
| BR-16, NFR-08 (audit) | `AuditService` ghi đổi giá, hoa hồng, hủy hóa đơn, no-show… |
| BR-18 (khóa sửa/hủy < 2h) | `AppointmentsService.assertCustomerCanModify` |
| BR-20 (no-show, ân hạn 15', đặt cọc) | `AppointmentsService.noShow`, `Customer.requiresDeposit` |

Tham số nghiệp vụ (giờ mở cửa, 2 giờ, 15 phút, ngưỡng no-show…) nằm trong `backend/.env`.

## Tài liệu

- `docs/LIEN_KET_GIAO_DIEN.md` — sơ đồ liên kết giao diện, luồng màn hình và ma trận điều hướng.
- `docs/lien-ket-giao-dien.png` — sơ đồ trực quan dạng ảnh chất lượng cao (5K).
- `docs/API.md` — danh sách endpoint, quyền, dữ liệu trả về.
- `docs/screenshots/` — ảnh chụp giao diện desktop/mobile, sáng/tối.

## Giới hạn hiện tại / hướng phát triển

- Đăng ký thành viên chưa xác thực OTP số điện thoại (SMS/Zalo nằm ngoài phạm vi, mục 1.5.3).
- Khách walk-in không để lại thông tin được gắn vào hồ sơ chung “Khách vãng lai”.
- Nhắc lịch (FR-25) gửi qua kênh giả lập (log + popup web khách), chưa nối SMS/Zalo thật.
- `DB_SYNC=true` tự tạo bảng khi phát triển; triển khai thật nên tắt và dùng migration.
