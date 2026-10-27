# HANDOFF — Phần mềm quản lý salon tóc (SE100)

Tài liệu bàn giao cho người tiếp nhận dự án. Đọc mục 1 và 2 trước khi chạy.

## 1. Trạng thái tổng quan

| Phần | Trạng thái |
|---|---|
| Backend NestJS (`backend/`) | Hoàn chỉnh cho phạm vi đã chốt. `tsc` pass, 23 unit test và 8 kịch bản e2e đã pass sau khi seed lại. |
| Web khách (`web-customer/`) | Hoàn chỉnh: trang chủ, đặt lịch không cần tài khoản, đăng ký, đăng nhập, tài khoản, quên mật khẩu, đổi mật khẩu, chính sách, 404, dark mode. `npm run build` pass. Đã test Playwright ở 1440px và 375px. |
| Web nhân viên (`web-staff/`) | Hoàn chỉnh cho lễ tân, chủ salon và thợ (lịch, phiên phục vụ, hóa đơn, khách hàng, khiếu nại, kho, dashboard, nhân viên, ca, dịch vụ, hoa hồng, khuyến mãi, thiết bị, chi phí, nhật ký, ngày/ca/hoa hồng của thợ). `npm run build` pass. |
| Trang tài khoản nhân viên | **Đã hoàn thành.** Đã gắn router trong `web-staff/src/App.tsx`, bổ sung `ForcePasswordGuard`, trang lỗi 403 / 404, liên kết điều hướng hồ sơ, đã chạy kiểm thử Playwright tự động và chụp ảnh 1440px / 375px cho cả light và dark mode. |
| Canvas thiết kế (7 artboard, có dark mode) | Hoàn chỉnh. Design system "Atelier Luxury Haircare" nằm trong artifact riêng. |

## 2. Chạy dự án

Yêu cầu: Node 20+, PostgreSQL 16 (có `docker-compose.yml` ở gốc).

```bash
# 1. Cơ sở dữ liệu
docker compose up -d                  # Postgres 16 + sao lưu định kỳ; hoặc tự cài Postgres 16

# 2. Backend (cổng 3000)
cd backend
cp .env.example .env                  # chỉnh DB_* nếu cần
npm install
npm run seed -- --reset               # tạo dữ liệu mẫu
npm run start:dev                     # Swagger: http://localhost:3000/api/docs

# 3. Web khách (cổng 5173)
cd web-customer && npm install && npm run dev

# 4. Web nhân viên (cổng 5174)
cd web-staff && npm install && npm run dev
```

Kiểm tra: `cd backend && npm test` (unit) và `npm run test:e2e` (cần backend đang chạy hoặc để test tự khởi tạo DB theo cấu hình).

## 3. Tài khoản mẫu

Mật khẩu mặc định của mọi tài khoản seed là `123456`, trừ các trường hợp ghi chú dưới đây.

| Tài khoản | Vai trò | Ghi chú |
|---|---|---|
| `owner` | Chủ salon | |
| `letan` | Lễ tân | Trong lúc test đã có một lần cấp lại mật khẩu qua luồng yêu cầu. Nếu đăng nhập lỗi, chạy lại `npm run seed -- --reset`. |
| `ST-001` … `ST-004` | Thợ tóc | |
| `TP-001`, `TP-002` | Thợ phụ | |
| `0901234567` | Khách thành viên | **Mật khẩu hiện là `Salon2026`** (đã đổi trong lúc test). Chạy `seed --reset` để về `123456`. |
| `0977…` | Khách test tự đăng ký | Mật khẩu `abc123`, dữ liệu test, có thể xóa. |

## 4. Quy tắc mật khẩu và luồng quên mật khẩu

- Mật khẩu tối thiểu 6 ký tự, có ít nhất một chữ cái (a–z) và một chữ số. Frontend và backend dùng cùng quy tắc `^(?=.*[A-Za-z])(?=.*\d).{6,}$`.
- Tài khoản nhân viên mới được tạo với `mustChangePassword = true`. Khi đăng nhập, web khách chuyển về `/doi-mat-khau?bat-buoc=1` trước khi cho dùng các trang khác.
- Quên mật khẩu: khách gửi yêu cầu công khai (`POST /auth/forgot-password`), lễ tân xử lý ở `/password-requests` (API `/password-requests`). Lễ tân xác nhận bằng `DONE` hoặc `REJECTED`, và `DONE` trả về mật khẩu tạm.
- Mật khẩu tạm sinh ra có dạng 4 chữ + 4 số.

## 5. Tiến độ hoàn thành các việc dang dở

1. **Gắn router cho trang tài khoản nhân viên** trong `web-staff/src/App.tsx`: **[ĐÃ HOÀN THÀNH]**
   - Đã khai báo và import đầy đủ:
     - `pages/ChangePasswordPage.tsx` (route `/doi-mat-khau`)
     - `pages/ProfilePage.tsx` (route `/ho-so`, gọi `GET/PATCH /employees/me`)
     - `pages/owner/AccountsPage.tsx` (route `/tai-khoan`, gọi `/accounts`)
     - `pages/owner/NewEmployeePage.tsx` (route `/nhan-vien/tao-moi`)
     - `pages/reception/PasswordRequestsPage.tsx` (route `/yeu-cau-mat-khau`)
     - `pages/ForgotPasswordPage.tsx` (route `/quen-mat-khau`, liên kết từ form đăng nhập)
     - `pages/ErrorPages.tsx` (403 Forbidden khi truy cập trái vai trò, 404 NotFound khi đường dẫn lạ).
   - Đã thêm guard bắt buộc `ForcePasswordGuard`: tài khoản có `mustChangePassword = true` bị chặn và tự động chuyển về `/doi-mat-khau` cho đến khi hoàn thành đổi mật khẩu.
   - Đã cập nhật `NAV` trong `web-staff/src/lib/nav.ts` và header nhân viên trong `StaffLayout.tsx` để truy cập trang hồ sơ cá nhân.
   - Đã viết kịch bản Playwright e2e (`web-staff/e2e-verify.mjs`, lệnh `npm run test:e2e` trong `web-staff`), kiểm thử toàn diện các luồng trên và chụp đầy đủ ảnh màn hình desktop (1440px) / mobile (375px) ở cả chế độ sáng (light) và tối (dark) lưu vào `docs/screenshots/`.
