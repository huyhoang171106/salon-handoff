# API — Phần mềm quản lý salon tóc

Base URL: `http://localhost:3000/api` · Swagger: `http://localhost:3000/api/docs`
Xác thực: header `Authorization: Bearer <accessToken>`. Tiền tệ: số nguyên VND. Giờ: Việt Nam (UTC+7); ngày `YYYY-MM-DD`, giờ `HH:mm`; timestamp trả về dạng ISO UTC.
Lỗi nghiệp vụ trả **422** `{ statusCode, rule: "BR-01", message: "..." }` — giao diện nên hiển thị `message`. 401 = chưa đăng nhập, 403 = sai vai trò, 400 = dữ liệu không hợp lệ (`message` là mảng chuỗi).

Tài khoản mẫu (mật khẩu `123456`): `owner` (OWNER), `letan` (RECEPTIONIST), `ST-001..ST-004` (STYLIST), `TP-001`, `TP-002` (ASSISTANT), khách thành viên `0901234567` (CUSTOMER).

## Xác thực & tài khoản
Mật khẩu: tối thiểu 6 ký tự, có cả chữ và số. `user` trả về: `{accountId,role,employeeId,customerId,name,username,mustChangePassword}` — nếu `mustChangePassword` = true, giao diện phải chuyển ngay tới trang đổi mật khẩu.

| Method | Path | Ai | Ghi chú |
|---|---|---|---|
| POST | /auth/login | công khai | `{username,password}` → `{accessToken,user}`; 401 "Sai tài khoản hoặc mật khẩu" / "Tài khoản đã bị khóa…" |
| POST | /auth/register | công khai | `{fullName, phone, password, birthDate?}` → như login; 409 nếu SĐT đã có tài khoản |
| POST | /auth/forgot-password | công khai | `{phone, fullName, note?}` → `{ok, message}` (luôn trả giống nhau) — tạo yêu cầu cho lễ tân |
| GET | /auth/me | đã đăng nhập | user (đọc từ CSDL) |
| POST | /auth/change-password | đã đăng nhập | `{oldPassword,newPassword}` → `{accessToken,user}` mới (nhớ lưu token mới) |
| GET | /accounts | OWNER | `[{employee:{id,code,fullName,position,level,status,phone}, account:{id,username,role,active,mustChangePassword,lastLoginAt,createdAt}|null}]` |
| POST | /accounts | OWNER | `{employeeId, username?, password?}` → `{account:{id,username,role}, temporaryPassword}` (bỏ trống password = mật khẩu tạm) |
| PATCH | /accounts/:id | OWNER | `{active}` khóa/mở khóa |
| POST | /accounts/:id/reset-password | OWNER (mọi tài khoản), RECEPTIONIST (chỉ khách) | `{newPassword?}` → `{username, temporaryPassword}` |
| GET | /password-requests?status=PENDING | chủ/lễ tân | `[{id,phone,fullName,note,status,handledBy,handledAt,createdAt,account:{id,username,active,customerName}|null}]` |
| POST | /password-requests/:id | chủ/lễ tân | `{status:'DONE'|'REJECTED'}` → DONE trả `{request, username, temporaryPassword}` |
| GET/PATCH | /employees/me | mọi nhân viên | hồ sơ của mình (`username`, `lastLoginAt`); PATCH `{phone?, bio?}` |

`GET /customers/:id` (nhân viên) có thêm `account:{id,username,active,lastLoginAt}|null` để lễ tân cấp lại mật khẩu cho khách.

## Danh mục (công khai)
| GET | /services | `?all=true` (chủ) để thấy cả dịch vụ ngừng. Service: `{id,code,name,category,audience:'LONG'|'SHORT'|'ALL',basePrice,priceFrom,durationMinutes,description,status,needsAssistant,assistantMinutes,commissionRate,commissionMode,leadShare,assistantFixedFee,depositRequired,requiredEquipment}` — `requiredEquipment`: loại thiết bị bắt buộc (BR-14) hoặc null |
|---|---|---|
| GET | /stylists | `[{id,fullName,level,bio,skills:[{id,name,category}]}]` |
| GET | /salon-info | `{name,openTime,closeTime,hotline,address,cancelLockHours,graceMinutes,depositRate,depositMinAmount,depositHoldHours,checkInEarlyMinutes}` |
| POST/PATCH | /services, /services/:id | OWNER — đổi giá được ghi audit, hóa đơn cũ giữ giá |
| GET/PUT | /services/:id/materials | lễ tân/chủ xem, OWNER ghi `{materials:[{productId,quantity}]}`: định mức vật tư, trừ kho khi thanh toán, cảnh báo thiếu khi nhận khách |
| GET | /closed-days | công khai: ngày salon nghỉ (chặn đặt lịch, mã `CLOSED`) |
| POST/DELETE | /closed-days(/:id) | OWNER `{date,reason}`; thêm ngày nghỉ ghi audit số lịch bị ảnh hưởng |

