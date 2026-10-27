import { ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, In, LessThan, MoreThan, Not } from 'typeorm';
import { Appointment, AppointmentItem, ClosedDay, WalkInQueueEntry } from './appointment.entities';
import { AvailabilityEngine, EngineEmployee } from './availability.engine';
import { SalonService } from '../catalog/service.entity';
import { Employee, WorkShift } from '../employees/employee.entities';
import { Customer } from '../customers/customer.entity';
import { Equipment } from '../operations/operations.entities';
import { ServiceMaterial } from '../inventory/inventory.entities';
import { freeChairs } from '../sessions/chairs';
import { ServiceAssignment, ServiceSession, ServiceSessionItem } from '../sessions/session.entities';
import {
  AppointmentSource, AppointmentStatus, AssignmentRole, BLOCKING_STATUSES, DepositStatus,
  EmployeePosition, EmployeeStatus, EQUIPMENT_KINDS, EquipmentStatus, QueueStatus, Role, SessionItemStatus, SessionStatus, ShiftStatus,
} from '../common/enums';
import { AuthUser } from '../common/auth.decorators';
import { BusinessRuleError } from '../common/business.error';
import { BusinessRulesConfig } from '../common/business-rules.config';
import { AuditService, CodeService } from '../common/shared.services';
import { addMinutes, minutesOf, overlaps, vnDateString, vnDateTime, vnDayRange, vnTimeString } from '../common/time';
import { PlannedItem } from './availability.engine';
import { ANON_PHONE } from '../common/validation';

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
export class AppointmentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('NhacLich');
  private reminderTimer?: NodeJS.Timeout;

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

  // ---------------------------------------------------------------- Nhắc lịch (FR-25)

  onModuleInit() {
    const tick = () => {
      this.sendReminders().catch((e) => this.logger.error(e));
      this.expireUnpaidDeposits().catch((e) => this.logger.error(e));
    };
    this.reminderTimer = setInterval(tick, 5 * 60_000);
    this.reminderTimer.unref();
    tick();
  }

  onModuleDestroy() {
    clearInterval(this.reminderTimer);
  }

  /**
   * Gửi nhắc cho lịch sắp tới trong REMINDER_HOURS giờ, mỗi lịch một lần.
   * UPDATE ... RETURNING đánh dấu nguyên tử nên chạy nhiều instance cũng không gửi trùng.
   * Kênh gửi thật: đặt REMINDER_WEBHOOK_URL (cổng SMS/Zalo/email hoặc n8n/Zapier) để nhận POST JSON
   * { phone, fullName, appointmentCode, startAt, message }. Gửi lỗi thì nhả lại `remindedAt` để lần quét sau gửi lại.
   * Không đặt URL thì chỉ ghi log + nhật ký + popup web khách.
   */
  async sendReminders(now = this.now()) {
    // UPDATE qua ds.query trả về [rows, rowCount]
    const [rows]: [{ id: number; code: string; startAt: Date; fullName: string; phone: string }[]] = await this.ds.query(
      `UPDATE appointments a SET "remindedAt" = $1
         FROM customers c
        WHERE c.id = a."customerId" AND a."remindedAt" IS NULL
          AND a.status IN ('BOOKED', 'CONFIRMED') AND a."startAt" > $1 AND a."startAt" <= $2
       RETURNING a.id, a.code, a."startAt", c."fullName", c.phone`,
      [now, addMinutes(now, this.rules.reminderHours * 60)],
    );
    for (const r of rows) {
      const at = new Date(r.startAt);
      const text = `Salon nhắc lịch ${r.code} lúc ${vnTimeString(at)} ngày ${vnDateString(at).split('-').reverse().join('/')}. Đổi/hủy vui lòng báo trước ${this.rules.cancelLockHours} giờ.`;
      if (this.rules.reminderWebhookUrl) {
        try {
          const res = await fetch(this.rules.reminderWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(this.rules.reminderWebhookToken ? { Authorization: `Bearer ${this.rules.reminderWebhookToken}` } : {}) },
            body: JSON.stringify({ phone: r.phone, fullName: r.fullName, appointmentCode: r.code, startAt: at.toISOString(), message: text }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (e) {
          this.logger.warn(`Gửi nhắc ${r.code} lỗi (${(e as Error).message}), sẽ thử lại`);
          await this.ds.query('UPDATE appointments SET "remindedAt" = NULL WHERE id = $1', [r.id]);
          continue;
        }
      } else {
        this.logger.log(`[nhắc lịch - chưa cấu hình REMINDER_WEBHOOK_URL] ${r.phone} (${r.fullName}): ${text}`);
      }
      await this.audit.log(null, 'APPOINTMENT_REMINDER', 'Appointment', r.id, `Đã gửi nhắc lịch ${r.code} tới ${r.phone}: ${text}`);
    }
    return rows.length;
  }

  /** Lịch cần cọc mà quá DEPOSIT_HOLD_HOURS chưa thu cọc thì tự hủy để nhả chỗ (không tính no-show). */
  async expireUnpaidDeposits(now = this.now()) {
    const [rows]: [{ id: number; code: string }[]] = await this.ds.query(
      `UPDATE appointments SET status = 'CANCELLED', "statusReason" = $2, "updatedAt" = now()
        WHERE "depositStatus" = 'REQUIRED' AND status IN ('BOOKED', 'CONFIRMED') AND "createdAt" < $1
       RETURNING id, code`,
      [addMinutes(now, -this.rules.depositHoldHours * 60), `Quá ${this.rules.depositHoldHours} giờ chưa đặt cọc, hệ thống tự hủy`],
    );
    for (const r of rows) await this.audit.log(null, 'APPOINTMENT_CANCEL', 'Appointment', r.id, `Tự hủy lịch ${r.code}: quá hạn đặt cọc`);
    return rows.length;
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
    const closed = await m.findOneBy(ClosedDay, { date: q.date });
    const kinds = [...new Set(services.map((s) => s.requiredEquipment).filter((k): k is string => !!k))];
    const units = kinds.length ? await m.findBy(Equipment, { kind: In(kinds), status: EquipmentStatus.IN_USE }) : [];
    const equipment = Object.fromEntries(
      kinds.map((k) => [k, {
        name: EQUIPMENT_KINDS[k] ?? k,
        units: units.filter((u) => u.kind === k).length,
        busy: items.filter((i) => i.service.requiredEquipment === k).map((i) => ({ start: i.startAt, end: i.endAt })),
      }]),
    );
    const toEngine = (e: Employee): EngineEmployee => ({
      id: e.id,
      name: e.fullName,
      active: e.isWorking(),
      skillIds: e.skills.map((s) => s.id),
      shifts: shifts.filter((s) => s.employee.id === e.id).flatMap((s) => s.workRanges()),
      busy: [
        ...items.filter((i) => i.leadStylist.id === e.id).map((i) => ({ start: i.startAt, end: i.endAt })),
        ...items.filter((i) => i.assistant?.id === e.id && i.assistantStartAt).map((i) => ({ start: i.assistantStartAt!, end: i.assistantEndAt! })),
      ],
    });
    const engine = new AvailabilityEngine({
      date: q.date,
      services: services.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes, needsAssistant: s.needsAssistant, assistantMinutes: s.assistantMinutes, bookable: s.isBookable(), equipmentKind: s.requiredEquipment })),
      equipment,
      stylists: staff.filter((e) => e.position === EmployeePosition.STYLIST).map(toEngine),
      assistants: staff.filter((e) => e.position === EmployeePosition.ASSISTANT).map(toEngine),
      preferredStylistId: q.stylistId ?? null,
      closedReason: closed?.reason ?? null,
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
    return Math.max(this.rules.depositMinAmount, Math.round((quoted * this.rules.depositRate) / 10000) * 10000);
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
      if (!isStaff) {
        const open = await m.count(Appointment, {
          where: { customer: { id: customer.id }, status: In([AppointmentStatus.BOOKED, AppointmentStatus.CONFIRMED, AppointmentStatus.LATE]), startAt: MoreThan(this.now()) },
        });
        if (open >= this.rules.maxOpenAppointments) {
          throw new BusinessRuleError('BR-OPEN', `Mỗi khách chỉ giữ tối đa ${this.rules.maxOpenAppointments} lịch chưa đến — vui lòng hủy bớt hoặc gọi ${this.rules.hotline}`);
        }
      }

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
        status: AppointmentStatus.BOOKED,
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
      // Lễ tân đặt hộ thì xác nhận ngay, trừ khi còn chờ cọc (xác nhận sau khi nhận cọc).
      if (isStaff && appt.depositStatus !== DepositStatus.REQUIRED) appt.status = AppointmentStatus.CONFIRMED;
      const saved = await m.save(appt);
      return this.reload(saved.id, m);
    });
  }

  /** Hồ sơ dùng chung cho khách walk-in không để lại thông tin; gắn khách thật ở phiên phục vụ sau (mục 22). */
  private async anonymousCustomer(m: EntityManager) {
    const found = await m.findOne(Customer, { where: [{ isAnonymous: true }, { phone: ANON_PHONE }] });
    if (found) return found;
    return m.save(m.create(Customer, { code: await this.codes.next('KH', m), fullName: 'Khách vãng lai', phone: ANON_PHONE, isAnonymous: true }));
  }

  private async findOrCreateCustomer(m: EntityManager, fullName: string, phone: string) {
    if (phone === ANON_PHONE) throw new BusinessRuleError('INPUT', 'Số điện thoại không hợp lệ');
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
      if (a.depositStatus === DepositStatus.REQUIRED) throw new BusinessRuleError('DEPOSIT', 'Lịch này cần đặt cọc trước khi xác nhận');
      a.transitionTo(AppointmentStatus.CONFIRMED);
      await m.save(a);
      await this.audit.log(user, 'APPOINTMENT_CONFIRM', 'Appointment', id, `Xác nhận lịch ${a.code}`, null, null, m);
      return a;
    });
  }

  async markDepositPaid(id: number, user: AuthUser) {
    const a = await this.reload(id);
    if (a.depositStatus !== DepositStatus.REQUIRED) throw new BusinessRuleError('DEPOSIT', 'Lịch này không chờ đặt cọc');
    if (![AppointmentStatus.BOOKED, AppointmentStatus.CONFIRMED, AppointmentStatus.LATE].includes(a.status)) {
      throw new BusinessRuleError('DEPOSIT', `Không nhận cọc cho lịch ${a.status}`);
    }
    a.depositStatus = DepositStatus.PAID;
    if (a.source === AppointmentSource.RECEPTION && a.status === AppointmentStatus.BOOKED) a.transitionTo(AppointmentStatus.CONFIRMED);
    await this.ds.manager.save(a);
    await this.audit.log(user, 'DEPOSIT_PAID', 'Appointment', id, `Nhận cọc ${a.depositAmount} cho ${a.code}`);
    return a;
  }

  /** Cọc đã thu: hoàn nếu hủy trước mốc khóa (BR-18), ngược lại mất cọc; lễ tân có thể quyết định khác qua `refundDeposit`. */
  async cancel(id: number, reason: string | undefined, user: AuthUser, refundDeposit?: boolean) {
    return this.ds.transaction(async (m) => {
      const a = await this.getOwned(id, user, m);
      this.assertCustomerCanModify(a, user);
      if (user.role !== Role.CUSTOMER && !reason) throw new BusinessRuleError('BR-18', 'Lễ tân hủy lịch cần ghi lý do');
      a.transitionTo(AppointmentStatus.CANCELLED, reason ?? 'Khách tự hủy trực tuyến');
      const early = a.hoursUntilStart(this.now()) >= this.rules.cancelLockHours;
      const settled = a.settleDeposit(user.role === Role.CUSTOMER ? early : refundDeposit ?? early);
      await m.save(a);
      await this.audit.log(user, 'APPOINTMENT_CANCEL', 'Appointment', id, `Hủy lịch ${a.code}: ${a.statusReason}${settled ? ` — cọc ${a.depositAmount}: ${settled === DepositStatus.REFUNDED ? 'hoàn lại khách' : 'không hoàn'}` : ''}`, null, null, m);
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
      this.applyPlan(a, r.plan!);
      a.stylistChangeNote = null;
      if (user.role === Role.CUSTOMER) a.status = AppointmentStatus.BOOKED;
      await m.save(a);
      await this.audit.log(user, 'APPOINTMENT_RESCHEDULE', 'Appointment', id, `Đổi lịch ${a.code} sang ${input.date} ${input.time}${input.reason ? ' — ' + input.reason : ''}`, null, null, m);
      return this.reload(a.id, m);
    });
  }

  /** Gán lại thợ/giờ theo kế hoạch mới của bộ máy khả dụng (items cùng thứ tự dịch vụ). */
  private applyPlan(a: Appointment, plan: PlannedItem[]) {
    const timeChanged = plan[0].start.getTime() !== a.startAt.getTime();
    a.items.forEach((item, idx) => {
      const p = plan[idx];
      Object.assign(item, {
        startAt: p.start, endAt: p.end, leadStylist: { id: p.leadId }, assistant: p.assistantId ? { id: p.assistantId } : null,
        assistantStartAt: p.assistantStart, assistantEndAt: p.assistantEnd,
      });
    });
    a.startAt = plan[0].start;
    a.endAt = plan[plan.length - 1].end;
    if (timeChanged) {
      a.remindedAt = null; // giờ mới cần nhắc lại
      if (a.status === AppointmentStatus.LATE) a.status = AppointmentStatus.CONFIRMED;
    }
  }

  /**
   * Thợ xin nghỉ [from, to) trong ngày (ca đã được cập nhật trong cùng transaction `m`):
   * xếp lại mọi lịch chưa check-in bị ảnh hưởng theo thứ tự ưu tiên
   *   1) giữ giờ, giữ thợ chính (khi người nghỉ là thợ phụ) → 2) giữ giờ, đổi stylist khác đủ chuyên môn
   *   → 3) dời sang giờ trống gần nhất trong ngày, ưu tiên muộn hơn và thợ cũ → 4) giữ nguyên, báo lễ tân liên hệ khách.
   * Lịch đổi thợ/giờ được gắn ghi chú để lễ tân hỏi khách lúc check-in.
   */
  async rearrangeForLeave(m: EntityManager, employee: Employee, date: string, from: string, to: string, reason?: string | null) {
    await this.lockDay(m, date);
    const winStart = vnDateTime(date, from);
    const winEnd = vnDateTime(date, to);
    const { from: d0, to: d1 } = vnDayRange(date);
    const all = await m.find(Appointment, { where: { startAt: Between(d0, d1), status: In(BLOCKING_STATUSES) }, order: { startAt: 'ASC' } });
    const hit = (a: Appointment) =>
      a.items.some(
        (i) =>
          (i.leadStylist.id === employee.id && overlaps(i.startAt, i.endAt, winStart, winEnd)) ||
          (i.assistant?.id === employee.id && !!i.assistantStartAt && overlaps(i.assistantStartAt, i.assistantEndAt!, winStart, winEnd)),
      );
    const serving = all.find((a) => hit(a) && [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_SERVICE].includes(a.status));
    if (serving) throw new BusinessRuleError('LEAVE', `Đang phục vụ lịch ${serving.code} trong khoảng nghỉ — hãy bàn giao trong phiên phục vụ trước`);

    const why = `${employee.fullName} nghỉ ${from}–${to}${reason ? ` (${reason})` : ''}`;
    const results: { code: string; customer: string; outcome: 'KEPT_TIME' | 'MOVED' | 'UNRESOLVED'; note: string }[] = [];
    for (const a of all.filter(hit)) {
      const time = vnTimeString(a.startAt);
      const serviceIds = a.items.map((i) => i.service.id);
      const oldLead = a.items[0].leadStylist;
      const engineFor = async (stylistId: number | null, now: Date) => (await this.buildEngine({ date, serviceIds, stylistId }, m, a.id, now)).engine;
      // Lịch trễ (giờ hẹn đã qua) vẫn được giữ giờ cũ cho khách sắp tới.
      const sameTimeNow = new Date(Math.min(this.now().getTime(), addMinutes(a.startAt, -1).getTime()));
      let plan: PlannedItem[] | undefined;
      for (const sid of [oldLead.id, null]) {
        plan = (await engineFor(sid, sameTimeNow)).check(time).plan;
        if (plan) break;
      }
      let outcome: 'KEPT_TIME' | 'MOVED' | 'UNRESOLVED' = 'KEPT_TIME';
      if (!plan) {
        // Ưu tiên giờ muộn hơn (khách vẫn tới đúng hẹn rồi chờ); chỉ dời sớm hơn khi cả ngày không còn giờ sau.
        const dist = (t: string) => (minutesOf(t) >= minutesOf(time) ? minutesOf(t) - minutesOf(time) : 24 * 60 + minutesOf(time) - minutesOf(t));
        let best: { time: string; plan?: PlannedItem[] } | undefined;
        for (const sid of [oldLead.id, null]) {
          for (const slot of (await engineFor(sid, this.now())).slots()) {
            if (slot.available && (!best || dist(slot.time) < dist(best.time))) best = slot;
          }
        }
        plan = best?.plan;
        outcome = plan ? 'MOVED' : 'UNRESOLVED';
      }
      if (plan) this.applyPlan(a, plan);
      const leadChanged = !!plan && plan[0].leadId !== oldLead.id;
      let note = `${why}.`;
      if (outcome === 'UNRESOLVED') note += ' Không tìm được thợ/giờ thay thế trong ngày — cần liên hệ khách đổi lịch.';
      else if (outcome === 'MOVED') note += ` Salon đã dời sang ${vnTimeString(a.startAt)}${leadChanged ? ' với stylist khác' : ''} — cần gọi báo khách.`;
      else if (leadChanged) note += ' Salon đã chuyển sang stylist khác cùng giờ.';
      else note = `${why}. Đã đổi thợ phụ, giữ nguyên stylist và giờ.`;
      // Chỉ hỏi lại khách khi stylist/giờ của họ thay đổi.
      if (outcome !== 'KEPT_TIME' || leadChanged) a.stylistChangeNote = note;
      await m.save(a);
      await this.audit.log(null, 'LEAVE_REARRANGE', 'Appointment', a.id, `${a.code}: ${note}`, null, null, m);
      results.push({ code: a.code, customer: a.customer.fullName, outcome, note });
    }
    return results;
  }

  /** Các stylist có thể nhận lịch này đúng giờ hẹn (lễ tân hỏi khách lúc check-in). */
  async stylistOptions(id: number) {
    const a = await this.reload(id);
    const { engine } = await this.buildEngine(
      { date: vnDateString(a.startAt), serviceIds: a.items.map((i) => i.service.id), stylistId: null },
      this.ds.manager, a.id, addMinutes(a.startAt, -1),
    );
    const current = a.items[0].leadStylist.id;
    return engine.stylistOptions(vnTimeString(a.startAt)).map((o) => ({ ...o, current: o.id === current }));
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
  async checkIn(id: number, user: AuthUser, stylistId?: number | null) {
    return this.ds.transaction(async (m) => {
      const a = await this.reload(id, m);
      const now = this.now();
      if (!a.canTransitionTo(AppointmentStatus.CHECKED_IN)) throw new BusinessRuleError('LIFECYCLE', `Không thể check-in lịch ${a.status}`);
      if (a.depositStatus === DepositStatus.REQUIRED) throw new BusinessRuleError('DEPOSIT', 'Lịch này cần đặt cọc trước khi check-in');
      if (vnDateString(now) !== vnDateString(a.startAt) || now < addMinutes(a.startAt, -this.rules.checkInEarlyMinutes)) {
        throw new BusinessRuleError('BR-CHECKIN', `Chỉ check-in được từ ${this.rules.checkInEarlyMinutes} phút trước giờ hẹn (${vnTimeString(a.startAt)}) trong đúng ngày hẹn`);
      }
      // Khách muốn đổi stylist khi tới: xếp lại đúng giờ hẹn với thợ mới.
      if (stylistId && a.items.some((i) => i.leadStylist.id !== stylistId)) {
        const date = vnDateString(a.startAt);
        await this.lockDay(m, date);
        const { engine } = await this.buildEngine({ date, serviceIds: a.items.map((i) => i.service.id), stylistId }, m, a.id, addMinutes(a.startAt, -1));
        const r = engine.check(vnTimeString(a.startAt));
        if (!r.available) throw new BusinessRuleError(r.rule ?? 'BOOKING', r.reason ?? 'Stylist này không nhận được giờ hẹn');
        this.applyPlan(a, r.plan!);
      }
      a.stylistChangeNote = null;
      // Khách trễ: dời cả lịch theo giờ thực tế để giờ kết thúc (và khả dụng phía sau) tính đúng; trùng lịch sau thì cảnh báo lễ tân.
      const warnings: string[] = [];
      const delay = Math.floor((now.getTime() - a.startAt.getTime()) / 60000);
      if (delay > 0) {
        const shift = (d: Date | null) => (d ? addMinutes(d, delay) : d);
        for (const i of a.items) Object.assign(i, { startAt: shift(i.startAt), endAt: shift(i.endAt), assistantStartAt: shift(i.assistantStartAt), assistantEndAt: shift(i.assistantEndAt) });
        a.startAt = addMinutes(a.startAt, delay);
        a.endAt = addMinutes(a.endAt, delay);
        const clash = await this.collisions(m, a);
        if (clash.length) warnings.push(`Khách trễ ${delay} phút, lịch kéo dài đến ${vnTimeString(a.endAt)} và chồng lịch ${clash.join(', ')} — cần báo khách hoặc dời lịch sau`);
      }
      a.transitionTo(AppointmentStatus.CHECKED_IN);
      a.checkedInAt = now;
      await m.save(a);
      const full = await this.reload(a.id, m);
      warnings.push(...(await this.materialWarnings(m, full)));
      const session = await this.createSession(m, full, a.customer, null);
      await this.audit.log(user, 'CHECK_IN', 'Appointment', id, `Check-in ${a.code}${delay > 0 ? ` trễ ${delay} phút` : ''}`, null, null, m);
      return Object.assign(session, { warnings });
    });
  }

  /** Cảnh báo lễ tân khi tồn kho không đủ vật tư theo định mức của các dịch vụ trong lịch (FR-18, ngoại lệ 9). */
  private async materialWarnings(m: EntityManager, a: Appointment): Promise<string[]> {
    const need = new Map<number, { name: string; stock: number; qty: number }>();
    for (const i of a.items) {
      for (const mat of await m.find(ServiceMaterial, { where: { service: { id: i.service.id } } })) {
        const cur = need.get(mat.product.id) ?? { name: mat.product.name, stock: mat.product.stock, qty: 0 };
        cur.qty += mat.quantity;
        need.set(mat.product.id, cur);
      }
    }
    return [...need.values()].filter((x) => x.stock < x.qty).map((x) => `Thiếu vật tư "${x.name}": cần ${x.qty}, tồn ${x.stock}`);
  }

  private async createSession(m: EntityManager, a: Appointment, customer: Customer | null, walkInName: string | null) {
    const session = m.create(ServiceSession, {
      code: await this.codes.next('PV', m),
      appointment: a,
      customer,
      walkInName,
      chair: (await freeChairs(m))[0] ?? null,
      status: SessionStatus.OPEN,
      items: a.items.map((i) =>
        m.create(ServiceSessionItem, {
          service: i.service,
          agreedPrice: i.quotedPrice,
          ...i.service.commissionSnapshot(),
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
      const anon = customer ?? (await this.anonymousCustomer(m));
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
      return Object.assign(session, { warnings: await this.materialWarnings(m, full) });
    });
  }

  // ---------------------------------------------------------------- Dịch vụ phát sinh, ca kéo dài

  /** Mã các lịch khác (đang chặn khung giờ) chồng lên giờ của thợ trong lịch `a`. */
  private async collisions(m: EntityManager, a: Appointment): Promise<string[]> {
    const staff = new Set(a.items.flatMap((i) => [i.leadStylist.id, i.assistant?.id].filter((x): x is number => !!x)));
    const others = await m.find(AppointmentItem, {
      where: { startAt: LessThan(a.endAt), endAt: MoreThan(a.startAt), appointment: { status: In(BLOCKING_STATUSES), id: Not(a.id) } },
      relations: { appointment: true },
    });
    return [...new Set(others.filter((o) => staff.has(o.leadStylist.id) || (o.assistant && staff.has(o.assistant.id))).map((o) => o.appointment.code))];
  }

  /**
   * Dịch vụ phát sinh giữa phiên: nối thêm một AppointmentItem vào cuối lịch (không sớm hơn lúc này),
   * kiểm tra thợ còn trong ca và không chồng lịch khác (BR-01, BR-02), rồi kéo dài `endAt`.
   * ponytail: chưa kiểm tra thiết bị (BR-14) cho dịch vụ phát sinh.
   */
  async extendForService(m: EntityManager, appointmentId: number, service: SalonService, leadId: number, assistantId: number | null, now = this.now()) {
    const a = await this.reload(appointmentId, m);
    const date = vnDateString(a.startAt);
    await this.lockDay(m, date);
    const start = a.endAt > now ? a.endAt : now;
    const end = addMinutes(start, service.durationMinutes);
    const assistantEnd = assistantId ? addMinutes(start, service.assistantMinutes || service.durationMinutes) : null;
    const { engine } = await this.buildEngine({ date, serviceIds: [service.id], stylistId: leadId }, m, a.id, addMinutes(start, -1));
    const window = `${vnTimeString(start)}–${vnTimeString(end)}`;
    if (vnDateString(end) !== date || !engine.staffFree(leadId, start, end)) {
      throw new BusinessRuleError('BR-01', `Thợ chính không rảnh hoặc ngoài ca trong ${window} (đang bận lịch khác hoặc hết ca) — chọn thợ khác hoặc dời lịch sau`);
    }
    if (assistantId && !engine.staffFree(assistantId, start, assistantEnd!)) {
      throw new BusinessRuleError('BR-17', `Thợ phụ không rảnh hoặc ngoài ca trong ${window}`);
    }
    const item = await m.save(m.create(AppointmentItem, {
      appointment: a, service, leadStylist: { id: leadId } as Employee, assistant: assistantId ? ({ id: assistantId } as Employee) : null,
      startAt: start, endAt: end, assistantStartAt: assistantId ? start : null, assistantEndAt: assistantEnd, quotedPrice: service.basePrice,
    }));
    if (end > a.endAt) await m.update(Appointment, a.id, { endAt: end });
    return item;
  }

  /** Bỏ dịch vụ phát sinh khỏi phiên: xóa AppointmentItem tương ứng và thu hẹp `endAt` còn đúng các dịch vụ còn lại. */
  async shrinkForService(m: EntityManager, appointmentItemId: number) {
    const item = await m.findOne(AppointmentItem, { where: { id: appointmentItemId }, relations: { appointment: true } });
    if (!item) return;
    await m.delete(AppointmentItem, item.id);
    const rest = await m.find(AppointmentItem, { where: { appointment: { id: item.appointment.id } } });
    if (rest.length) await m.update(Appointment, item.appointment.id, { endAt: new Date(Math.max(...rest.map((i) => i.endAt.getTime()))) });
  }

  /**
   * Ca đang phục vụ kéo dài thêm `minutes` (ngoại lệ 5): cập nhật giờ kết thúc nếu `apply`,
   * và liệt kê lịch kế tiếp của cùng thợ bị chồng kèm giờ trống gần nhất sau khi ca này xong để lễ tân dời lịch.
   */
  async overrun(id: number, minutes: number, apply: boolean, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const a = await this.reload(id, m);
      if (![AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_SERVICE].includes(a.status)) throw new BusinessRuleError('LIFECYCLE', 'Chỉ kéo dài được ca đang phục vụ');
      const date = vnDateString(a.startAt);
      await this.lockDay(m, date);
      const newEnd = addMinutes(a.endAt, minutes);
      const staff = new Set(a.items.flatMap((i) => [i.leadStylist.id, i.assistant?.id].filter((x): x is number => !!x)));
      const hits = await m.find(AppointmentItem, {
        where: { startAt: LessThan(newEnd), endAt: MoreThan(a.endAt), appointment: { status: In([AppointmentStatus.BOOKED, AppointmentStatus.CONFIRMED, AppointmentStatus.LATE]), id: Not(a.id) } },
        relations: { appointment: true },
      });
      const impacted = new Map<number, Appointment>();
      for (const h of hits) if (staff.has(h.leadStylist.id) || (h.assistant && staff.has(h.assistant.id))) impacted.set(h.appointment.id, h.appointment);
      const afterMin = minutesOf(vnTimeString(newEnd));
      const list = [];
      for (const ap of impacted.values()) {
        const { engine } = await this.buildEngine({ date, serviceIds: ap.items.map((i) => i.service.id), stylistId: null }, m, ap.id);
        const slot = engine.slots().find((s) => s.available && minutesOf(s.time) >= afterMin);
        list.push({ id: ap.id, code: ap.code, customer: ap.customer.fullName, phone: ap.customer.phone, startAt: ap.startAt, suggestedTime: slot?.time ?? null });
      }
      if (apply) {
        const last = [...a.items].sort((x, y) => y.endAt.getTime() - x.endAt.getTime())[0];
        await m.update(AppointmentItem, last.id, { endAt: addMinutes(last.endAt, minutes) });
        await m.update(Appointment, a.id, { endAt: newEnd });
        await this.audit.log(user, 'APPOINTMENT_OVERRUN', 'Appointment', a.id, `Ca ${a.code} kéo dài thêm ${minutes} phút (đến ${vnTimeString(newEnd)}), ảnh hưởng ${list.length} lịch`, null, null, m);
      }
      return { applied: apply, newEndAt: newEnd, impacted: list };
    });
  }

  // ---------------------------------------------------------------- Hàng chờ walk-in (§7.3)

  queueList() {
    return this.ds.manager.find(WalkInQueueEntry, { where: { status: QueueStatus.WAITING }, order: { createdAt: 'ASC' } });
  }

  async queueAdd(dto: { name: string; phone?: string; serviceIds: number[]; stylistId?: number | null; note?: string }, user: AuthUser) {
    await this.loadServices(dto.serviceIds, this.ds.manager);
    const e = await this.ds.manager.save(WalkInQueueEntry, this.ds.manager.create(WalkInQueueEntry, {
      name: dto.name, phone: dto.phone ?? null, serviceIds: dto.serviceIds, stylistId: dto.stylistId ?? null, note: dto.note ?? null,
    }));
    await this.audit.log(user, 'QUEUE_ADD', 'WalkInQueueEntry', e.id, `Xếp hàng chờ: ${e.name}`);
    return e;
  }

  /** Gọi khách vào: thử tiếp nhận ngay như walk-in; chưa có thợ rảnh thì giữ nguyên trong hàng và báo lý do. */
  async queueCall(id: number, user: AuthUser) {
    const e = await this.ds.manager.findOneBy(WalkInQueueEntry, { id });
    if (!e || e.status !== QueueStatus.WAITING) throw new NotFoundException('Khách không còn trong hàng chờ');
    const session = await this.walkIn(
      { serviceIds: e.serviceIds, stylistId: e.stylistId, customer: e.phone ? { fullName: e.name, phone: e.phone } : undefined, walkInName: e.name },
      user,
    );
    await this.ds.manager.update(WalkInQueueEntry, e.id, { status: QueueStatus.SERVED, sessionId: session.id });
    return session;
  }

  async queueCancel(id: number, user: AuthUser) {
    const e = await this.ds.manager.findOneBy(WalkInQueueEntry, { id });
    if (!e || e.status !== QueueStatus.WAITING) throw new NotFoundException('Khách không còn trong hàng chờ');
    await this.ds.manager.update(WalkInQueueEntry, e.id, { status: QueueStatus.CANCELLED });
    await this.audit.log(user, 'QUEUE_CANCEL', 'WalkInQueueEntry', e.id, `Bỏ khỏi hàng chờ: ${e.name}`);
  }
}
