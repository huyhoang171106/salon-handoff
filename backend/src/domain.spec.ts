import { CommissionCalculator } from './billing/commission.calculator';
import { PromotionEngine } from './billing/promotion.engine';
import { AvailabilityEngine, EngineEmployee } from './appointments/availability.engine';
import { Appointment } from './appointments/appointment.entities';
import { AppointmentStatus, AssignmentRole, CommissionMode, PromotionType, ShiftStatus } from './common/enums';
import { vnDateTime } from './common/time';
import { WorkShift } from './employees/employee.entities';

const L = AssignmentRole.LEAD_STYLIST;
const A = AssignmentRole.ASSISTANT;

describe('CommissionCalculator (mục 3.8.4, BR-19)', () => {
  const cfg = { serviceName: 'Nhuộm', price: 800000, rate: 0.1, mode: CommissionMode.PERCENT_SPLIT, leadShare: 0.7, assistantFixedFee: 0 };

  it('ví dụ trong tài liệu: 800k, quỹ 10%, thợ chính 70% = 56k, thợ phụ 30% = 24k', () => {
    const r = CommissionCalculator.compute(cfg, [{ employeeId: 1, role: L }, { employeeId: 2, role: A }]);
    expect(r.map((x) => x.amount)).toEqual([56000, 24000]);
  });

  it('2 thợ phụ chia đều 30%: mỗi người 12k', () => {
    const r = CommissionCalculator.compute(cfg, [{ employeeId: 1, role: L }, { employeeId: 2, role: A }, { employeeId: 3, role: A }]);
    expect(r.map((x) => x.amount)).toEqual([56000, 12000, 12000]);
  });

  it('không có thợ phụ: thợ chính nhận 100% quỹ', () => {
    expect(CommissionCalculator.compute({ ...cfg, price: 500000 }, [{ employeeId: 1, role: L }])[0].amount).toBe(50000);
  });

  it('tổng tỷ lệ ghi đè khác 100% bị từ chối (BR-19)', () => {
    expect(() =>
      CommissionCalculator.compute(cfg, [{ employeeId: 1, role: L, shareOverride: 0.6 }, { employeeId: 2, role: A, shareOverride: 0.3 }]),
    ).toThrow(/100%/);
  });

  it('định mức cố định: thợ phụ 30k, thợ chính nhận phần quỹ còn lại', () => {
    const r = CommissionCalculator.compute({ ...cfg, price: 500000, mode: CommissionMode.FIXED_TASK, assistantFixedFee: 30000 }, [{ employeeId: 1, role: L }, { employeeId: 2, role: A }]);
    expect(r.find((x) => x.role === L)!.amount).toBe(20000);
    expect(r.find((x) => x.role === A)!.amount).toBe(30000);
  });

  it('tổng luôn bằng quỹ khi chia lẻ', () => {
    const r = CommissionCalculator.compute({ ...cfg, price: 333333 }, [{ employeeId: 1, role: L }, { employeeId: 2, role: A }, { employeeId: 3, role: A }]);
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(Math.round(333333 * 0.1));
  });

  it('thiếu thợ chính bị từ chối', () => {
    expect(() => CommissionCalculator.compute(cfg, [{ employeeId: 2, role: A }])).toThrow();
  });
});

