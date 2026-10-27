import { Body, ConflictException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { InjectDataSource, InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Between, DataSource, EntityManager, In, MoreThan, Repository } from 'typeorm';
import { Employee, LeaveRequest, WorkShift } from './employee.entities';
import { AppointmentItem } from '../appointments/appointment.entities';
import { SalonService } from '../catalog/service.entity';
import { UserAccount } from '../auth/user-account.entity';
import { AuthService } from '../auth/auth.module';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { BLOCKING_STATUSES, EmployeePosition, EmployeeStatus, LeaveRequestStatus, Role, ShiftStatus, STAFF_ROLES } from '../common/enums';
import { PASSWORD_MSG, PASSWORD_RULE, PHONE_MSG, PHONE_RE } from '../common/validation';
import { AuditService, CodeService } from '../common/shared.services';
import { BusinessRuleError } from '../common/business.error';
import { minutesOf, vnDateString, vnTimeString } from '../common/time';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AppointmentsService } from '../appointments/appointments.service';
import { BusinessRulesConfig } from '../common/business-rules.config';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class EmployeeDto {
  @IsString() fullName: string;
  @IsOptional() @Matches(PHONE_RE, { message: PHONE_MSG }) phone?: string;
  @IsEnum(EmployeePosition) position: EmployeePosition;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @IsOptional() @IsBoolean() publicProfile?: boolean;
  @IsOptional() @IsArray() @IsInt({ each: true }) skillIds?: number[];
  /** Chính sách hoa hồng riêng (0..1 trên giá dịch vụ); bỏ trống = theo từng dịch vụ. */
  @IsOptional() @IsNumber() @Min(0) @Max(1) commissionRate?: number | null;
  /** Tạo luôn tài khoản đăng nhập (username = mã nhân viên) */
  @IsOptional() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @Matches(PHONE_RE, { message: PHONE_MSG }) phone?: string;
  @IsOptional() @IsEnum(EmployeePosition) position?: EmployeePosition;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @IsOptional() @IsBoolean() publicProfile?: boolean;
  @IsOptional() @IsArray() @IsInt({ each: true }) skillIds?: number[];
  @IsOptional() @IsNumber() @Min(0) @Max(1) commissionRate?: number | null;
  @IsOptional() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password?: string;
}

export class UpdateMyProfileDto {
  @IsOptional() @Matches(PHONE_RE, { message: PHONE_MSG }) phone?: string;
  @IsOptional() @IsString() bio?: string;
}

export class ShiftDto {
  @IsInt() employeeId: number;
  @IsDateString() date: string;
  @Matches(TIME) startTime: string;
  @Matches(TIME) endTime: string;
  @IsOptional() @IsEnum(ShiftStatus) status?: ShiftStatus;
  @IsOptional() @IsString() note?: string;
}

export class BulkShiftDto {
  @IsArray() @ArrayNotEmpty() @IsInt({ each: true }) employeeIds: number[];
  @IsDateString() from: string;
  @IsDateString() to: string;
  /** 0 = CN ... 6 = T7 */
  @IsArray() @ArrayNotEmpty() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekdays: number[];
  @Matches(TIME) startTime: string;
  @Matches(TIME) endTime: string;
}

export class UpdateShiftDto {
  @IsOptional() @Matches(TIME) startTime?: string;
  @IsOptional() @Matches(TIME) endTime?: string;
  @IsOptional() @IsEnum(ShiftStatus) status?: ShiftStatus;
  @IsOptional() @IsString() note?: string;
}

export class LeaveDecisionDto {
  @IsOptional() @IsString() note?: string;
}

export class LeaveDto {
  @IsDateString() date: string;
  @Matches(TIME) from: string;
  @Matches(TIME) to: string;
  @IsOptional() @IsString() reason?: string;
}