## Lịch hẹn
| Method | Path | Ai | Ghi chú |
|---|---|---|---|
| GET | /appointments/availability?date&serviceIds=1,2&stylistId?&excludeAppointmentId? | công khai | `{date,totalDuration,totalPrice,depositRequired,slots:[{time,available,reason?,rule?}]}` |
| POST | /appointments | công khai / khách / lễ tân | `{date,time,serviceIds,stylistId?,note?,customer?:{fullName,phone}}` (customer bắt buộc khi không phải khách đăng nhập). Online → `BOOKED`, lễ tân → `CONFIRMED` |
| GET | /appointments?date= | nhân viên | lịch trong ngày (tự đánh dấu `LATE`) |
| GET | /appointments/mine | CUSTOMER | |
| GET | /appointments/my-day?date= | STYLIST/ASSISTANT | |
| GET | /appointments/:id | | |
| POST | /appointments/:id/confirm | lễ tân/chủ | |
| POST | /appointments/:id/deposit-paid | lễ tân/chủ | lịch cần cọc phải có bước này trước `confirm` và `check-in`; lịch do lễ tân tạo tự xác nhận khi nhận cọc. Quá `DEPOSIT_HOLD_HOURS` chưa cọc → tự hủy |
| POST | /appointments/:id/overrun | lễ tân/chủ/stylist | `{minutes,apply?}`: ca đang phục vụ kéo dài; `apply:false` chỉ xem lịch kế tiếp bị ảnh hưởng |
| POST | /appointments/:id/cancel | khách (≥2h) / lễ tân (bắt buộc `reason`) | `{reason?,refundDeposit?}` — BR-18. Lịch đã cọc: `refundDeposit:true` → `REFUNDED`, mặc định giữ cọc (`FORFEITED`). Cho phép hủy cả khi đang phục vụ |
| POST | /appointments/:id/reschedule | khách (≥2h) / lễ tân | `{date,time,stylistId?,reason?}` |
| POST | /appointments/:id/late | lễ tân | |
| POST | /appointments/:id/no-show | lễ tân | sau 15' ân hạn → `{appointment,releasedEmployeeIds,customerNoShowCount,depositRequiredNextTime}` |
| POST | /appointments/:id/check-in | lễ tân | body `{stylistId?}` để đổi stylist khi khách tới; trả về **ServiceSession** |
| GET | /appointments/:id/stylist-options | lễ tân | stylist đủ chuyên môn + có nhận được đúng giờ hẹn không |
| GET/POST | /walk-in-queue | lễ tân/chủ | hàng chờ walk-in: `POST {name,phone?,serviceIds,stylistId?,note?}` thêm vào hàng |
| POST | /walk-in-queue/:id/call, /walk-in-queue/:id/cancel | lễ tân/chủ | gọi khách vào / bỏ khỏi hàng |
| POST | /walk-ins | lễ tân | `{serviceIds,stylistId?,customer?:{fullName,phone},walkInName?}` → ServiceSession; 422 kèm giờ trống gần nhất nếu không phục vụ ngay được |

Appointment: `{id,code,customer:{id,code,fullName,phone,noShowCount,isMember},startAt,endAt,status:'BOOKED'|'CONFIRMED'|'LATE'|'CHECKED_IN'|'IN_SERVICE'|'COMPLETED'|'CANCELLED'|'NO_SHOW',source:'ONLINE_GUEST'|'ONLINE_MEMBER'|'RECEPTION'|'WALK_IN',depositStatus:'NOT_REQUIRED'|'REQUIRED'|'PAID'|'FORFEITED'|'REFUNDED',depositAmount,note,statusReason,items:[{id,service,leadStylist:{id,fullName,...},assistant|null,startAt,endAt,assistantStartAt,assistantEndAt,quotedPrice}]}`

