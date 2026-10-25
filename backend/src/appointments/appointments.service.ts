import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, In, Not } from 'typeorm';
import { Appointment, AppointmentItem } from './appointment.entities';
import { AvailabilityEngine, EngineEmployee } from './availability.engine';
import { SalonService } from '../catalog/service.entity';
import { Employee, WorkShift } from '../employees/employee.entities';
import { Customer } from '../customers/customer.entity';
import { ServiceAssignment, ServiceSession, ServiceSessionItem } from '../sessions/session.entities';
import {
  AppointmentSource, AppointmentStatus, AssignmentRole, BLOCKING_STATUSES, DepositStatus,
  EmployeePosition, EmployeeStatus, Role, SessionItemStatus, SessionStatus, ShiftStatus,
} from '../common/enums';
import { AuthUser } from '../common/auth.decorators';
import { BusinessRuleError } from '../common/business.error';
import { BusinessRulesConfig } from '../common/business-rules.config';
import { AuditService, CodeService } from '../common/shared.services';
import { addMinutes, minutesOf, vnDateString, vnDayRange, vnTimeString } from '../common/time';

export interface AvailabilityQuery {
  date: string;
  serviceIds: number[];
  stylistId?: number | null;
}

export interface BookingInput extends AvailabilityQuery {
  time: string;
  note?: string;
  customer?: { fullName: string; phone: string };
}

