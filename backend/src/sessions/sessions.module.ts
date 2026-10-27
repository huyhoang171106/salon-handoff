import { Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { DataSource, EntityManager, In } from 'typeorm';
import { freeChairs } from './chairs';
import { ServiceAssignment, ServiceSession, ServiceSessionItem } from './session.entities';
import { SalonService } from '../catalog/service.entity';
import { Employee } from '../employees/employee.entities';
import { Appointment } from '../appointments/appointment.entities';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AppointmentsService } from '../appointments/appointments.service';
import { Customer } from '../customers/customer.entity';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { AppointmentStatus, AssignmentRole, EmployeePosition, Role, SessionItemStatus, SessionStatus } from '../common/enums';
import { BusinessRuleError } from '../common/business.error';
import { AuditService, CodeService } from '../common/shared.services';
import { ANON_PHONE, PHONE_MSG, PHONE_RE } from '../common/validation';
import { CommissionCalculator } from '../billing/commission.calculator';

export class AssignmentDto {
  @IsInt() employeeId: number;
  @IsEnum(AssignmentRole) role: AssignmentRole;
  @IsOptional() @IsNumber() @Min(0) @Max(1) shareOverride?: number | null;
  @IsOptional() @IsInt() @Min(0) fixedFeeOverride?: number | null;
}

export class SetAssignmentsDto {
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => AssignmentDto) assignments: AssignmentDto[];
}

export class AddItemDto {
  @IsInt() serviceId: number;
  /** Giá đã báo và khách đồng ý; mặc định = giá hiện tại. */
  @IsOptional() @IsInt() @Min(0) agreedPrice?: number;
  @IsOptional() @IsInt() leadId?: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) assistantIds?: number[];
  /** Ghi nhận khách xác nhận dịch vụ phát sinh (BR-12). */
  @IsOptional() @IsString() confirmationNote?: string;
}

export class CancelSessionDto {
  @IsString() @IsNotEmpty() reason: string;
}

/** Gắn khách cho phiên walk-in: chọn hồ sơ có sẵn hoặc tạo mới theo SĐT (mục 22). */
export class SessionCustomerDto {
  @IsOptional() @IsInt() customerId?: number;
  @IsOptional() @IsString() @IsNotEmpty() fullName?: string;
  @IsOptional() @Matches(PHONE_RE, { message: PHONE_MSG }) phone?: string;
}

export class ChairDto {
  @IsOptional() @IsString() chair?: string | null;
}

export class ConfirmItemDto {
  @IsString() @IsNotEmpty() confirmationNote: string;
  @IsOptional() @IsInt() @Min(0) agreedPrice?: number;
}