2. **Kiểm tra build web-staff**: **[ĐÃ HOÀN THÀNH]**
   - `npm run build` ở `web-staff` pass 100% không lỗi (88 modules transformed).
3. **Cấu hình TypeORM Migration và DB_SYNC**: **[ĐÃ HOÀN THÀNH]**
   - Đã tạo `backend/src/data-source.ts` và bổ sung các script vào `backend/package.json`:
     - `npm run migration:generate`
     - `npm run migration:run`
     - `npm run migration:revert`
     - `npm run migration:show`
   - Đã sinh migration khởi tạo `InitialSchema` trong `backend/src/migrations/`.
   - Đã kiểm tra chạy với `DB_SYNC=false` trong `backend/.env`, toàn bộ 23 unit test và 8 kịch bản e2e của backend đều vượt qua.

## 6. Ghi chú triển khai và giới hạn đã biết

- `DB_SYNC=true` mặc định để chạy nhanh khi phát triển. Khi triển khai, đặt `DB_SYNC=false` và tạo migration.
- Số điện thoại, địa chỉ, hotline trong `/salon-info` là giá trị giả.
- Khách vãng lai dùng chung một khách "Khách vãng lai" (SĐT `0000000000`).
- Chưa có OTP. Quên mật khẩu đi qua lễ tân, không gửi SMS hay email.
- `/auth/forgot-password` là endpoint công khai, chưa có rate limit hay captcha, có thể bị spam yêu cầu tới lễ tân. Hiện chỉ giữ một yêu cầu đang chờ cho mỗi số điện thoại.
- Lỗi 409 khi đăng ký là một câu đầy đủ có lời khuyên, nên frontend hiển thị lặp nếu tự thêm liên kết. Nên đổi sang mã lỗi ngắn.
- `/salon-info` không trả về ngưỡng cọc, tỉ lệ cọc và cọc tối thiểu. Trang chính sách hiện ghi cứng "từ 2 lần" và "20%, tối thiểu 100.000 ₫", khớp với mặc định hiện tại.
- BR-14: dịch vụ khai báo `requiredEquipment` (loại thiết bị). Khi tìm giờ, số máy `IN_USE` cùng loại phải lớn hơn số lịch khác đang dùng trong khung đó; máy hỏng/bảo trì không được tính.
- FR-24: check-in/walk-in tự xếp ghế cắt (`GHE-xx`) còn trống và dùng được. Lễ tân đổi ghế trên trang Phiên phục vụ.
- FR-25: mỗi 5 phút backend gửi nhắc cho lịch BOOKED/CONFIRMED sắp diễn ra trong `REMINDER_HOURS` giờ (mặc định 24), mỗi lịch một lần (đổi giờ thì nhắc lại). Kênh SMS/Zalo là **giả lập**: ghi log `[NhacLich]`, ghi nhật ký `APPOINTMENT_REMINDER` và hiện popup trên web khách. Muốn gửi thật, gọi API nhà mạng trong `AppointmentsService.sendReminders`.
- NFR-09: service `backup` trong `docker-compose.yml` dump CSDL vào `./backups` mỗi 24 giờ và giữ 14 ngày. Sao lưu ngay: `docker compose run --rm backup sh /backup.sh /backups`. Khôi phục: `docker compose exec -T db pg_restore -U salon -d salon --clean < backups/salon-<thời điểm>.dump`.
- Một số thông báo lỗi từ class-validator vẫn bằng tiếng Anh.

## 7. Cấu trúc thư mục

```
salon-app/
├── HANDOFF.md                  tài liệu này
├── README.md                   tổng quan, kiến trúc, business rules
├── docker-compose.yml          Postgres 16
├── docs/LIEN_KET_GIAO_DIEN.md  sơ đồ và ma trận liên kết giao diện
├── docs/lien-ket-giao-dien.png sơ đồ liên kết giao diện (ảnh 5K)
├── docs/lien-ket-giao-dien.html sơ đồ trực quan tương tác
├── docs/API.md                 tham chiếu endpoint
├── docs/screenshots/           ảnh chụp các màn hình (sáng/tối, desktop/mobile)
├── shared/                     auth, api, format, theme.css dùng chung cho cả hai web
├── backend/                    NestJS: auth, accounts, appointments, sessions, billing, ...
├── web-customer/               web khách (Vite, cổng 5173)
└── web-staff/                  web nhân viên (Vite, cổng 5174, mặc định tối)
```

Các file không đưa vào gói: `node_modules/`, `dist/`, `backend/.env`. Khi nhận dự án, copy `backend/.env.example` thành `.env`.