const POSITION_ROLE: Record<EmployeePosition, Role> = {
  [EmployeePosition.OWNER]: Role.OWNER,
  [EmployeePosition.RECEPTIONIST]: Role.RECEPTIONIST,
  [EmployeePosition.STYLIST]: Role.STYLIST,
  [EmployeePosition.ASSISTANT]: Role.ASSISTANT,
};

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    @InjectRepository(WorkShift) private readonly shifts: Repository<WorkShift>,
    @InjectRepository(SalonService) private readonly services: Repository<SalonService>,
    @InjectRepository(UserAccount) private readonly accounts: Repository<UserAccount>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly codes: CodeService,
    private readonly audit: AuditService,
    private readonly rules: BusinessRulesConfig,
    private readonly appointments: AppointmentsService,
  ) {}

  async list() {
    const list = await this.employees.find({ relations: { skills: true }, order: { position: 'ASC', id: 'ASC' } });
    const accs = await this.accounts.find({ where: { employee: { id: In(list.map((e) => e.id)) } } });
    return list.map((e) => ({ ...e, username: accs.find((a) => a.employee?.id === e.id)?.username ?? null }));
  }

  async get(id: number) {
    const e = await this.employees.findOne({ where: { id }, relations: { skills: true } });
    if (!e) throw new NotFoundException('Không tìm thấy nhân viên');
    return e;
  }

  async create(dto: EmployeeDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const prefix = dto.position === EmployeePosition.ASSISTANT ? 'TP' : dto.position === EmployeePosition.STYLIST ? 'ST' : 'NV';
      const e = m.create(Employee, { ...dto, code: await this.codes.next(prefix, m, 3) });
      e.skills = dto.skillIds?.length ? await m.findBy(SalonService, { id: In(dto.skillIds) }) : [];
      const saved = await m.save(e);
      if (dto.password) {
        await m.save(m.create(UserAccount, { username: saved.code, passwordHash: await AuthService.hash(dto.password), role: POSITION_ROLE[dto.position], employee: saved, mustChangePassword: true }));
      }
      await this.audit.log(user, 'EMPLOYEE_CREATE', 'Employee', saved.id, `Thêm nhân viên ${saved.code} ${saved.fullName}`, null, null, m);
      return saved;
    });
  }

  /**
   * Nhân viên thôi nhận lịch (nghỉ phép, nghỉ việc, đổi sang chức vụ không phục vụ): xếp lại mọi lịch tương lai
   * của họ như khi nghỉ cả ngày; đang phục vụ khách thì chặn (cả thao tác bị hoàn lại).
   */
  private async releaseFutureAppointments(m: EntityManager, e: Employee) {
    const items = await m.find(AppointmentItem, {
      where: [
        { leadStylist: { id: e.id }, startAt: MoreThan(this.appointments.now()), appointment: { status: In(BLOCKING_STATUSES) } },
        { assistant: { id: e.id }, startAt: MoreThan(this.appointments.now()), appointment: { status: In(BLOCKING_STATUSES) } },
      ],
    });
    const results = [];
    for (const date of [...new Set(items.map((i) => vnDateString(i.startAt)))].sort()) {
      results.push(...(await this.appointments.rearrangeForLeave(m, e, date, this.rules.openTime, this.rules.closeTime, 'không còn nhận lịch')));
    }
    return results;
  }

  async update(id: number, dto: UpdateEmployeeDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const e = await m.findOne(Employee, { where: { id }, relations: { skills: true } });
      if (!e) throw new NotFoundException('Không tìm thấy nhân viên');
      const before = { position: e.position, status: e.status, commissionRate: e.commissionRate };
      const { skillIds, password, ...rest } = dto;
      Object.assign(e, rest);
      if (skillIds) e.skills = skillIds.length ? await m.findBy(SalonService, { id: In(skillIds) }) : [];
      const saved = await m.save(e);
      const acc = await m.findOne(UserAccount, { where: { employee: { id } } });
      if (acc) {
        acc.role = POSITION_ROLE[saved.position];
        acc.active = saved.status !== EmployeeStatus.INACTIVE;
        if (password) {
          acc.passwordHash = await AuthService.hash(password);
          acc.mustChangePassword = true;
        }
        await m.save(acc);
      } else if (password) {
        await m.save(m.create(UserAccount, { username: saved.code, passwordHash: await AuthService.hash(password), role: POSITION_ROLE[saved.position], employee: saved, mustChangePassword: true }));
      }
      const serves = (x: { position: EmployeePosition; status: EmployeeStatus }) =>
        x.status === EmployeeStatus.ACTIVE && (x.position === EmployeePosition.STYLIST || x.position === EmployeePosition.ASSISTANT);
      const rearranged = serves(before) && !serves(saved) ? await this.releaseFutureAppointments(m, saved) : [];
      await this.audit.log(user, 'EMPLOYEE_UPDATE', 'Employee', id, `Cập nhật nhân viên ${saved.code}${rearranged.length ? `, xếp lại ${rearranged.length} lịch` : ''}`, before, { ...rest, skillIds }, m);
      return Object.assign(saved, { rearranged });
    });
  }

  /** Nhân viên xem/sửa hồ sơ của chính mình (SĐT, giới thiệu). */
  async myProfile(employeeId: number) {
    const e = await this.get(employeeId);
    const acc = await this.accounts.findOne({ where: { employee: { id: employeeId } } });
    return { ...e, username: acc?.username ?? null, lastLoginAt: acc?.lastLoginAt ?? null };
  }

  async updateMyProfile(employeeId: number, dto: UpdateMyProfileDto) {
    const e = await this.get(employeeId);
    if (dto.phone !== undefined) e.phone = dto.phone;
    if (dto.bio !== undefined) e.bio = dto.bio;
    await this.employees.save(e);
    return this.myProfile(employeeId);
  }

  listShifts(from: string, to: string, employeeId?: number) {
    return this.shifts.find({
      where: { date: Between(from, to), ...(employeeId ? { employee: { id: employeeId } } : {}) },
      order: { date: 'ASC', startTime: 'ASC' },
    });
  }

  private validateShift(start: string, end: string) {
    if (minutesOf(end) <= minutesOf(start)) throw new BusinessRuleError('BR-02', 'Giờ kết thúc ca phải sau giờ bắt đầu');
    if (minutesOf(start) < minutesOf(this.rules.openTime) || minutesOf(end) > minutesOf(this.rules.closeTime)) {
      throw new BusinessRuleError('BR-03', `Ca phải nằm trong giờ hoạt động ${this.rules.openTime}–${this.rules.closeTime}`);
    }
  }

  async createShift(dto: ShiftDto, user: AuthUser) {
    this.validateShift(dto.startTime, dto.endTime);
    const employee = await this.get(dto.employeeId);
    const exists = await this.shifts.findOne({ where: { employee: { id: employee.id }, date: dto.date } });
    if (exists) throw new ConflictException('Nhân viên đã có ca trong ngày này — hãy sửa ca hiện có');
    const saved = await this.shifts.save(this.shifts.create({ ...dto, employee }));
    await this.audit.log(user, 'SHIFT_CREATE', 'WorkShift', saved.id, `Tạo ca ${employee.fullName} ${dto.date} ${dto.startTime}–${dto.endTime}`);
    return saved;
  }

  /** Tạo ca hàng loạt theo thứ trong tuần cho một khoảng ngày (bỏ qua ngày đã có ca). */
  async bulkShifts(dto: BulkShiftDto, user: AuthUser) {
    this.validateShift(dto.startTime, dto.endTime);
    if (dto.from > dto.to) throw new BusinessRuleError('INPUT', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
    if ((Date.parse(dto.to) - Date.parse(dto.from)) / 86400000 > 92) throw new BusinessRuleError('INPUT', 'Chỉ tạo ca hàng loạt tối đa 92 ngày một lần');
    return this.ds.transaction(async (m) => {
      const ids = [...new Set(dto.employeeIds)];
      const emps = await m.findBy(Employee, { id: In(ids) });
      if (emps.length !== ids.length) throw new NotFoundException('Có nhân viên không tồn tại');
      let created = 0;
      for (let d = new Date(dto.from + 'T00:00:00Z'); d <= new Date(dto.to + 'T00:00:00Z'); d = new Date(d.getTime() + 86400000)) {
        if (!dto.weekdays.includes(d.getUTCDay())) continue;
        const date = d.toISOString().slice(0, 10);
        for (const e of emps) {
          if (await m.existsBy(WorkShift, { employee: { id: e.id }, date })) continue;
          await m.save(m.create(WorkShift, { employee: e, date, startTime: dto.startTime, endTime: dto.endTime }));
          created++;
        }
      }
      await this.audit.log(user, 'SHIFT_BULK', 'WorkShift', null, `Tạo ${created} ca ${dto.startTime}–${dto.endTime} từ ${dto.from} đến ${dto.to}`, null, dto, m);
      return { created };
    });
  }

  /**
   * Sau khi ca của thợ trong ngày bị đổi/xóa: xếp lại mọi lịch chưa check-in nằm ngoài giờ còn làm việc
   * (coi phần giờ mở cửa không có ca là nghỉ). Đang phục vụ trong phần bị cắt thì chặn thao tác.
   */
  private async reconcileDay(m: EntityManager, e: Employee, date: string) {
    if (date < vnDateString(this.appointments.now()) || (e.position !== EmployeePosition.STYLIST && e.position !== EmployeePosition.ASSISTANT)) return [];
    const shift = await m.findOne(WorkShift, { where: { employee: { id: e.id }, date } });
    const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
    const off: [number, number][] = [];
    let cur = minutesOf(this.rules.openTime);
    for (const r of (shift?.workRanges() ?? []).sort((x, y) => x.start - y.start)) {
      if (r.start > cur) off.push([cur, r.start]);
      cur = Math.max(cur, r.end);
    }
    if (cur < minutesOf(this.rules.closeTime)) off.push([cur, minutesOf(this.rules.closeTime)]);
    const results = [];
    for (const [from, to] of off) results.push(...(await this.appointments.rearrangeForLeave(m, e, date, hhmm(from), hhmm(to), 'đổi ca làm việc')));
    return results;
  }

  /** Cập nhật ca (đổi giờ, báo nghỉ đột xuất). Mọi thay đổi làm lịch khách nằm ngoài ca đều được xếp lại. */
  async updateShift(id: number, dto: UpdateShiftDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const s = await m.findOne(WorkShift, { where: { id } });
      if (!s) throw new NotFoundException('Không tìm thấy ca');
      const before = { startTime: s.startTime, endTime: s.endTime, status: s.status };
      Object.assign(s, dto);
      this.validateShift(s.startTime, s.endTime);
      const saved = await m.save(s);
      await this.audit.log(user, dto.status === ShiftStatus.ABSENT && before.status === ShiftStatus.SCHEDULED ? 'SHIFT_ABSENT' : 'SHIFT_UPDATE', 'WorkShift', id, `Ca ${s.employee.fullName} ngày ${s.date}: ${before.startTime}–${before.endTime} (${before.status}) → ${s.startTime}–${s.endTime} (${s.status})`, before, dto, m);
      const rearranged = await this.reconcileDay(m, s.employee, s.date);
      return Object.assign(saved, { rearranged });
    });
  }

  /** Thợ gửi yêu cầu nghỉ giữa ca (hoặc cả ca); chỉ áp dụng và xếp lại lịch khách sau khi chủ salon duyệt. */
  async requestLeave(employeeId: number, dto: LeaveDto, user: AuthUser) {
    const m = this.ds.manager;
    const s = await m.findOne(WorkShift, { where: { employee: { id: employeeId }, date: dto.date } });
    if (!s || s.status !== ShiftStatus.SCHEDULED) throw new BusinessRuleError('LEAVE', 'Bạn không có ca làm việc ngày này');
    if (dto.date < vnDateString(new Date())) throw new BusinessRuleError('LEAVE', 'Không xin nghỉ cho ngày đã qua');
    if (minutesOf(dto.to) <= minutesOf(dto.from)) throw new BusinessRuleError('LEAVE', 'Giờ kết thúc nghỉ phải sau giờ bắt đầu');
    if (await m.existsBy(LeaveRequest, { employee: { id: employeeId }, date: dto.date, status: LeaveRequestStatus.PENDING })) {
      throw new BusinessRuleError('LEAVE', 'Bạn đã có yêu cầu nghỉ ngày này đang chờ duyệt');
    }
    const req = await m.save(m.create(LeaveRequest, { employee: s.employee, date: dto.date, fromTime: dto.from, toTime: dto.to, reason: dto.reason?.trim() || null }));
    await this.audit.log(user, 'LEAVE_REQUEST', 'LeaveRequest', req.id, `${s.employee.fullName} xin nghỉ ${dto.date} ${dto.from}–${dto.to}${req.reason ? ': ' + req.reason : ''}`);
    return req;
  }

  listLeaveRequests(status?: LeaveRequestStatus, employeeId?: number) {
    return this.ds.manager.find(LeaveRequest, {
      where: { ...(status ? { status } : {}), ...(employeeId ? { employee: { id: employeeId } } : {}) },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  private async pendingRequest(m: EntityManager, id: number) {
    const r = await m.findOne(LeaveRequest, { where: { id } });
    if (!r) throw new NotFoundException('Không tìm thấy yêu cầu nghỉ');
    if (r.status !== LeaveRequestStatus.PENDING) throw new BusinessRuleError('LEAVE', 'Yêu cầu này đã được xử lý');
    return r;
  }

  async rejectLeave(id: number, dto: LeaveDecisionDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const r = await this.pendingRequest(m, id);
      Object.assign(r, { status: LeaveRequestStatus.REJECTED, handledBy: user.name, handledAt: new Date(), handledNote: dto.note ?? null });
      await m.save(r);
      await this.audit.log(user, 'LEAVE_REJECT', 'LeaveRequest', id, `Từ chối nghỉ của ${r.employee.fullName} ${r.date}${dto.note ? ': ' + dto.note : ''}`, null, null, m);
      return r;
    });
  }

  /** Duyệt: áp dụng nghỉ vào ca và xếp lại lịch khách trong khoảng nghỉ (thợ nghỉ cả ca thì ca chuyển ABSENT). */
  async approveLeave(id: number, dto: LeaveDecisionDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const r = await this.pendingRequest(m, id);
      const s = await m.findOne(WorkShift, { where: { employee: { id: r.employee.id }, date: r.date } });
      if (!s || s.status !== ShiftStatus.SCHEDULED) throw new BusinessRuleError('LEAVE', 'Nhân viên không còn ca làm việc ngày này');
      if (s.leaveStart) throw new BusinessRuleError('LEAVE', `Ca này đã có giờ nghỉ ${s.leaveStart}–${s.leaveEnd}`);
      const now = this.appointments.now();
      if (r.date < vnDateString(now)) throw new BusinessRuleError('LEAVE', 'Ngày xin nghỉ đã qua');
      const from = minutesOf(r.fromTime) < minutesOf(s.startTime) ? s.startTime : r.fromTime;
      const to = minutesOf(r.toTime) > minutesOf(s.endTime) ? s.endTime : r.toTime;
      if (minutesOf(to) <= minutesOf(from)) throw new BusinessRuleError('LEAVE', `Khoảng nghỉ phải nằm trong ca ${s.startTime}–${s.endTime}`);
      if (r.date === vnDateString(now) && minutesOf(to) <= minutesOf(vnTimeString(now))) throw new BusinessRuleError('LEAVE', 'Khoảng nghỉ đã qua');
      if (from === s.startTime && to === s.endTime) {
        s.status = ShiftStatus.ABSENT;
        s.note = r.reason;
      } else {
        Object.assign(s, { leaveStart: from, leaveEnd: to, leaveReason: r.reason });
      }
      await m.save(s);
      Object.assign(r, { status: LeaveRequestStatus.APPROVED, handledBy: user.name, handledAt: now, handledNote: dto.note ?? null });
      await m.save(r);
      await this.audit.log(user, 'LEAVE_APPROVE', 'LeaveRequest', id, `Duyệt nghỉ ${s.employee.fullName} ${s.date} ${from}–${to}${r.reason ? ': ' + r.reason : ''}`, null, null, m);
      const rearranged = await this.appointments.rearrangeForLeave(m, s.employee, s.date, from, to, r.reason);
      return { request: r, shift: s, rearranged };
    });
  }

  async deleteShift(id: number, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const s = await m.findOne(WorkShift, { where: { id } });
      if (!s) throw new NotFoundException('Không tìm thấy ca');
      await m.delete(WorkShift, id);
      const rearranged = await this.reconcileDay(m, s.employee, s.date);
      await this.audit.log(user, 'SHIFT_DELETE', 'WorkShift', id, `Xóa ca ${s.employee.fullName} ngày ${s.date} ${s.startTime}–${s.endTime}${rearranged.length ? `, xếp lại ${rearranged.length} lịch` : ''}`, null, null, m);
      return { ok: true, rearranged };
    });
  }
}

