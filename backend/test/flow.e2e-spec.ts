import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { addMinutes, vnDateString, vnDateTime } from '../src/common/time';

/**
 * Kiểm thử luồng nghiệp vụ trung tâm trên CSDL thật (cần chạy `npm run seed -- --reset` trước):
 * Đặt lịch → chống trùng lịch → check-in → phục vụ → hóa đơn → thanh toán → hoa hồng → báo cáo.
 */
describe('Luồng nghiệp vụ trung tâm (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let desk: string;
  let owner: string;
  let stylistToken: string;
  // Ngày mai (không phải CN/T2 để cả hai ca đều làm) — tìm ngày phù hợp
  let date = vnDateString(addMinutes(new Date(), 24 * 60));
  while ([0, 1].includes(new Date(date + 'T00:00:00Z').getUTCDay())) date = vnDateString(addMinutes(vnDateTime(date, '12:00'), 24 * 60));

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = async (username: string) => (await http.post('/api/auth/login').send({ username, password: '123456' }).expect(201)).body.accessToken;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    http = request(app.getHttpServer());
    desk = await login('letan');
    owner = await login('owner');
    stylistToken = await login('ST-001');
  });

  afterAll(() => app.close());

  it('khách xem dịch vụ không cần đăng nhập, nhưng API nội bộ thì cần', async () => {
    const res = await http.get('/api/services').expect(200);
    expect(res.body.length).toBeGreaterThan(5);
    await http.get('/api/appointments').expect(401);
    await http.get('/api/reports/summary').set(auth(desk)).expect(403);
  });

  let serviceIds: Record<string, number> = {};
  let appointmentId: number;

  it('tính khung giờ khả dụng và đặt lịch không cần tài khoản', async () => {
    const services = (await http.get('/api/services').expect(200)).body;
    serviceIds = Object.fromEntries(services.map((s: any) => [s.code, s.id]));
    const stylists = (await http.get('/api/stylists').expect(200)).body;
    const minhAnh = stylists.find((s: any) => s.fullName === 'Minh Anh').id;

    const av = await http.get(`/api/appointments/availability?date=${date}&serviceIds=${serviceIds['DV-L03']},${serviceIds['DV-L02']}&stylistId=${minhAnh}`).expect(200);
    expect(av.body.depositRequired).toBe(true);
    expect(av.body.slots.find((s: any) => s.time === '09:00').available).toBe(true);
    expect(av.body.slots.find((s: any) => s.time === '16:00').available).toBe(false); // vượt ca 17:00

    const res = await http.post('/api/appointments').send({
      date, time: '09:00', serviceIds: [serviceIds['DV-L03'], serviceIds['DV-L02']], stylistId: minhAnh,
      customer: { fullName: 'Khách E2E', phone: '0911000111' },
    }).expect(201);
    appointmentId = res.body.id;
    expect(res.body.status).toBe('BOOKED');
    expect(res.body.depositStatus).toBe('REQUIRED');
    expect(res.body.items[0].assistant).not.toBeNull();
  });

  it('BR-01: không cho đặt trùng thợ chính, kể cả khi hai yêu cầu gửi cùng lúc', async () => {
    const stylists = (await http.get('/api/stylists').expect(200)).body;
    const minhAnh = stylists.find((s: any) => s.fullName === 'Minh Anh').id;
    const r = await http.post('/api/appointments').send({ date, time: '10:00', serviceIds: [serviceIds['DV-L01']], stylistId: minhAnh, customer: { fullName: 'A', phone: '0911000222' } });
    expect(r.status).toBe(422);
    expect(r.body.rule).toBe('BR-01');

    const body = (phone: string) => ({ date, time: '14:00', serviceIds: [serviceIds['DV-L01']], stylistId: minhAnh, customer: { fullName: 'Song song', phone } });
    const [a, b] = await Promise.all([
      http.post('/api/appointments').send(body('0911000333')),
      http.post('/api/appointments').send(body('0911000444')),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 422]);
  });

  let sessionId: number;

  it('lễ tân xác nhận, check-in tạo phiên phục vụ; stylist bắt đầu và đề xuất thêm dịch vụ', async () => {
    // Lịch cần cọc: chưa thu cọc thì không xác nhận / check-in được
    expect((await http.post(`/api/appointments/${appointmentId}/confirm`).set(auth(desk))).status).toBe(422);
    await http.post(`/api/appointments/${appointmentId}/deposit-paid`).set(auth(desk)).expect(201);
    await http.post(`/api/appointments/${appointmentId}/confirm`).set(auth(desk)).expect(201);
    const svc = app.get(AppointmentsService);
    const realNow = svc.now.bind(svc);
    const start = vnDateTime(date, '09:00');
    svc.now = () => addMinutes(start, -(24 * 60)); // quá sớm: ngoài cửa sổ check-in
    expect((await http.post(`/api/appointments/${appointmentId}/check-in`).set(auth(desk))).status).toBe(422);
    svc.now = () => start;
    const s = await http.post(`/api/appointments/${appointmentId}/check-in`).set(auth(desk)).expect(201);
    svc.now = realNow;
    sessionId = s.body.id;
    expect(s.body.items).toHaveLength(2);
    await http.post(`/api/sessions/${sessionId}/start`).set(auth(stylistToken)).expect(201);
    const added = await http.post(`/api/sessions/${sessionId}/items`).set(auth(stylistToken)).send({ serviceId: serviceIds['DV-L08'] }).expect(201);
    const proposed = added.body.items.find((i: any) => i.status === 'PROPOSED');
    expect(proposed).toBeTruthy();
    // BR-12: chưa xác nhận thì không hoàn tất được
    const blocked = await http.post(`/api/sessions/${sessionId}/complete`).set(auth(stylistToken));
    expect(blocked.body.rule).toBe('BR-12');
    await http.post(`/api/sessions/items/${proposed.id}/confirm`).set(auth(desk)).send({ confirmationNote: 'Khách đồng ý 300.000đ tại quầy' }).expect(201);
    await http.post(`/api/sessions/${sessionId}/complete`).set(auth(stylistToken)).expect(201);
  });

  it('lập hóa đơn lưu giá thực tế; đổi giá dịch vụ sau đó không làm đổi hóa đơn (BR-07)', async () => {
    const inv = await http.post(`/api/sessions/${sessionId}/invoice`).set(auth(desk)).expect(201);
    expect(inv.body.total).toBe(500000 + 50000 + 300000);
    await http.patch(`/api/services/${serviceIds['DV-L03']}`).set(auth(owner)).send({ basePrice: 600000 }).expect(200);
    const again = await http.get(`/api/invoices/${inv.body.id}`).set(auth(desk)).expect(200);
    expect(again.body.items.find((i: any) => i.description === 'Nhuộm tóc').unitPrice).toBe(500000);
    await http.patch(`/api/services/${serviceIds['DV-L03']}`).set(auth(owner)).send({ basePrice: 500000 }).expect(200);

    const products = (await http.get('/api/inventory/products?kind=RETAIL').set(auth(desk)).expect(200)).body;
    const serum = products.find((p: any) => p.sku === 'SP-001');
    const withProduct = await http.post(`/api/invoices/${inv.body.id}/products`).set(auth(desk)).send({ productId: serum.id, quantity: 1 }).expect(201);
    // Cọc đã thu được trừ vào hóa đơn: chỉ còn phải trả phần dư; trả dư bị chặn
    const appt0 = (await http.get(`/api/appointments/${appointmentId}`).set(auth(desk)).expect(200)).body;
    expect(appt0.depositAmount).toBeGreaterThan(0);
    const total = withProduct.body.total - appt0.depositAmount;
    const over = await http.post(`/api/invoices/${inv.body.id}/payments`).set(auth(desk)).send({ method: 'CASH', amount: total + 1 });
    expect(over.status).toBe(422);

    // Chuyển khoản chờ xác nhận chưa làm hóa đơn PAID
    const pending = await http.post(`/api/invoices/${inv.body.id}/payments`).set(auth(desk)).send({ method: 'TRANSFER', amount: total, reference: 'FT-E2E-1' }).expect(201);
    expect(pending.body.invoice.status).toBe('PENDING');
    // Gửi trùng mã giao dịch không ghi nhận lần 2 (BR-15)
    const dup = await http.post(`/api/invoices/${inv.body.id}/payments`).set(auth(desk)).send({ method: 'TRANSFER', amount: total, reference: 'FT-E2E-1' }).expect(201);
    expect(dup.body.duplicate).toBe(true);
    const done = await http.post(`/api/payments/${pending.body.payment.id}/resolve`).set(auth(desk)).send({ success: true }).expect(201);
    expect(done.body.invoice.status).toBe('PAID');

    const after = (await http.get('/api/inventory/products?kind=RETAIL').set(auth(desk))).body.find((p: any) => p.sku === 'SP-001');
    expect(after.stock).toBe(serum.stock - 1);
    const appt = await http.get(`/api/appointments/${appointmentId}`).set(auth(desk)).expect(200);
    expect(appt.body.status).toBe('COMPLETED');
  });

  it('hoa hồng được chốt và stylist chỉ xem được của mình', async () => {
    const month = date.slice(0, 7);
    const mine = await http.get(`/api/commissions/mine?month=${month}`).set(auth(stylistToken)).expect(200);
    expect(mine.body.lines.length).toBeGreaterThanOrEqual(3);
    expect(mine.body.lines.find((l: any) => l.serviceName === 'Nhuộm tóc').amount).toBe(35000); // 500k × 10% × 70%
    await http.get('/api/reports/summary').set(auth(stylistToken)).expect(403);
    const rep = await http.get(`/api/reports/summary?from=${vnDateString(new Date())}&to=${date}`).set(auth(owner)).expect(200);
    expect(rep.body.revenue).toBeGreaterThan(0);
  });

  it('BR-18 + BR-20: khóa hủy sát giờ với khách, no-show giải phóng thợ và tăng noShowCount', async () => {
    const cust = (await http.post('/api/auth/login').send({ username: '0901234567', password: '123456' }).expect(201)).body.accessToken;
    const svc = app.get(AppointmentsService);
    const realNow = svc.now.bind(svc);
    const booked = await http.post('/api/appointments').set(auth(cust)).send({ date, time: '15:00', serviceIds: [serviceIds['DV-L01']] }).expect(201);
    const start = vnDateTime(date, '15:00');

    svc.now = () => addMinutes(start, -60); // còn 1 tiếng
    const locked = await http.post(`/api/appointments/${booked.body.id}/cancel`).set(auth(cust)).send({});
    expect(locked.body.rule).toBe('BR-18');

    svc.now = () => addMinutes(start, 10); // trong thời gian ân hạn
    expect((await http.post(`/api/appointments/${booked.body.id}/no-show`).set(auth(desk))).body.rule).toBe('BR-20');

    svc.now = () => addMinutes(start, 16);
    const ns = await http.post(`/api/appointments/${booked.body.id}/no-show`).set(auth(desk)).expect(201);
    expect(ns.body.appointment.status).toBe('NO_SHOW');
    expect(ns.body.customerNoShowCount).toBeGreaterThanOrEqual(1);
    svc.now = realNow;

    // Thợ được giải phóng: khung 15:00 lại khả dụng cho lead đó
    const lead = booked.body.items[0].leadStylist.id;
    const av = await http.get(`/api/appointments/availability?date=${date}&serviceIds=${serviceIds['DV-L01']}&stylistId=${lead}`).expect(200);
    expect(av.body.slots.find((s: any) => s.time === '15:00').available).toBe(true);
  });

  it('tài khoản: chủ tạo tài khoản nhân viên, bắt buộc đổi mật khẩu, khóa/mở; khách quên mật khẩu', async () => {
    const emp = await http.post('/api/employees').set(auth(owner)).send({ fullName: 'Lễ tân Mới', position: 'RECEPTIONIST', phone: '0933000111' }).expect(201);
    const created = await http.post('/api/accounts').set(auth(owner)).send({ employeeId: emp.body.id }).expect(201);
    expect(created.body.temporaryPassword).toMatch(/^[a-z]{4}\d{4}$/);
    await http.post('/api/accounts').set(auth(owner)).send({ employeeId: emp.body.id }).expect(409);
    await http.post('/api/accounts').set(auth(desk)).send({ employeeId: emp.body.id }).expect(403);

    const first = await http.post('/api/auth/login').send({ username: created.body.account.username, password: created.body.temporaryPassword }).expect(201);
    expect(first.body.user.mustChangePassword).toBe(true);
    expect(first.body.user.role).toBe('RECEPTIONIST');
    const weak = await http.post('/api/auth/change-password').set(auth(first.body.accessToken)).send({ oldPassword: created.body.temporaryPassword, newPassword: 'abcdef' });
    expect(weak.status).toBe(400);
    const changed = await http.post('/api/auth/change-password').set(auth(first.body.accessToken)).send({ oldPassword: created.body.temporaryPassword, newPassword: 'matkhau1' }).expect(201);
    expect(changed.body.user.mustChangePassword).toBe(false);

    await http.patch(`/api/accounts/${created.body.account.id}`).set(auth(owner)).send({ active: false }).expect(200);
    const locked = await http.post('/api/auth/login').send({ username: created.body.account.username, password: 'matkhau1' });
    expect(locked.status).toBe(401);
    expect(locked.body.message).toMatch(/khóa/);
    await http.patch(`/api/accounts/${created.body.account.id}`).set(auth(owner)).send({ active: true }).expect(200);

    const list = await http.get('/api/accounts').set(auth(owner)).expect(200);
    expect(list.body.find((r: any) => r.employee.id === emp.body.id).account.active).toBe(true);

    // Khách đăng ký, quên mật khẩu -> lễ tân xử lý yêu cầu, cấp mật khẩu tạm
    await http.post('/api/auth/register').send({ fullName: 'Khách Quên', phone: '0944000111', password: 'abc123' }).expect(201);
    await http.post('/api/auth/register').send({ fullName: 'Khách Quên', phone: '0944000111', password: 'abc123' }).expect(409);
    const fp = await http.post('/api/auth/forgot-password').send({ phone: '0944000111', fullName: 'Khách Quên' }).expect(201);
    expect(fp.body.ok).toBe(true);
    const reqs = await http.get('/api/password-requests?status=PENDING').set(auth(desk)).expect(200);
    const r = reqs.body.find((x: any) => x.phone === '0944000111');
    expect(r.account).toBeTruthy();
    const handled = await http.post(`/api/password-requests/${r.id}`).set(auth(desk)).send({ status: 'DONE' }).expect(201);
    const relog = await http.post('/api/auth/login').send({ username: '0944000111', password: handled.body.temporaryPassword }).expect(201);
    expect(relog.body.user.mustChangePassword).toBe(true);
    // Lễ tân không cấp lại mật khẩu cho tài khoản nhân viên
    await http.post(`/api/accounts/${created.body.account.id}/reset-password`).set(auth(desk)).send({}).expect(403);
  });

  it('ngày nghỉ, số lịch chưa đến, số điện thoại ẩn danh, mật khẩu tạm và hoàn cọc khi hủy', async () => {
    const later = vnDateString(addMinutes(vnDateTime(date, '12:00'), 7 * 24 * 60)); // cùng thứ => cả hai ca đều làm
    const book = (time: string, phone: string, code = 'DV-L01') =>
      http.post('/api/appointments').send({ date: later, time, serviceIds: [serviceIds[code]], customer: { fullName: 'Khách Luật', phone } });

    // Ngày nghỉ của salon chặn đặt lịch
    const closed = await http.post('/api/closed-days').set(auth(owner)).send({ date: later, reason: 'Nghỉ lễ' }).expect(201);
    expect((await book('09:00', '0955000001')).body.rule).toBe('CLOSED');
    await http.delete(`/api/closed-days/${closed.body.id}`).set(auth(owner)).expect(200);

    // Số điện thoại ẩn danh bị từ chối
    expect((await book('09:00', '0000000000')).status).toBeGreaterThanOrEqual(400);

    // Mỗi khách chỉ giữ tối đa 3 lịch chưa đến
    for (const t of ['08:30', '09:30', '10:30']) expect((await book(t, '0955000002')).status).toBe(201);
    expect((await book('11:30', '0955000002')).body.rule).toBe('BR-OPEN');

    // Hủy lịch đã cọc: hoàn cọc khi lễ tân xác nhận hoàn
    const dep = await book('13:00', '0955000003', 'DV-L03');
    expect(dep.body.depositStatus).toBe('REQUIRED');
    await http.post(`/api/appointments/${dep.body.id}/deposit-paid`).set(auth(desk)).expect(201);
    await http.post(`/api/appointments/${dep.body.id}/cancel`).set(auth(desk)).send({ reason: 'Khách báo bận', refundDeposit: true }).expect(201);
    expect((await http.get(`/api/appointments/${dep.body.id}`).set(auth(desk)).expect(200)).body.depositStatus).toBe('REFUNDED');

    // Mật khẩu tạm: chưa đổi thì chỉ được gọi API đổi mật khẩu
    const emp = await http.post('/api/employees').set(auth(owner)).send({ fullName: 'Lễ tân Tạm', position: 'RECEPTIONIST', phone: '0933000222' }).expect(201);
    const acc = await http.post('/api/accounts').set(auth(owner)).send({ employeeId: emp.body.id }).expect(201);
    const tmp = await http.post('/api/auth/login').send({ username: acc.body.account.username, password: acc.body.temporaryPassword }).expect(201);
    await http.get('/api/appointments').set(auth(tmp.body.accessToken)).expect(403);
  });
});