describe('PromotionEngine (mục 3.5)', () => {
  const promo = (o: any) => ({ id: 1, name: 'P', type: PromotionType.PERCENT, value: 10, memberOnly: true, firstVisitOnly: false, serviceCategory: null, isValidOn: () => true, ...o });
  const lines = [{ key: 0, category: 'MÀU', amount: 550000 }, { key: 1, category: 'GỘI SẤY', amount: 50000 }];

  it('thành viên được giảm 10% lần đầu', () => {
    const r = PromotionEngine.best({ isMember: true, firstVisitPromoUsed: false }, [promo({ firstVisitOnly: true })], lines, '2026-10-22');
    expect(r.total).toBe(60000);
  });

  it('khách không phải thành viên không được giảm', () => {
    expect(PromotionEngine.best({ isMember: false, firstVisitPromoUsed: false }, [promo({})], lines, '2026-10-22').total).toBe(0);
  });

  it('đã dùng ưu đãi lần đầu thì không áp dụng lại', () => {
    expect(PromotionEngine.best({ isMember: true, firstVisitPromoUsed: true }, [promo({ firstVisitOnly: true })], lines, '2026-10-22').total).toBe(0);
  });

  it('chọn chương trình có lợi nhất và chỉ áp cho nhóm dịch vụ phù hợp', () => {
    const r = PromotionEngine.best({ isMember: true, firstVisitPromoUsed: true }, [promo({ id: 1, value: 5 }), promo({ id: 2, name: 'Màu', value: 20, serviceCategory: 'MÀU' })], lines, '2026-10-22');
    expect(r.promotion!.id).toBe(2);
    expect(r.discounts.get(0)).toBe(110000);
    expect(r.discounts.get(1)).toBeUndefined();
  });
});