@ApiTags('employees')
@Controller()
export class EmployeesController {
  constructor(private readonly svc: EmployeesService) {}

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Get('employees')
  list() {
    return this.svc.list();
  }

  @Roles(...STAFF_ROLES) @Get('employees/me')
  me(@CurrentUser() u: AuthUser) {
    return this.svc.myProfile(u.employeeId!);
  }

  @Roles(...STAFF_ROLES) @Patch('employees/me')
  updateMe(@CurrentUser() u: AuthUser, @Body() dto: UpdateMyProfileDto) {
    return this.svc.updateMyProfile(u.employeeId!, dto);
  }

  @Roles(Role.OWNER) @Post('employees')
  create(@Body() dto: EmployeeDto, @CurrentUser() u: AuthUser) {
    return this.svc.create(dto, u);
  }

  @Roles(Role.OWNER) @Patch('employees/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEmployeeDto, @CurrentUser() u: AuthUser) {
    return this.svc.update(id, dto, u);
  }

  @Roles(...STAFF_ROLES) @Get('shifts')
  shifts(@Query('from') from: string, @Query('to') to: string, @Query('employeeId') employeeId?: string) {
    return this.svc.listShifts(from, to, employeeId ? Number(employeeId) : undefined);
  }

  @Roles(...STAFF_ROLES) @Get('shifts/mine')
  myShifts(@CurrentUser() u: AuthUser, @Query('from') from: string, @Query('to') to: string) {
    return this.svc.listShifts(from, to, u.employeeId ?? -1);
  }