## Phiên phục vụ
| GET | /sessions | lễ tân/chủ: phiên đang mở |
|---|---|---|
| GET | /sessions/chairs/free | lễ tân/chủ: mã ghế cắt (`GHE-xx`) đang trống và dùng được |
| PATCH | /sessions/:id/chair | lễ tân/chủ: `{chair: string|null}` — ghế đã có khách hoặc hỏng/bảo trì trả 422 BR-14 |
| GET | /sessions/mine | stylist/thợ phụ |
| GET | /sessions/:id | |
| POST | /sessions/:id/start | |
| POST | /sessions/:id/items | `{serviceId,agreedPrice?,leadId?,assistantIds?,confirmationNote?}` — stylist tạo `PROPOSED`; lễ tân tạo `CONFIRMED` (khi đang phục vụ phải có `confirmationNote`) |
| POST | /sessions/items/:itemId/confirm | lễ tân: `{confirmationNote,agreedPrice?}` |
| POST | /sessions/items/:itemId/remove | lễ tân |
| PATCH | /sessions/items/:itemId/assignments | lễ tân: `{assignments:[{employeeId,role:'LEAD_STYLIST'|'ASSISTANT',shareOverride?,fixedFeeOverride?}]}` |
| POST | /sessions/:id/complete | → `AWAITING_PAYMENT` |
| POST | /sessions/:id/cancel | lễ tân/chủ: `{reason}` — hủy phiên tiếp nhận nhầm, lịch liên quan chuyển Đã hủy |

ServiceSession: `{id,code,appointment|null,customer|null,walkInName,status:'OPEN'|'IN_SERVICE'|'AWAITING_PAYMENT'|'COMPLETED'|'CANCELLED',startedAt,finishedAt,items:[{id,service,agreedPrice,status:'PROPOSED'|'CONFIRMED'|'DONE'|'REMOVED',confirmationNote,assignments:[{id,employee,role,shareOverride,fixedFeeOverride}]}]}`

## Hóa đơn & thanh toán (lễ tân/chủ)
| POST | /sessions/:sessionId/invoice | lập hóa đơn (tự áp khuyến mãi tốt nhất); trừ cọc đã thu bằng một payment `DEPOSIT` |
|---|---|---|
| GET | /invoices?date&status | |
| GET | /invoices/:id | |
| POST | /invoices/:id/products | `{productId,quantity}` |
| POST | /invoices/:id/items/:itemId/remove | chỉ dòng sản phẩm |
| POST | /invoices/:id/adjustments | `{description,amount}`: dòng điều chỉnh (âm = giảm giá, dương = phụ thu), có audit |
| POST | /invoices/:id/submit | DRAFT → PENDING (hóa đơn 0đ chuyển PAID luôn) |
| POST | /invoices/:id/cancel | `{reason,refund?}`: hóa đơn đã thu tiền phải `refund:true` (xác nhận đã hoàn tiền) |
| POST | /invoices/:id/payments | `{method:'CASH'|'TRANSFER',amount,reference?,confirmed?}` (amount không vượt phần còn phải thu) → `{invoice,payment,duplicate}`; tiền mặt xác nhận ngay; chuyển khoản `confirmed:false` → chờ |
| POST | /payments/:id/resolve | `{success:boolean}` |
| GET | /commissions/mine?month=YYYY-MM | stylist/thợ phụ: `{total,lines:[{earnedAt,invoiceCode,serviceName,role,baseAmount,formula,amount}]}` |
| GET | /commissions/:employeeId?month= | OWNER |
| GET/POST/PATCH | /promotions | `{name,type:'PERCENT'|'AMOUNT',value,memberOnly,firstVisitOnly,serviceCategory,startDate,endDate,active}` |

Invoice: `{id,code,status:'DRAFT'|'PENDING'|'PAID'|'CANCELLED',subtotal,discountTotal,total,promotionName,paidAt,customer,session,items:[{id,type:'SERVICE'|'PRODUCT'|'ADJUSTMENT',refId,description,unitPrice,quantity,discount}],payments:[{id,method:'CASH'|'TRANSFER'|'DEPOSIT'|'REFUND',amount,status,reference}]}`