describe('AvailabilityEngine (BR-01..05, BR-14, BR-17)', () => {
  const date = '2026-10-23';
  const now = vnDateTime('2026-10-22', '12:00');
  const cut = { id: 1, name: 'Cắt', durationMinutes: 30, needsAssistant: false, assistantMinutes: 0, bookable: true };
  const color = { id: 2, name: 'Nhuộm', durationMinutes: 120, needsAssistant: true, assistantMinutes: 40, bookable: true };
  const stylist = (o: Partial<EngineEmployee> = {}): EngineEmployee => ({ id: 10, name: 'Minh Anh', active: true, skillIds: [1, 2], shifts: [{ start: 8 * 60, end: 17 * 60 }], busy: [], ...o });
  const assistant = (o: Partial<EngineEmployee> = {}): EngineEmployee => ({ id: 20, name: 'Bảo Ngọc', active: true, skillIds: [], shifts: [{ start: 8 * 60, end: 17 * 60 }], busy: [], ...o });
  const engine = (o: any = {}) => new AvailabilityEngine({ date, services: [cut], stylists: [stylist()], assistants: [assistant()], openTime: '08:00', closeTime: '20:00', slotMinutes: 30, now, ...o });

  it('khung giờ trong ca và trống thì khả dụng', () => {
    expect(engine().check('09:00').available).toBe(true);
  });

  it('BR-03: không cho đặt vượt giờ đóng cửa', () => {
    expect(engine({ services: [color], stylists: [stylist({ shifts: [{ start: 8 * 60, end: 20 * 60 }] })] }).check('19:00').rule).toBe('BR-03');
  });

  it('BR-02: stylist ngoài ca', () => {
    expect(engine().check('17:00').rule).toBe('BR-02');
  });

  it('BR-01: trùng lịch thợ chính', () => {
    const busy = [{ start: vnDateTime(date, '09:15'), end: vnDateTime(date, '10:00') }];
    expect(engine({ stylists: [stylist({ busy })] }).check('09:00').rule).toBe('BR-01');
  });

  it('BR-04: stylist không có chuyên môn', () => {
    expect(engine({ services: [color], stylists: [stylist({ skillIds: [1] })] }).check('09:00').rule).toBe('BR-04');
  });

  it('BR-05: dịch vụ ngừng cung cấp', () => {
    expect(engine({ services: [{ ...cut, bookable: false }] }).check('09:00').rule).toBe('BR-05');
  });

  it('BR-17: hết thợ phụ trong giai đoạn cần hỗ trợ', () => {
    const busy = [{ start: vnDateTime(date, '09:00'), end: vnDateTime(date, '09:30') }];
    expect(engine({ services: [color], assistants: [assistant({ busy })] }).check('09:00').rule).toBe('BR-17');
    // thợ phụ chỉ bận sau 40 phút đầu -> vẫn đặt được
    const later = [{ start: vnDateTime(date, '09:45'), end: vnDateTime(date, '10:30') }];
    expect(engine({ services: [color], assistants: [assistant({ busy: later })] }).check('09:00').available).toBe(true);
  });

  it('dịch vụ nối tiếp được xếp cho cùng thợ chính', () => {
    const r = engine({ services: [cut, color] }).check('09:00');
    expect(r.plan!.map((p) => p.leadId)).toEqual([10, 10]);
    expect(r.plan![1].start.getTime()).toBe(vnDateTime(date, '09:30').getTime());
  });

  it('chọn stylist khác khi stylist đầu tiên bận (salon tự phân công)', () => {
    const busy = [{ start: vnDateTime(date, '09:00'), end: vnDateTime(date, '12:00') }];
    const r = engine({ stylists: [stylist({ busy }), stylist({ id: 11, name: 'Hải Nam' })] }).check('09:00');
    expect(r.plan![0].leadId).toBe(11);
  });

  it('BR-14: thiết bị hỏng/bảo trì hoặc đã kín thì không nhận dịch vụ phụ thuộc', () => {
    const spa = { ...cut, id: 3, name: 'Hấp dầu', durationMinutes: 60, equipmentKind: 'HAP' };
    const hap = (units: number, busy: { start: Date; end: Date }[] = []) => ({ HAP: { name: 'Máy hấp', units, busy } });
    const stylists = [stylist({ skillIds: [1, 3] })];
    expect(engine({ services: [spa], stylists, equipment: hap(0) }).check('09:00').rule).toBe('BR-14');
    const busy = [{ start: vnDateTime(date, '09:30'), end: vnDateTime(date, '10:30') }];
    expect(engine({ services: [spa], stylists, equipment: hap(1, busy) }).check('09:00').rule).toBe('BR-14');
    expect(engine({ services: [spa], stylists, equipment: hap(2, busy) }).check('09:00').available).toBe(true);
    // máy chỉ cần trong khung của dịch vụ phụ thuộc: cắt 09:00-09:30 rồi hấp 09:30 -> trùng
    expect(engine({ services: [cut, spa], stylists, equipment: hap(1, busy) }).check('08:00').available).toBe(true);
    expect(engine({ services: [cut, spa], stylists, equipment: hap(1, busy) }).check('09:00').rule).toBe('BR-14');
  });
  it('nghỉ giữa ca: ca tách làm hai, lịch trong khoảng nghỉ chuyển sang stylist khác', () => {
    const shift = Object.assign(new WorkShift(), { date, startTime: '08:00', endTime: '17:00', status: ShiftStatus.SCHEDULED, leaveStart: '12:00', leaveEnd: '14:00' });
    expect(shift.workRanges()).toEqual([{ start: 8 * 60, end: 12 * 60 }, { start: 14 * 60, end: 17 * 60 }]);
    const onLeave = stylist({ shifts: shift.workRanges() });
    const e = engine({ stylists: [onLeave, stylist({ id: 11, name: 'Hải Nam' })] });
    expect(e.check('12:30').plan![0].leadId).toBe(11);
    expect(e.check('14:00').plan![0].leadId).toBe(10);
    expect(e.stylistOptions('12:30').map((o) => [o.id, o.available])).toEqual([[10, false], [11, true]]);
  });
});

describe('Appointment lifecycle (mục 4.3.1)', () => {
  const appt = (status: AppointmentStatus) => Object.assign(new Appointment(), { status });

  it('luồng chuẩn Booked → Confirmed → Checked-in → In-service → Completed', () => {
    const a = appt(AppointmentStatus.BOOKED);
    [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_SERVICE, AppointmentStatus.COMPLETED].forEach((s) => a.transitionTo(s));
    expect(a.status).toBe(AppointmentStatus.COMPLETED);
  });

  it('trạng thái kết thúc không đảo ngược', () => {
    expect(() => appt(AppointmentStatus.NO_SHOW).transitionTo(AppointmentStatus.CONFIRMED)).toThrow();
    expect(() => appt(AppointmentStatus.COMPLETED).transitionTo(AppointmentStatus.BOOKED)).toThrow();
  });

  it('Late → No-show hợp lệ', () => {
    const a = appt(AppointmentStatus.LATE);
    a.transitionTo(AppointmentStatus.NO_SHOW);
    expect(a.status).toBe(AppointmentStatus.NO_SHOW);
  });
});
