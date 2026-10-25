import { Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { DataSource, In } from 'typeorm';
import { ServiceAssignment, ServiceSession, ServiceSessionItem } from './session.entities';
import { SalonService } from '../catalog/service.entity';
import { Employee } from '../employees/employee.entities';
import { Appointment } from '../appointments/appointment.entities';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { AppointmentStatus, AssignmentRole, EmployeePosition, Role, SessionItemStatus, SessionStatus } from '../common/enums';
import { BusinessRuleError } from '../common/business.error';
import { AuditService } from '../common/shared.services';
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
  @IsString() reason: string;
}

export class ConfirmItemDto {
  @IsString() confirmationNote: string;
  @IsOptional() @IsInt() @Min(0) agreedPrice?: number;
}

@Injectable()
export class SessionsService {
  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly audit: AuditService) {}

  async get(id: number) {
    const s = await this.ds.manager.findOne(ServiceSession, { where: { id } });
    if (!s) throw new NotFoundException('Không tìm thấy phiên phục vụ');
    return s;
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

  private async setAppointmentStatus(s: ServiceSession, status: AppointmentStatus) {
    if (!s.appointment) return;
    const a = await this.ds.manager.findOneByOrFail(Appointment, { id: s.appointment.id });
    if (a.status !== status && a.canTransitionTo(status)) {
      a.transitionTo(status);
      await this.ds.manager.save(a);
    }
  }

  async start(id: number, user: AuthUser) {
    const s = await this.get(id);
    this.assertParticipant(s, user);
    if (s.status !== SessionStatus.OPEN) throw new BusinessRuleError('LIFECYCLE', 'Phiên đã bắt đầu hoặc đã kết thúc');
    s.status = SessionStatus.IN_SERVICE;
    s.startedAt = new Date();
    await this.ds.manager.save(s);
    await this.setAppointmentStatus(s, AppointmentStatus.IN_SERVICE);
    return this.get(id);
  }

  /**
   * Thêm dịch vụ phát sinh (FR-09). Stylist đề xuất -> trạng thái PROPOSED, cần lễ tân ghi nhận khách đồng ý.
   * Lễ tân/chủ thêm kèm ghi chú xác nhận -> CONFIRMED.
   */
  async addItem(id: number, dto: AddItemDto, user: AuthUser) {
    const s = await this.get(id);
    this.assertParticipant(s, user);
    if (!s.isEditable()) throw new BusinessRuleError('FR-09', 'Phiên đã chốt, không thêm dịch vụ được');
    const service = await this.ds.manager.findOneBy(SalonService, { id: dto.serviceId });
    if (!service) throw new NotFoundException('Không tìm thấy dịch vụ');
    if (!service.isBookable()) throw new BusinessRuleError('BR-05', 'Dịch vụ đã ngừng cung cấp');
    const leadId = dto.leadId ?? (user.role === Role.STYLIST ? user.employeeId! : s.activeItems()[0]?.lead()?.employee.id);
    if (!leadId) throw new BusinessRuleError('BR-19', 'Cần chọn thợ chính');
    const lead = await this.ds.manager.findOne(Employee, { where: { id: leadId }, relations: { skills: true } });
    if (!lead?.canPerform(service.id)) throw new BusinessRuleError('BR-04', `${lead?.fullName ?? 'Nhân viên'} không có chuyên môn "${service.name}"`);
    const isDesk = user.role === Role.OWNER || user.role === Role.RECEPTIONIST;
    if (isDesk && s.status === SessionStatus.IN_SERVICE && !dto.confirmationNote) {
      throw new BusinessRuleError('BR-12', 'Cần ghi nhận khách đã đồng ý dịch vụ và giá phát sinh');
    }
    const assistants = dto.assistantIds?.length ? await this.ds.manager.findBy(Employee, { id: In(dto.assistantIds) }) : [];
    const item = this.ds.manager.create(ServiceSessionItem, {
      session: s,
      service,
      agreedPrice: dto.agreedPrice ?? service.basePrice,
      status: isDesk ? SessionItemStatus.CONFIRMED : SessionItemStatus.PROPOSED,
      confirmationNote: dto.confirmationNote ?? null,
      assignments: [
        this.ds.manager.create(ServiceAssignment, { employee: lead, role: AssignmentRole.LEAD_STYLIST }),
        ...assistants.map((a) => this.ds.manager.create(ServiceAssignment, { employee: a, role: AssignmentRole.ASSISTANT })),
      ],
    });
    await this.ds.manager.save(item);
    return this.get(id);
  }

  async confirmItem(itemId: number, dto: ConfirmItemDto, user: AuthUser) {
    const item = await this.ds.manager.findOne(ServiceSessionItem, { where: { id: itemId }, relations: { session: true } });
    if (!item) throw new NotFoundException('Không tìm thấy dịch vụ trong phiên');
    item.status = SessionItemStatus.CONFIRMED;
    item.confirmationNote = dto.confirmationNote;
    if (dto.agreedPrice != null) item.agreedPrice = dto.agreedPrice;
    await this.ds.manager.save(item);
    await this.audit.log(user, 'SESSION_ITEM_CONFIRM', 'ServiceSessionItem', itemId, `Khách đồng ý "${item.service.name}" giá ${item.agreedPrice}`);
    return this.get(item.session.id);
  }

  async removeItem(itemId: number, user: AuthUser) {
    const item = await this.ds.manager.findOne(ServiceSessionItem, { where: { id: itemId }, relations: { session: true } });
    if (!item) throw new NotFoundException('Không tìm thấy dịch vụ trong phiên');
    const s = await this.get(item.session.id);
    if (!s.isEditable()) throw new BusinessRuleError('FR-09', 'Phiên đã chốt');
    item.status = SessionItemStatus.REMOVED;
    await this.ds.manager.save(item);
    await this.audit.log(user, 'SESSION_ITEM_REMOVE', 'ServiceSessionItem', itemId, `Bỏ "${item.service.name}" khỏi ${s.code}`);
    return this.get(s.id);
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
        if (a.role === AssignmentRole.LEAD_STYLIST && (e.position !== EmployeePosition.STYLIST || !e.canPerform(item.service.id))) {
          throw new BusinessRuleError('BR-04', `${e.fullName} không thể làm thợ chính cho "${item.service.name}"`);
        }
      }
      // Kiểm tra trước công thức chia (BR-19) để báo lỗi sớm
      CommissionCalculator.compute(
        { serviceName: item.service.name, price: item.agreedPrice, rate: item.service.commissionRate, mode: item.service.commissionMode, leadShare: item.service.leadShare, assistantFixedFee: item.service.assistantFixedFee },
        dto.assignments,
      );
      await m.delete(ServiceAssignment, { item: { id: itemId } });
      for (const a of dto.assignments) {
        await m.save(m.create(ServiceAssignment, { item: { id: itemId } as ServiceSessionItem, employee: emps.find((x) => x.id === a.employeeId)!, role: a.role, shareOverride: a.shareOverride ?? null, fixedFeeOverride: a.fixedFeeOverride ?? null }));
      }
      await this.audit.log(user, 'ASSIGNMENT_UPDATE', 'ServiceSessionItem', itemId, `Đổi phân công "${item.service.name}" trong ${session.code}`, null, dto.assignments, m);
      return m.findOneByOrFail(ServiceSession, { id: session.id });
    });
  }

  /** Hủy phiên tiếp nhận nhầm (chưa có hóa đơn); lịch hẹn liên quan chuyển Đã hủy. */
  async cancel(id: number, reason: string, user: AuthUser) {
    const s = await this.get(id);
    if (!s.isEditable()) throw new BusinessRuleError('LIFECYCLE', 'Chỉ hủy được phiên chưa hoàn tất');
    if (!reason) throw new BusinessRuleError('LIFECYCLE', 'Cần ghi lý do hủy phiên');
    s.status = SessionStatus.CANCELLED;
    await this.ds.manager.save(s);
    if (s.appointment) {
      const a = await this.ds.manager.findOneByOrFail(Appointment, { id: s.appointment.id });
      a.status = AppointmentStatus.CANCELLED;
      a.statusReason = reason;
      await this.ds.manager.save(a);
    }
    await this.audit.log(user, 'SESSION_CANCEL', 'ServiceSession', id, `Hủy phiên ${s.code}: ${reason}`);
    return this.get(id);
  }

  /** Hoàn tất phục vụ: dịch vụ đã xác nhận -> DONE; chuyển sang chờ thanh toán (BR-11). */
  async complete(id: number, user: AuthUser) {
    const s = await this.get(id);
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
    await this.ds.manager.save(s);
    return this.get(id);
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

  @Roles(Role.STYLIST, Role.ASSISTANT) @Get('mine')
  mine(@CurrentUser() u: AuthUser) {
    return this.svc.listForEmployee(u.employeeId!);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST, Role.ASSISTANT) @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id);
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

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST, Role.ASSISTANT) @Post(':id/complete')
  complete(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.complete(id, u);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ServiceSession, ServiceSessionItem, ServiceAssignment])],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
