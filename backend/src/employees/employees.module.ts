import { Body, ConflictException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { InjectDataSource, InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Between, DataSource, In, Repository } from 'typeorm';
import { Employee, WorkShift } from './employee.entities';
import { SalonService } from '../catalog/service.entity';
import { UserAccount } from '../auth/user-account.entity';
import { AuthService } from '../auth/auth.module';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { EmployeePosition, EmployeeStatus, Role, ShiftStatus, STAFF_ROLES } from '../common/enums';
import { AuditService, CodeService } from '../common/shared.services';
import { BusinessRuleError } from '../common/business.error';
import { minutesOf, vnDateString, vnTimeString } from '../common/time';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AppointmentsService } from '../appointments/appointments.service';
import { BusinessRulesConfig } from '../common/business-rules.config';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class EmployeeDto {
  @IsString() fullName: string;
  @IsOptional() @IsString() phone?: string;
  @IsEnum(EmployeePosition) position: EmployeePosition;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @IsOptional() @IsBoolean() publicProfile?: boolean;
  @IsOptional() @IsArray() @IsInt({ each: true }) skillIds?: number[];
  /** Tạo luôn tài khoản đăng nhập (username = mã nhân viên) */
  @IsOptional() @IsString() @MinLength(6) password?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(EmployeePosition) position?: EmployeePosition;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @IsOptional() @IsBoolean() publicProfile?: boolean;
  @IsOptional() @IsArray() @IsInt({ each: true }) skillIds?: number[];
  @IsOptional() @IsString() @MinLength(6) password?: string;
}

export class UpdateMyProfileDto {
  @IsOptional() @Matches(/^0\d{9,10}$/, { message: 'Số điện thoại không hợp lệ' }) phone?: string;
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
  @IsArray() @IsInt({ each: true }) employeeIds: number[];
  @IsDateString() from: string;
  @IsDateString() to: string;
  /** 0 = CN ... 6 = T7 */
  @IsArray() @IsInt({ each: true }) weekdays: number[];
  @Matches(TIME) startTime: string;
  @Matches(TIME) endTime: string;
}

export class UpdateShiftDto {
  @IsOptional() @Matches(TIME) startTime?: string;
  @IsOptional() @Matches(TIME) endTime?: string;
  @IsOptional() @IsEnum(ShiftStatus) status?: ShiftStatus;
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