  @Roles(Role.STYLIST, Role.ASSISTANT) @Post('shifts/mine/leave')
  leave(@CurrentUser() u: AuthUser, @Body() dto: LeaveDto) {
    return this.svc.requestLeave(u.employeeId!, dto, u);
  }

  @Roles(Role.STYLIST, Role.ASSISTANT) @Get('leave-requests/mine')
  myLeaves(@CurrentUser() u: AuthUser) {
    return this.svc.listLeaveRequests(undefined, u.employeeId!);
  }

  @Roles(Role.OWNER) @Get('leave-requests')
  leaves(@Query('status') status?: LeaveRequestStatus) {
    return this.svc.listLeaveRequests(status);
  }

  @Roles(Role.OWNER) @Post('leave-requests/:id/approve')
  approveLeave(@Param('id', ParseIntPipe) id: number, @Body() dto: LeaveDecisionDto, @CurrentUser() u: AuthUser) {
    return this.svc.approveLeave(id, dto, u);
  }

  @Roles(Role.OWNER) @Post('leave-requests/:id/reject')
  rejectLeave(@Param('id', ParseIntPipe) id: number, @Body() dto: LeaveDecisionDto, @CurrentUser() u: AuthUser) {
    return this.svc.rejectLeave(id, dto, u);
  }

  @Roles(Role.OWNER) @Post('shifts')
  createShift(@Body() dto: ShiftDto, @CurrentUser() u: AuthUser) {
    return this.svc.createShift(dto, u);
  }

  @Roles(Role.OWNER) @Post('shifts/bulk')
  bulk(@Body() dto: BulkShiftDto, @CurrentUser() u: AuthUser) {
    return this.svc.bulkShifts(dto, u);
  }

  @Roles(Role.OWNER) @Patch('shifts/:id')
  updateShift(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateShiftDto, @CurrentUser() u: AuthUser) {
    return this.svc.updateShift(id, dto, u);
  }

  @Roles(Role.OWNER) @Delete('shifts/:id')
  deleteShift(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.deleteShift(id, u);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Employee, WorkShift, LeaveRequest, SalonService, UserAccount]), AppointmentsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