export interface WalkInInput {
  serviceIds: number[];
  stylistId?: number | null;
  customer?: { fullName: string; phone: string };
  walkInName?: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly rules: BusinessRulesConfig,
    private readonly codes: CodeService,
    private readonly audit: AuditService,
  ) {}

  /** Có thể thay bằng đồng hồ giả trong test. */
  now(): Date {
    return new Date();
  }

  // ---------------------------------------------------------------- Khả dụng

  private async loadServices(ids: number[], m: EntityManager): Promise<SalonService[]> {
    const list = await m.findBy(SalonService, { id: In(ids) });
    if (list.length !== new Set(ids).size) throw new NotFoundException('Có dịch vụ không tồn tại');
    return ids.map((id) => list.find((s) => s.id === id)!);
  }

  /** Dựng bộ máy tính khả dụng cho một ngày, có thể loại trừ chính lịch đang đổi giờ. */
  private async buildEngine(q: AvailabilityQuery, m: EntityManager, excludeAppointmentId?: number, now = this.now()) {
    const services = await this.loadServices(q.serviceIds, m);
    const staff = await m.find(Employee, {
      where: { position: In([EmployeePosition.STYLIST, EmployeePosition.ASSISTANT]), status: EmployeeStatus.ACTIVE },
      relations: { skills: true },
    });
    const shifts = await m.find(WorkShift, { where: { date: q.date, status: ShiftStatus.SCHEDULED } });
    const { from, to } = vnDayRange(q.date);
    const items = await m.find(AppointmentItem, {
      where: {
        startAt: Between(addMinutes(from, -24 * 60), to),
        appointment: { status: In(BLOCKING_STATUSES), ...(excludeAppointmentId ? { id: Not(excludeAppointmentId) } : {}) },
      },
      relations: { appointment: true },
    });
    const toEngine = (e: Employee): EngineEmployee => ({
      id: e.id,
      name: e.fullName,
      active: e.isWorking(),
      skillIds: e.skills.map((s) => s.id),
      shifts: shifts.filter((s) => s.employee.id === e.id).map((s) => ({ start: minutesOf(s.startTime), end: minutesOf(s.endTime) })),
      busy: [
        ...items.filter((i) => i.leadStylist.id === e.id).map((i) => ({ start: i.startAt, end: i.endAt })),
        ...items.filter((i) => i.assistant?.id === e.id && i.assistantStartAt).map((i) => ({ start: i.assistantStartAt!, end: i.assistantEndAt! })),
      ],
    });
    const engine = new AvailabilityEngine({
      date: q.date,
      services: services.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes, needsAssistant: s.needsAssistant, assistantMinutes: s.assistantMinutes, bookable: s.isBookable() })),
      stylists: staff.filter((e) => e.position === EmployeePosition.STYLIST).map(toEngine),
      assistants: staff.filter((e) => e.position === EmployeePosition.ASSISTANT).map(toEngine),
      preferredStylistId: q.stylistId ?? null,
      openTime: this.rules.openTime,
      closeTime: this.rules.closeTime,
      slotMinutes: this.rules.slotMinutes,
      now,
    });
    return { engine, services, staff };
  }

  async availability(q: AvailabilityQuery, excludeAppointmentId?: number) {
    const { engine, services } = await this.buildEngine(q, this.ds.manager, excludeAppointmentId);
    const totalDuration = engine.totalDuration();
    return {
      date: q.date,
      totalDuration,
      totalPrice: services.reduce((s, x) => s + x.basePrice, 0),
      depositRequired: this.depositByServices(services),
      slots: engine.slots().map(({ plan, ...rest }) => rest),
    };
  }

  private depositByServices(services: SalonService[]): boolean {
    const total = services.reduce((s, x) => s + x.durationMinutes, 0);
    return services.some((s) => s.depositRequired) || total > this.rules.depositMinDuration;
  }

  private depositAmount(quoted: number): number {
    return Math.max(100000, Math.round((quoted * 0.2) / 10000) * 10000);
  }

  /** Khóa theo ngày để hai người đặt cùng lúc không gây trùng lịch (ngoại lệ 16, R-06). */
  private async lockDay(m: EntityManager, date: string) {
    await m.query('SELECT pg_advisory_xact_lock($1)', [Number(date.replace(/-/g, ''))]);
  }

  // ---------------------------------------------------------------- Đặt lịch

  async create(input: BookingInput, user: AuthUser | null) {
    return this.ds.transaction(async (m) => {
      await this.lockDay(m, input.date);
      let customer: Customer;
      let source: AppointmentSource;
      if (user?.role === Role.CUSTOMER) {
        customer = await m.findOneByOrFail(Customer, { id: user.customerId! });
        source = AppointmentSource.ONLINE_MEMBER;
      } else {
        if (!input.customer?.phone || !input.customer.fullName) throw new BusinessRuleError('INPUT', 'Cần họ tên và số điện thoại');
        customer = await this.findOrCreateCustomer(m, input.customer.fullName, input.customer.phone);
        source = user ? AppointmentSource.RECEPTION : AppointmentSource.ONLINE_GUEST;
      }
      const isStaff = !!user && user.role !== Role.CUSTOMER;

      const { engine, services } = await this.buildEngine(input, m);
      const result = engine.check(input.time);
      if (!result.available) throw new BusinessRuleError(result.rule ?? 'BOOKING', result.reason ?? 'Khung giờ không khả dụng');

      const appt = m.create(Appointment, {
        code: await this.codes.next('LH', m),
        customer,
        startAt: result.plan![0].start,
        endAt: result.plan![result.plan!.length - 1].end,
        source,
        autoAssigned: !input.stylistId,
        status: isStaff ? AppointmentStatus.CONFIRMED : AppointmentStatus.BOOKED,
        note: input.note ?? null,
        items: result.plan!.map((p) =>
          m.create(AppointmentItem, {
            service: services.find((s) => s.id === p.serviceId),
            leadStylist: { id: p.leadId } as Employee,
            assistant: p.assistantId ? ({ id: p.assistantId } as Employee) : null,
            startAt: p.start,
            endAt: p.end,
            assistantStartAt: p.assistantStart,
            assistantEndAt: p.assistantEnd,
            quotedPrice: services.find((s) => s.id === p.serviceId)!.basePrice,
          }),
        ),
      });
      // Đặt cọc: dịch vụ lớn, khách bùng lịch ≥ ngưỡng (BR-20) hoặc đặt online sát giờ (< 2 tiếng)
      const lastMinute = !isStaff && appt.hoursUntilStart(this.now()) < this.rules.cancelLockHours;
      if (this.depositByServices(services) || customer.requiresDeposit(this.rules.noShowDepositThreshold) || lastMinute) {
        appt.depositStatus = DepositStatus.REQUIRED;
        appt.depositAmount = this.depositAmount(appt.totalQuoted());
      }
      const saved = await m.save(appt);
      return this.reload(saved.id, m);
    });
  }

  private async findOrCreateCustomer(m: EntityManager, fullName: string, phone: string) {
    let c = await m.findOne(Customer, { where: { phone } });
    if (!c) c = await m.save(m.create(Customer, { code: await this.codes.next('KH', m), fullName, phone }));
    return c;
  }

  async reload(id: number, m: EntityManager = this.ds.manager) {
    const a = await m.findOne(Appointment, { where: { id } });
    if (!a) throw new NotFoundException('Không tìm thấy lịch hẹn');
    a.items?.sort((x, y) => x.startAt.getTime() - y.startAt.getTime());
    return a;
  }

  private async getOwned(id: number, user: AuthUser, m: EntityManager) {
    const a = await this.reload(id, m);
    if (user.role === Role.CUSTOMER && a.customer.id !== user.customerId) throw new ForbiddenException('Không phải lịch của bạn');
    return a;
  }

  /** BR-18: khách không được tự sửa/hủy khi còn < N giờ. */
  private assertCustomerCanModify(a: Appointment, user: AuthUser) {
    if (user.role !== Role.CUSTOMER) return;
    if (a.hoursUntilStart(this.now()) < this.rules.cancelLockHours) {
      throw new BusinessRuleError('BR-18', `Còn dưới ${this.rules.cancelLockHours} tiếng đến giờ hẹn — vui lòng gọi hotline để lễ tân hỗ trợ`);
    }
  }

  // ---------------------------------------------------------------- Danh sách

  /** Lịch trong ngày; tự đánh dấu "Đến trễ" khi đã qua giờ hẹn mà chưa check-in. */
  async listByDate(date: string) {
    await this.refreshLate();
    const { from, to } = vnDayRange(date);
    return this.ds.manager.find(Appointment, { where: { startAt: Between(from, to) }, order: { startAt: 'ASC' } });
  }

  async refreshLate() {
    const now = this.now();
    const due = await this.ds.manager.find(Appointment, {
      where: { status: In([AppointmentStatus.BOOKED, AppointmentStatus.CONFIRMED]), startAt: Between(addMinutes(now, -24 * 60), now) },
    });
    for (const a of due) {
      a.transitionTo(AppointmentStatus.LATE);
      await this.ds.manager.save(Appointment, a);
    }
  }

  listForCustomer(customerId: number) {
    return this.ds.manager.find(Appointment, { where: { customer: { id: customerId } }, order: { startAt: 'DESC' }, take: 100 });
  }

  async listForEmployee(employeeId: number, date: string) {
    const all = await this.listByDate(date);
    return all.filter((a) => a.items.some((i) => i.leadStylist.id === employeeId || i.assistant?.id === employeeId));
  }

  // ---------------------------------------------------------------- Chuyển trạng thái

  async confirm(id: number, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const a = await this.reload(id, m);
      a.transitionTo(AppointmentStatus.CONFIRMED);
      await m.save(a);
      await this.audit.log(user, 'APPOINTMENT_CONFIRM', 'Appointment', id, `Xác nhận lịch ${a.code}`, null, null, m);
      return a;
    });
  }

  async markDepositPaid(id: number, user: AuthUser) {
    const a = await this.reload(id);
    if (a.depositStatus !== DepositStatus.REQUIRED) throw new BusinessRuleError('DEPOSIT', 'Lịch này không chờ đặt cọc');
    a.depositStatus = DepositStatus.PAID;
    await this.ds.manager.save(a);
    await this.audit.log(user, 'DEPOSIT_PAID', 'Appointment', id, `Nhận cọc ${a.depositAmount} cho ${a.code}`);
    return a;
  }

  async cancel(id: number, reason: string | undefined, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const a = await this.getOwned(id, user, m);
      this.assertCustomerCanModify(a, user);
      if (user.role !== Role.CUSTOMER && !reason) throw new BusinessRuleError('BR-18', 'Lễ tân hủy lịch cần ghi lý do');
      a.transitionTo(AppointmentStatus.CANCELLED, reason ?? 'Khách tự hủy trực tuyến');
      await m.save(a);
      await this.audit.log(user, 'APPOINTMENT_CANCEL', 'Appointment', id, `Hủy lịch ${a.code}: ${a.statusReason}`, null, null, m);
      return a;
    });
  }

  async reschedule(id: number, input: { date: string; time: string; stylistId?: number | null; reason?: string }, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const a = await this.getOwned(id, user, m);
      this.assertCustomerCanModify(a, user);
      if (![AppointmentStatus.BOOKED, AppointmentStatus.CONFIRMED, AppointmentStatus.LATE].includes(a.status)) {
        throw new BusinessRuleError('LIFECYCLE', 'Chỉ đổi giờ được lịch chưa check-in');
      }
      await this.lockDay(m, input.date);
      const serviceIds = a.items.map((i) => i.service.id);
      const { engine } = await this.buildEngine({ date: input.date, serviceIds, stylistId: input.stylistId ?? null }, m, a.id);
      const r = engine.check(input.time);
      if (!r.available) throw new BusinessRuleError(r.rule ?? 'BOOKING', r.reason ?? 'Khung giờ không khả dụng');
      a.items.forEach((item, idx) => {
        const p = r.plan![idx];
        Object.assign(item, {
          startAt: p.start, endAt: p.end, leadStylist: { id: p.leadId }, assistant: p.assistantId ? { id: p.assistantId } : null,
          assistantStartAt: p.assistantStart, assistantEndAt: p.assistantEnd,
        });
      });
      a.startAt = r.plan![0].start;
      a.endAt = r.plan![r.plan!.length - 1].end;
      if (a.status === AppointmentStatus.LATE) a.status = AppointmentStatus.CONFIRMED;
      if (user.role === Role.CUSTOMER) a.status = AppointmentStatus.BOOKED;
      await m.save(a);
      await this.audit.log(user, 'APPOINTMENT_RESCHEDULE', 'Appointment', id, `Đổi lịch ${a.code} sang ${input.date} ${input.time}${input.reason ? ' — ' + input.reason : ''}`, null, null, m);
      return this.reload(a.id, m);
    });
  }

  async markLate(id: number) {
    const a = await this.reload(id);
    if (this.now() < a.startAt) throw new BusinessRuleError('BR-20', 'Chưa tới giờ hẹn');
    a.transitionTo(AppointmentStatus.LATE);
    return this.ds.manager.save(a);
  }

  /**
   * BR-20: quá thời gian ân hạn → No-Show. Không xóa bản ghi; thợ được giải phóng ngay
   * (lịch No-Show không còn chặn khung giờ) và tăng noShowCount của khách.
   */
  async noShow(id: number, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const a = await this.reload(id, m);
      const graceEnd = addMinutes(a.startAt, this.rules.graceMinutes);
      if (this.now() < graceEnd) {
        throw new BusinessRuleError('BR-20', `Chưa hết ${this.rules.graceMinutes} phút ân hạn (đến ${vnTimeString(graceEnd)})`);
      }
      a.transitionTo(AppointmentStatus.NO_SHOW, 'Quá thời gian ân hạn, không liên lạc được');
      if (a.depositStatus === DepositStatus.PAID) a.depositStatus = DepositStatus.FORFEITED;
      await m.save(a);
      const customer = await m.findOneByOrFail(Customer, { id: a.customer.id });
      customer.registerNoShow();
      await m.save(customer);
      await this.audit.log(user, 'APPOINTMENT_NO_SHOW', 'Appointment', id, `Lịch ${a.code} vắng mặt, giải phóng thợ. Khách ${customer.fullName}: ${customer.noShowCount} lần`, null, null, m);
      return {
        appointment: a,
        releasedEmployeeIds: [...new Set(a.items.flatMap((i) => [i.leadStylist.id, i.assistant?.id].filter(Boolean)))],
        customerNoShowCount: customer.noShowCount,
        depositRequiredNextTime: customer.requiresDeposit(this.rules.noShowDepositThreshold),
      };
    });
  }

  /** Check-in: đối chiếu lịch, tạo phiên phục vụ với phân công dự kiến (mục 3.4). */
  async checkIn(id: number, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const a = await this.reload(id, m);
      a.transitionTo(AppointmentStatus.CHECKED_IN);
      a.checkedInAt = this.now();
      await m.save(a);
      const session = await this.createSession(m, a, a.customer, null);
      await this.audit.log(user, 'CHECK_IN', 'Appointment', id, `Check-in ${a.code}`, null, null, m);
      return session;
    });
  }

  private async createSession(m: EntityManager, a: Appointment, customer: Customer | null, walkInName: string | null) {
    const session = m.create(ServiceSession, {
      code: await this.codes.next('PV', m),
      appointment: a,
      customer,
      walkInName,
      status: SessionStatus.OPEN,
      items: a.items.map((i) =>
        m.create(ServiceSessionItem, {
          service: i.service,
          agreedPrice: i.quotedPrice,
          status: SessionItemStatus.CONFIRMED,
          assignments: [
            m.create(ServiceAssignment, { employee: i.leadStylist, role: AssignmentRole.LEAD_STYLIST }),
            ...(i.assistant ? [m.create(ServiceAssignment, { employee: i.assistant, role: AssignmentRole.ASSISTANT })] : []),
          ],
        }),
      ),
    });
    const saved = await m.save(session);
    return m.findOneOrFail(ServiceSession, { where: { id: saved.id } });
  }

  /** Khách walk-in (mục 3.3): kiểm tra khả năng phục vụ ngay; nếu không, gợi ý giờ trống. */
  async walkIn(input: WalkInInput, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const now = this.now();
      const date = vnDateString(now);
      await this.lockDay(m, date);
      const mins = minutesOf(vnTimeString(now));
      const rounded = Math.ceil(mins / 5) * 5;
      const time = `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
      const { engine, services } = await this.buildEngine({ date, serviceIds: input.serviceIds, stylistId: input.stylistId ?? null }, m, undefined, addMinutes(now, -1));
      const r = engine.check(time);
      if (!r.available) {
        const next = engine.slots().filter((s) => s.available).slice(0, 4).map((s) => s.time);
        throw new BusinessRuleError(r.rule ?? 'WALK_IN', `${r.reason}. Giờ trống gần nhất: ${next.join(', ') || 'không còn hôm nay'}`);
      }
      const customer = input.customer?.phone ? await this.findOrCreateCustomer(m, input.customer.fullName, input.customer.phone) : null;
      const anon = customer ?? (await this.findOrCreateCustomer(m, 'Khách vãng lai', '0000000000'));
      const appt = await m.save(
        m.create(Appointment, {
          code: await this.codes.next('LH', m),
          customer: anon,
          startAt: r.plan![0].start,
          endAt: r.plan![r.plan!.length - 1].end,
          source: AppointmentSource.WALK_IN,
          status: AppointmentStatus.CHECKED_IN,
          checkedInAt: now,
          autoAssigned: !input.stylistId,
          items: r.plan!.map((p) =>
            m.create(AppointmentItem, {
              service: services.find((s) => s.id === p.serviceId),
              leadStylist: { id: p.leadId } as Employee,
              assistant: p.assistantId ? ({ id: p.assistantId } as Employee) : null,
              startAt: p.start, endAt: p.end, assistantStartAt: p.assistantStart, assistantEndAt: p.assistantEnd,
              quotedPrice: services.find((s) => s.id === p.serviceId)!.basePrice,
            }),
          ),
        }),
      );
      const full = await this.reload(appt.id, m);
      const session = await this.createSession(m, full, customer, customer ? null : input.walkInName ?? 'Khách walk-in');
      await this.audit.log(user, 'WALK_IN', 'ServiceSession', session.id, `Tiếp nhận walk-in ${session.code}`, null, null, m);
      return session;
    });
  }
}