  async update(id: number, dto: UpdateEmployeeDto, user: AuthUser) {
    const e = await this.get(id);
    const { skillIds, password, ...rest } = dto;
    Object.assign(e, rest);
    if (skillIds) e.skills = skillIds.length ? await this.services.findBy({ id: In(skillIds) }) : [];
    const saved = await this.employees.save(e);
    const acc = await this.accounts.findOne({ where: { employee: { id } } });
    if (acc) {
      acc.role = POSITION_ROLE[saved.position];
      acc.active = saved.status !== EmployeeStatus.INACTIVE;
      if (password) {
        acc.passwordHash = await AuthService.hash(password);
        acc.mustChangePassword = true;
      }
      await this.accounts.save(acc);
    } else if (password) {
      await this.accounts.save(this.accounts.create({ username: saved.code, passwordHash: await AuthService.hash(password), role: POSITION_ROLE[saved.position], employee: saved, mustChangePassword: true }));
    }
    await this.audit.log(user, 'EMPLOYEE_UPDATE', 'Employee', id, `Cập nhật nhân viên ${saved.code}`, null, rest);
    return saved;
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

  async createShift(dto: ShiftDto) {
    this.validateShift(dto.startTime, dto.endTime);
    const employee = await this.get(dto.employeeId);
    const exists = await this.shifts.findOne({ where: { employee: { id: employee.id }, date: dto.date } });
    if (exists) throw new ConflictException('Nhân viên đã có ca trong ngày này — hãy sửa ca hiện có');
    return this.shifts.save(this.shifts.create({ ...dto, employee }));
  }

  /** Tạo ca hàng loạt theo thứ trong tuần cho một khoảng ngày (bỏ qua ngày đã có ca). */
  async bulkShifts(dto: BulkShiftDto) {
    this.validateShift(dto.startTime, dto.endTime);
    const emps = await this.employees.findBy({ id: In(dto.employeeIds) });
    const created: WorkShift[] = [];
    for (let d = new Date(dto.from + 'T00:00:00Z'); d <= new Date(dto.to + 'T00:00:00Z'); d = new Date(d.getTime() + 86400000)) {
      if (!dto.weekdays.includes(d.getUTCDay())) continue;
      const date = d.toISOString().slice(0, 10);
      for (const e of emps) {
        const exists = await this.shifts.findOne({ where: { employee: { id: e.id }, date } });
        if (!exists) created.push(await this.shifts.save(this.shifts.create({ employee: e, date, startTime: dto.startTime, endTime: dto.endTime })));
      }
    }
    return { created: created.length };
  }

  /** Cập nhật ca (đổi giờ, báo nghỉ đột xuất). Nghỉ cả ca → tự xếp lại lịch khách bị ảnh hưởng. */
  async updateShift(id: number, dto: UpdateShiftDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const s = await m.findOne(WorkShift, { where: { id } });
      if (!s) throw new NotFoundException('Không tìm thấy ca');
      const wasScheduled = s.status === ShiftStatus.SCHEDULED;
      Object.assign(s, dto);
      this.validateShift(s.startTime, s.endTime);
      const saved = await m.save(s);
      if (dto.status === ShiftStatus.ABSENT && wasScheduled) {
        await this.audit.log(user, 'SHIFT_ABSENT', 'WorkShift', id, `${s.employee.fullName} nghỉ ngày ${s.date}`, null, null, m);
        await this.appointments.rearrangeForLeave(m, s.employee, s.date, s.startTime, s.endTime, s.note);
      }
      return saved;
    });
  }

  /**
   * Thợ tự xin nghỉ giữa ca (hoặc cả ca) — áp dụng ngay, lịch khách trong khoảng nghỉ được xếp lại tự động.
   * ponytail: không có bước duyệt; thêm trạng thái chờ duyệt nếu chủ salon muốn kiểm soát.
   */
  async requestLeave(employeeId: number, dto: LeaveDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const s = await m.findOne(WorkShift, { where: { employee: { id: employeeId }, date: dto.date } });
      if (!s || s.status !== ShiftStatus.SCHEDULED) throw new BusinessRuleError('LEAVE', 'Bạn không có ca làm việc ngày này');
      if (s.leaveStart) throw new BusinessRuleError('LEAVE', `Đã xin nghỉ ${s.leaveStart}–${s.leaveEnd} trong ca này — liên hệ chủ salon nếu cần đổi`);
      const now = new Date();
      const today = vnDateString(now);
      if (dto.date < today) throw new BusinessRuleError('LEAVE', 'Không xin nghỉ cho ngày đã qua');
      const from = minutesOf(dto.from) < minutesOf(s.startTime) ? s.startTime : dto.from;
      const to = minutesOf(dto.to) > minutesOf(s.endTime) ? s.endTime : dto.to;
      if (minutesOf(to) <= minutesOf(from)) throw new BusinessRuleError('LEAVE', `Khoảng nghỉ phải nằm trong ca ${s.startTime}–${s.endTime}`);
      if (dto.date === today && minutesOf(to) <= minutesOf(vnTimeString(now))) throw new BusinessRuleError('LEAVE', 'Khoảng nghỉ đã qua');
      const reason = dto.reason?.trim() || null;
      if (from === s.startTime && to === s.endTime) {
        s.status = ShiftStatus.ABSENT;
        s.note = reason;
      } else {
        Object.assign(s, { leaveStart: from, leaveEnd: to, leaveReason: reason });
      }
      await m.save(s);
      await this.audit.log(user, 'SHIFT_LEAVE', 'WorkShift', s.id, `${s.employee.fullName} xin nghỉ ${s.date} ${from}–${to}${reason ? ': ' + reason : ''}`, null, null, m);
      const rearranged = await this.appointments.rearrangeForLeave(m, s.employee, s.date, from, to, reason);
      return { shift: s, rearranged };
    });
  }

  async deleteShift(id: number) {
    await this.shifts.delete(id);
    return { ok: true };
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

  @Roles(Role.OWNER) @Post('shifts')
  createShift(@Body() dto: ShiftDto) {
    return this.svc.createShift(dto);
  }

  @Roles(Role.OWNER) @Post('shifts/bulk')
  bulk(@Body() dto: BulkShiftDto) {
    return this.svc.bulkShifts(dto);
  }

  @Roles(Role.OWNER) @Patch('shifts/:id')
  updateShift(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateShiftDto, @CurrentUser() u: AuthUser) {
    return this.svc.updateShift(id, dto, u);
  }

  @Roles(Role.OWNER) @Delete('shifts/:id')
  deleteShift(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteShift(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Employee, WorkShift, SalonService, UserAccount]), AppointmentsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