## Khách hàng
| GET | /customers?q= | nhân viên |
|---|---|---|
| GET | /customers/:id | `{customer,appointments,invoices:[{id,code,paidAt,total,items,stylists}]}` |
| POST/PATCH | /customers, /customers/:id | lễ tân/chủ (stylist chỉ sửa `hairNotes`); đổi SĐT đồng bộ sang tài khoản khách |
| POST | /customers/:id/merge | OWNER `{targetId}`: gộp hồ sơ này vào `targetId` rồi xóa hồ sơ này |
| POST | /customers/:id/anonymize | OWNER: ẩn danh (giữ hóa đơn) |
| DELETE | /customers/:id | OWNER: chỉ khi chưa có lịch/hóa đơn |
| POST | /customers/:id/account | lễ tân/chủ: tạo tài khoản cho khách |
| PATCH | /sessions/:id/customer | lễ tân/chủ: gắn hoặc tạo hồ sơ khách cho phiên walk-in trước khi lập hóa đơn |
| POST | /sessions/:id/reopen | lễ tân/chủ: mở lại phiên để sửa hóa đơn nhập sai |
| GET/PATCH | /customers/me | CUSTOMER (không có hairNotes) |

## Nhân viên & ca
| GET | /employees | chủ/lễ tân |
|---|---|---|
| POST/PATCH | /employees(/:id) | OWNER: `{fullName,phone,position,level,bio,status,publicProfile,skillIds,password?}` |
| GET | /shifts?from&to&employeeId? | nhân viên |
| GET | /shifts/mine?from&to | |
| POST | /shifts, /shifts/bulk | OWNER: bulk `{employeeIds,from,to,weekdays:[0..6],startTime,endTime}` |
| PATCH/DELETE | /shifts/:id | OWNER (`status:'ABSENT'` = nghỉ đột xuất, tự xếp lại lịch khách) |
| POST | /shifts/mine/leave | STYLIST/ASSISTANT `{date,from,to,reason?}`: gửi **yêu cầu** nghỉ (`LeaveRequest`, chờ duyệt) |
| GET | /leave-requests/mine | STYLIST/ASSISTANT |
| GET | /leave-requests?status= | OWNER |
| POST | /leave-requests/:id/approve, /reject | OWNER `{note?}`: duyệt → áp dụng nghỉ vào ca, lịch khách bị ảnh hưởng được đổi thợ cùng giờ → dời giờ trống gần nhất (ưu tiên muộn hơn) → báo lễ tân (`stylistChangeNote`); trả `{ok,rearranged}` |

## Kho
| GET | /inventory/products?kind=RETAIL|MATERIAL |
|---|---|
| GET | /inventory/low-stock |
| POST/PATCH | /inventory/products(/:id) — OWNER |
| POST | /inventory/receipts `{lines:[{productId,quantity,unitCost}],note?}` |
| POST | /inventory/movements `{productId,type:'USAGE'|'ADJUSTMENT'|'DAMAGE',quantity,note}` |
| GET | /inventory/transactions?productId |

## Báo cáo
| GET | /reports/summary?from&to | OWNER: `{revenue,invoices,discounts,expenses,profitEstimate,appointments:{total,walkIn,booked,completed,cancelled,noShow,pending},byDay,byService,byProduct,byEmployee,busyHours,lowStock,complaints,equipmentIssues}` |
|---|---|---|
| GET | /reports/cancellations?from&to | OWNER |
| GET | /reports/today | chủ/lễ tân |

## Vận hành
| GET/POST/PATCH | /complaints(/:id), GET /complaints/mine | khiếu nại; PATCH `{status,assigneeId,note,resolution}` |
|---|---|---|
| GET/POST/PATCH | /equipment(/:id), POST /equipment/:id/maintenance | `kind`: GHE, GUONG, GIUONG, SAY, HAP, UON, XE, KHAC |
| GET/POST/PATCH | /expenses(/:id) | |
| GET/POST | /consultations, GET /consultations/mine | tư vấn; `?customerId=`; `/mine` cho khách |
| GET | /notifications?since=ISO | popup: lịch mới / hủy / xác nhận, nhắc lịch (khách, FR-25), trạng thái giao dịch. Theo vai trò; trả `{now, items[]}`, lần sau gửi lại `now` |
| GET | /audit-logs | OWNER |