@Injectable()
export class SessionsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly appts: AppointmentsService,
    private readonly codes: CodeService,
  ) {}

  async get(id: number, m: EntityManager = this.ds.manager) {
    const s = await m.findOne(ServiceSession, { where: { id } });
    if (!s) throw new NotFoundException('Không tìm thấy phiên phục vụ');
    return s;
  }

  /** Xem phiên: thợ chỉ xem được phiên mình tham gia. */
  async getFor(id: number, user: AuthUser) {
    const s = await this.get(id);
    this.assertParticipant(s, user);
    return s;
  }

  chairs() {
    return freeChairs(this.ds.manager);
  }

  /** Đổi / gỡ ghế của phiên đang phục vụ. */
  async setChair(id: number, chair: string | null, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const s = await this.get(id, m);
      if (chair && chair !== s.chair && !(await freeChairs(m)).includes(chair)) {
        throw new BusinessRuleError('BR-14', `Ghế ${chair} không trống hoặc đang hỏng/bảo trì`);
      }
      const before = s.chair;
      s.chair = chair;
      await m.save(s);
      await this.audit.log(user, 'SESSION_CHAIR', 'ServiceSession', id, `Phiên ${s.code}: ghế ${before ?? '—'} → ${chair ?? '—'}`, null, null, m);
      return s;
    });
  }

  listActive() {
    return this.ds.manager.find(ServiceSession, {
      where: { status: In([SessionStatus.OPEN, SessionStatus.IN_SERVICE, SessionStatus.AWAITING_PAYMENT]) },
      order: { createdAt: 'ASC' },
    });
  }

  async listForEmployee(employeeId: number) {
    const all = await this.listActive();
    return all.filter((s) => s.activeItems().some((i) => i.assignments.some((a) => a.employee.id === employeeId)));
  }

  private assertParticipant(s: ServiceSession, user: AuthUser) {
    if (user.role === Role.STYLIST || user.role === Role.ASSISTANT) {
      if (!s.activeItems().some((i) => i.assignments.some((a) => a.employee.id === user.employeeId))) {
        throw new ForbiddenException('Bạn không tham gia phiên phục vụ này');
      }
    }
  }

  private async setAppointmentStatus(m: EntityManager, s: ServiceSession, status: AppointmentStatus) {
    if (!s.appointment) return;
    const a = await m.findOneByOrFail(Appointment, { id: s.appointment.id });
    if (a.status !== status && a.canTransitionTo(status)) {
      a.transitionTo(status);
      await m.save(a);
    }
  }

  async start(id: number, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const s = await this.get(id, m);
      this.assertParticipant(s, user);
      if (s.status !== SessionStatus.OPEN) throw new BusinessRuleError('LIFECYCLE', 'Phiên đã bắt đầu hoặc đã kết thúc');
      s.status = SessionStatus.IN_SERVICE;
      s.startedAt = new Date();
      await m.save(s);
      await this.setAppointmentStatus(m, s, AppointmentStatus.IN_SERVICE);
      return this.get(id, m);
    });
  }

  /**
   * Thêm dịch vụ phát sinh (FR-09). Stylist đề xuất -> trạng thái PROPOSED, cần lễ tân ghi nhận khách đồng ý.
   * Lễ tân/chủ thêm kèm ghi chú xác nhận -> CONFIRMED.
   * Giờ của thợ được giữ ngay: nối vào cuối lịch, kiểm tra ca/trùng lịch (BR-01, BR-02, BR-17) và kéo dài `endAt`.
   */
  async addItem(id: number, dto: AddItemDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const s = await this.get(id, m);
      this.assertParticipant(s, user);
      if (!s.isEditable()) throw new BusinessRuleError('FR-09', 'Phiên đã chốt, không thêm dịch vụ được');
      const service = await m.findOneBy(SalonService, { id: dto.serviceId });
      if (!service) throw new NotFoundException('Không tìm thấy dịch vụ');
      if (!service.isBookable()) throw new BusinessRuleError('BR-05', 'Dịch vụ đã ngừng cung cấp');
      const leadId = dto.leadId ?? (user.role === Role.STYLIST ? user.employeeId! : s.activeItems()[0]?.lead()?.employee.id);
      if (!leadId) throw new BusinessRuleError('BR-19', 'Cần chọn thợ chính');
      const lead = await m.findOne(Employee, { where: { id: leadId }, relations: { skills: true } });
      if (!lead || lead.position !== EmployeePosition.STYLIST || !lead.isWorking()) {
        throw new BusinessRuleError('BR-04', 'Thợ chính phải là stylist đang làm việc');
      }
      if (!lead.canPerform(service.id)) throw new BusinessRuleError('BR-04', `${lead.fullName} không có chuyên môn "${service.name}"`);
      const isDesk = user.role === Role.OWNER || user.role === Role.RECEPTIONIST;
      if (isDesk && s.status === SessionStatus.IN_SERVICE && !dto.confirmationNote) {
        throw new BusinessRuleError('BR-12', 'Cần ghi nhận khách đã đồng ý dịch vụ và giá phát sinh');
      }
      const assistantIds = [...new Set(dto.assistantIds ?? [])];
      const assistants = assistantIds.length ? await m.findBy(Employee, { id: In(assistantIds) }) : [];
      if (assistants.length !== assistantIds.length || assistants.some((a) => a.position !== EmployeePosition.ASSISTANT || !a.isWorking())) {
        throw new BusinessRuleError('BR-17', 'Thợ phụ không hợp lệ hoặc không còn làm việc');
      }
      const item = m.create(ServiceSessionItem, {
        session: s,
        service,
        agreedPrice: dto.agreedPrice ?? service.basePrice,
        ...service.commissionSnapshot(),
        status: isDesk ? SessionItemStatus.CONFIRMED : SessionItemStatus.PROPOSED,
        confirmationNote: dto.confirmationNote ?? null,
        assignments: [
          m.create(ServiceAssignment, { employee: lead, role: AssignmentRole.LEAD_STYLIST }),
          ...assistants.map((a) => m.create(ServiceAssignment, { employee: a, role: AssignmentRole.ASSISTANT })),
        ],
      });
      // Báo lỗi công thức hoa hồng (BR-19) sớm, trước khi giữ giờ thợ.
      CommissionCalculator.compute(
        { ...item.commissionConfig(), price: item.agreedPrice },
        item.assignments.map((a) => ({ employeeId: a.employee.id, role: a.role, personalRate: a.employee.commissionRate })),
      );
      if (s.appointment) item.appointmentItemId = (await this.appts.extendForService(m, s.appointment.id, service, leadId, assistants[0]?.id ?? null)).id;
      await m.save(item);
      return this.get(id, m);
    });
  }

  async confirmItem(itemId: number, dto: ConfirmItemDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const item = await m.findOne(ServiceSessionItem, { where: { id: itemId }, relations: { session: true } });
      if (!item) throw new NotFoundException('Không tìm thấy dịch vụ trong phiên');
      const s = await this.get(item.session.id, m);
      if (!s.isEditable()) throw new BusinessRuleError('BR-12', 'Phiên đã chốt, không xác nhận dịch vụ được');
      if (item.status !== SessionItemStatus.PROPOSED) throw new BusinessRuleError('BR-12', 'Chỉ xác nhận được dịch vụ đang chờ khách đồng ý');
      const oldPrice = item.agreedPrice;
      item.status = SessionItemStatus.CONFIRMED;
      item.confirmationNote = dto.confirmationNote;
      if (dto.agreedPrice != null) item.agreedPrice = dto.agreedPrice;
      await m.save(item);
      await this.audit.log(user, 'SESSION_ITEM_CONFIRM', 'ServiceSessionItem', itemId, `Khách đồng ý "${item.service.name}" giá ${item.agreedPrice}${oldPrice !== item.agreedPrice ? ` (đề xuất ${oldPrice})` : ''}`, null, null, m);
      return this.get(s.id, m);
    });
  }

  async removeItem(itemId: number, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const item = await m.findOne(ServiceSessionItem, { where: { id: itemId }, relations: { session: true } });
      if (!item) throw new NotFoundException('Không tìm thấy dịch vụ trong phiên');
      const s = await this.get(item.session.id, m);
      if (!s.isEditable()) throw new BusinessRuleError('FR-09', 'Phiên đã chốt');
      if (item.status === SessionItemStatus.REMOVED) throw new BusinessRuleError('FR-09', 'Dịch vụ đã được bỏ trước đó');
      item.status = SessionItemStatus.REMOVED;
      await m.save(item);
      if (item.appointmentItemId) await this.appts.shrinkForService(m, item.appointmentItemId);
      await this.audit.log(user, 'SESSION_ITEM_REMOVE', 'ServiceSessionItem', itemId, `Bỏ "${item.service.name}" khỏi ${s.code}`, null, null, m);
      return this.get(s.id, m);
    });
  }

  /** Cập nhật phân công thợ chính / thợ phụ cho một dịch vụ (FR-10, BR-04, BR-19). */
  async setAssignments(itemId: number, dto: SetAssignmentsDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const item = await m.findOne(ServiceSessionItem, { where: { id: itemId }, relations: { session: true } });
      if (!item) throw new NotFoundException('Không tìm thấy dịch vụ trong phiên');
      const session = await m.findOneByOrFail(ServiceSession, { id: item.session.id });
      if (!session.isEditable()) throw new BusinessRuleError('FR-10', 'Phiên đã chốt, không đổi phân công được');
      const emps = await m.find(Employee, { where: { id: In(dto.assignments.map((a) => a.employeeId)) }, relations: { skills: true } });
      for (const a of dto.assignments) {
        const e = emps.find((x) => x.id === a.employeeId);
        if (!e) throw new NotFoundException('Không tìm thấy nhân viên');
        if (!e.isWorking()) throw new BusinessRuleError('BR-04', `${e.fullName} không còn làm việc`);
        if (a.role === AssignmentRole.LEAD_STYLIST && (e.position !== EmployeePosition.STYLIST || !e.canPerform(item.service.id))) {
          throw new BusinessRuleError('BR-04', `${e.fullName} không thể làm thợ chính cho "${item.service.name}"`);
        }
      }
      // Kiểm tra trước công thức chia (BR-19) theo cấu hình đã chốt của dòng, để báo lỗi sớm
      CommissionCalculator.compute(
        { ...item.commissionConfig(), price: item.agreedPrice },
        dto.assignments.map((a) => ({ ...a, personalRate: emps.find((x) => x.id === a.employeeId)!.commissionRate })),
      );
      await m.delete(ServiceAssignment, { item: { id: itemId } });
      for (const a of dto.assignments) {
        await m.save(m.create(ServiceAssignment, { item: { id: itemId } as ServiceSessionItem, employee: emps.find((x) => x.id === a.employeeId)!, role: a.role, shareOverride: a.shareOverride ?? null, fixedFeeOverride: a.fixedFeeOverride ?? null }));
      }
      await this.audit.log(user, 'ASSIGNMENT_UPDATE', 'ServiceSessionItem', itemId, `Đổi phân công "${item.service.name}" trong ${session.code}`, null, dto.assignments, m);
      return m.findOneByOrFail(ServiceSession, { id: session.id });
    });
  }

  /** Hủy phiên tiếp nhận nhầm (chưa có hóa đơn); lịch hẹn liên quan chuyển Đã hủy, cọc (nếu có) hoàn lại khách. */
  async cancel(id: number, reason: string, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const s = await this.get(id, m);
      if (!s.isEditable()) throw new BusinessRuleError('LIFECYCLE', 'Chỉ hủy được phiên chưa hoàn tất');
      const [inv]: { code: string }[] = await m.query(`SELECT code FROM invoices WHERE "sessionId" = $1 AND status <> 'CANCELLED' LIMIT 1`, [id]);
      if (inv) throw new BusinessRuleError('LIFECYCLE', `Phiên đã có hóa đơn ${inv.code} — hủy hóa đơn trước`);
      s.status = SessionStatus.CANCELLED;
      await m.save(s);
      let note = '';
      if (s.appointment) {
        const a = await m.findOneByOrFail(Appointment, { id: s.appointment.id });
        a.transitionTo(AppointmentStatus.CANCELLED, reason);
        if (a.settleDeposit(true)) note = ` — hoàn cọc ${a.depositAmount} cho khách`;
        await m.save(a);
      }
      await this.audit.log(user, 'SESSION_CANCEL', 'ServiceSession', id, `Hủy phiên ${s.code}: ${reason}${note}`, null, null, m);
      return this.get(id, m);
    });
  }

  /**
   * Mở lại phiên đã chốt để sửa dịch vụ (FR-13, ngoại lệ 12). Hóa đơn của phiên phải được hủy trước
   * (hóa đơn đã thu tiền: hủy kèm xác nhận hoàn tiền), nên hoa hồng/kho/điểm đã được hoàn tác.
   */
  async reopen(id: number, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const s = await this.get(id, m);
      if (s.status !== SessionStatus.AWAITING_PAYMENT) throw new BusinessRuleError('LIFECYCLE', 'Chỉ mở lại được phiên đang chờ thanh toán');
      const [inv]: { code: string }[] = await m.query(`SELECT code FROM invoices WHERE "sessionId" = $1 AND status <> 'CANCELLED' LIMIT 1`, [id]);
      if (inv) throw new BusinessRuleError('LIFECYCLE', `Hóa đơn ${inv.code} còn hiệu lực — hủy hóa đơn trước khi mở lại phiên`);
      for (const i of s.items.filter((x) => x.status === SessionItemStatus.DONE)) {
        i.status = SessionItemStatus.CONFIRMED;
        i.assignments.forEach((a) => (a.performedAt = null));
      }
      s.status = SessionStatus.IN_SERVICE;
      s.finishedAt = null;
      await m.save(s);
      await this.audit.log(user, 'SESSION_REOPEN', 'ServiceSession', id, `Mở lại phiên ${s.code} để chỉnh sửa`, null, null, m);
      return this.get(id, m);
    });
  }

  /** Gắn hồ sơ khách thật cho phiên walk-in vãng lai (chưa lập hóa đơn) để tích điểm, khuyến mãi, lịch sử (mục 22). */
  async setCustomer(id: number, dto: SessionCustomerDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const s = await this.get(id, m);
      if (s.status === SessionStatus.COMPLETED || s.status === SessionStatus.CANCELLED) throw new BusinessRuleError('LIFECYCLE', 'Phiên đã kết thúc');
      if (s.customer && !s.customer.isAnonymous) throw new BusinessRuleError('LIFECYCLE', 'Phiên đã gắn khách');
      const [inv]: { code: string }[] = await m.query(`SELECT code FROM invoices WHERE "sessionId" = $1 AND status <> 'CANCELLED' LIMIT 1`, [id]);
      if (inv) throw new BusinessRuleError('LIFECYCLE', `Phiên đã có hóa đơn ${inv.code} — hủy hóa đơn trước khi đổi khách`);
      let customer: Customer | null;
      if (dto.customerId) {
        customer = await m.findOneBy(Customer, { id: dto.customerId });
        if (!customer || customer.isAnonymous) throw new NotFoundException('Không tìm thấy khách');
      } else {
        if (!dto.phone || !dto.fullName) throw new BusinessRuleError('INPUT', 'Cần chọn khách hoặc nhập họ tên và số điện thoại');
        if (dto.phone === ANON_PHONE) throw new BusinessRuleError('INPUT', 'Số điện thoại không hợp lệ');
        customer = (await m.findOneBy(Customer, { phone: dto.phone })) ?? (await m.save(m.create(Customer, { code: await this.codes.next('KH', m), fullName: dto.fullName, phone: dto.phone })));
      }
      s.customer = customer;
      s.walkInName = null;
      await m.save(s);
      if (s.appointment) await m.update(Appointment, s.appointment.id, { customer: { id: customer.id } });
      await this.audit.log(user, 'SESSION_SET_CUSTOMER', 'ServiceSession', id, `Gắn khách ${customer.fullName} (${customer.code}) cho phiên ${s.code}`, null, null, m);
      return this.get(id, m);
    });
  }

  /** Hoàn tất phục vụ: dịch vụ đã xác nhận -> DONE; chuyển sang chờ thanh toán (BR-11). */
  async complete(id: number, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const s = await this.get(id, m);
      this.assertParticipant(s, user);
      if (!s.isEditable()) throw new BusinessRuleError('LIFECYCLE', 'Phiên đã hoàn tất hoặc bị hủy');
      if (s.items.some((i) => i.status === SessionItemStatus.PROPOSED)) {
        throw new BusinessRuleError('BR-12', 'Còn dịch vụ đề xuất chưa được khách xác nhận tại quầy');
      }
      const done = s.items.filter((i) => i.status === SessionItemStatus.CONFIRMED);
      if (done.length === 0) throw new BusinessRuleError('BR-11', 'Phiên chưa có dịch vụ nào được thực hiện');
      const now = new Date();
      for (const i of done) {
        i.status = SessionItemStatus.DONE;
        i.assignments.forEach((a) => (a.performedAt = now));
      }
      s.status = SessionStatus.AWAITING_PAYMENT;
      s.finishedAt = now;
      await m.save(s);
      return this.get(id, m);
    });
  }
}

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly svc: SessionsService) {}

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Get()
  active() {
    return this.svc.listActive();
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Get('chairs/free')
  chairs() {
    return this.svc.chairs();
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Patch(':id/chair')
  setChair(@Param('id', ParseIntPipe) id: number, @Body() dto: ChairDto, @CurrentUser() u: AuthUser) {
    return this.svc.setChair(id, dto.chair || null, u);
  }

  @Roles(Role.STYLIST, Role.ASSISTANT) @Get('mine')
  mine(@CurrentUser() u: AuthUser) {
    return this.svc.listForEmployee(u.employeeId!);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST, Role.ASSISTANT) @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.getFor(id, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST, Role.ASSISTANT) @Post(':id/start')
  start(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.start(id, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST) @Post(':id/items')
  addItem(@Param('id', ParseIntPipe) id: number, @Body() dto: AddItemDto, @CurrentUser() u: AuthUser) {
    return this.svc.addItem(id, dto, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Post('items/:itemId/confirm')
  confirmItem(@Param('itemId', ParseIntPipe) itemId: number, @Body() dto: ConfirmItemDto, @CurrentUser() u: AuthUser) {
    return this.svc.confirmItem(itemId, dto, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Post('items/:itemId/remove')
  removeItem(@Param('itemId', ParseIntPipe) itemId: number, @CurrentUser() u: AuthUser) {
    return this.svc.removeItem(itemId, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Patch('items/:itemId/assignments')
  assignments(@Param('itemId', ParseIntPipe) itemId: number, @Body() dto: SetAssignmentsDto, @CurrentUser() u: AuthUser) {
    return this.svc.setAssignments(itemId, dto, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: CancelSessionDto, @CurrentUser() u: AuthUser) {
    return this.svc.cancel(id, dto.reason, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Post(':id/reopen')
  reopen(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.reopen(id, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Patch(':id/customer')
  setCustomer(@Param('id', ParseIntPipe) id: number, @Body() dto: SessionCustomerDto, @CurrentUser() u: AuthUser) {
    return this.svc.setCustomer(id, dto, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST, Role.ASSISTANT) @Post(':id/complete')
  complete(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.complete(id, u);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ServiceSession, ServiceSessionItem, ServiceAssignment]), AppointmentsModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
