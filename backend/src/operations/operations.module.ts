import { Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags, PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { DataSource } from 'typeorm';
import { AuditLog, Complaint, ComplaintHistory, Consultation, Equipment, ExpenseRecord, MaintenanceRecord } from './operations.entities';
import { Invoice } from '../billing/billing.entities';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { ComplaintStatus, ConsultationResult, EquipmentStatus, Role, STAFF_ROLES } from '../common/enums';
import { BusinessRuleError } from '../common/business.error';
import { AuditService, CodeService } from '../common/shared.services';

export class ComplaintDto {
  @IsString() subject: string;
  @IsString() content: string;
  @IsOptional() @IsInt() customerId?: number;
  @IsOptional() @IsInt() invoiceId?: number;
}

export class ComplaintUpdateDto {
  @IsOptional() @IsEnum(ComplaintStatus) status?: ComplaintStatus;
  @IsOptional() @IsInt() assigneeId?: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() resolution?: string;
}

export class EquipmentDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsDateString() purchaseDate?: string;
  @IsOptional() @IsInt() @Min(0) cost?: number;
  @IsOptional() @IsEnum(EquipmentStatus) status?: EquipmentStatus;
}

export class UpdateEquipmentDto extends PartialType(EquipmentDto) {}

export class MaintenanceDto {
  @IsDateString() date: string;
  @IsString() description: string;
  @IsInt() @Min(0) cost: number;
  @IsOptional() @IsEnum(EquipmentStatus) newStatus?: EquipmentStatus;
}

export class ExpenseDto {
  @IsDateString() date: string;
  @IsString() category: string;
  @IsInt() @Min(0, { message: 'Số tiền không được âm (BR-06)' }) amount: number;
  @IsString() content: string;
}

export class UpdateExpenseDto extends PartialType(ExpenseDto) {}

export class ConsultationDto {
  @IsOptional() @IsInt() customerId?: number;
  @IsString() needs: string;
  @IsOptional() @IsString() hairCondition?: string;
  @IsOptional() @IsInt() @Min(0) budget?: number;
  @IsString() proposal: string;
  @IsEnum(ConsultationResult) result: ConsultationResult;
}

const COMPLAINT_FLOW: Record<ComplaintStatus, ComplaintStatus[]> = {
  [ComplaintStatus.RECEIVED]: [ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED],
  [ComplaintStatus.IN_PROGRESS]: [ComplaintStatus.WAITING_CUSTOMER, ComplaintStatus.RESOLVED],
  [ComplaintStatus.WAITING_CUSTOMER]: [ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED],
  [ComplaintStatus.RESOLVED]: [ComplaintStatus.CLOSED, ComplaintStatus.IN_PROGRESS],
  [ComplaintStatus.CLOSED]: [],
};

@Injectable()
export class OperationsService {
  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly codes: CodeService, private readonly audit: AuditService) {}

  // ---- Khiếu nại
  listComplaints(status?: ComplaintStatus) {
    return this.ds.manager.find(Complaint, { where: status ? { status } : {}, order: { createdAt: 'DESC' } });
  }

  listMyComplaints(customerId: number) {
    return this.ds.manager.find(Complaint, { where: { customer: { id: customerId } }, order: { createdAt: 'DESC' } });
  }

  async createComplaint(dto: ComplaintDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const customerId = user.role === Role.CUSTOMER ? user.customerId : dto.customerId;
      let invoice: Invoice | null = null;
      if (dto.invoiceId) {
        invoice = await m.findOneBy(Invoice, { id: dto.invoiceId });
        if (user.role === Role.CUSTOMER && invoice?.customer?.id !== user.customerId) throw new ForbiddenException('Hóa đơn không thuộc về bạn');
      }
      const c = m.create(Complaint, {
        code: await this.codes.next('PH', m, 3),
        subject: dto.subject,
        content: dto.content,
        customer: customerId ? ({ id: customerId } as any) : null,
        invoice,
        receivedBy: user.employeeId ? ({ id: user.employeeId } as any) : null,
        history: [m.create(ComplaintHistory, { status: ComplaintStatus.RECEIVED, note: 'Tiếp nhận', actorName: user.name })],
      });
      const saved = await m.save(c);
      return m.findOneByOrFail(Complaint, { id: saved.id });
    });
  }

  async updateComplaint(id: number, dto: ComplaintUpdateDto, user: AuthUser) {
    const c = await this.ds.manager.findOneBy(Complaint, { id });
    if (!c) throw new NotFoundException('Không tìm thấy khiếu nại');
    if (dto.status && dto.status !== c.status) {
      if (!COMPLAINT_FLOW[c.status].includes(dto.status)) throw new BusinessRuleError('BR-13', `Không thể chuyển ${c.status} → ${dto.status}`);
      if (dto.status === ComplaintStatus.RESOLVED && !(dto.resolution ?? c.resolution)) throw new BusinessRuleError('BR-13', 'Cần ghi kết quả giải quyết');
      c.status = dto.status;
    }
    if (dto.assigneeId) c.assignee = { id: dto.assigneeId } as any;
    if (dto.resolution) c.resolution = dto.resolution;
    c.history.push(this.ds.manager.create(ComplaintHistory, { status: c.status, note: dto.note ?? (dto.assigneeId ? 'Phân công xử lý' : null), actorName: user.name }));
    await this.ds.manager.save(c);
    return this.ds.manager.findOneByOrFail(Complaint, { id });
  }

  // ---- Thiết bị
  listEquipment() {
    return this.ds.manager.find(Equipment, { order: { code: 'ASC' } });
  }

  saveEquipment(dto: Partial<EquipmentDto>, id?: number) {
    return this.ds.transaction(async (m) => {
      const e = id ? await m.findOneByOrFail(Equipment, { id }) : m.create(Equipment);
      Object.assign(e, dto);
      return m.save(e);
    });
  }

  async addMaintenance(id: number, dto: MaintenanceDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const e = await m.findOneByOrFail(Equipment, { id });
      await m.save(m.create(MaintenanceRecord, { equipment: e, date: dto.date, description: dto.description, cost: dto.cost }));
      if (dto.newStatus) e.status = dto.newStatus;
      await m.save(e);
      if (dto.cost > 0) {
        await m.save(m.create(ExpenseRecord, { date: dto.date, category: 'SỬA CHỮA', amount: dto.cost, content: `Bảo trì ${e.code} ${e.name}: ${dto.description}`, recordedBy: user.employeeId ? ({ id: user.employeeId } as any) : null }));
      }
      return m.findOneByOrFail(Equipment, { id });
    });
  }

  // ---- Chi phí
  listExpenses(from?: string, to?: string) {
    const qb = this.ds.manager.createQueryBuilder(ExpenseRecord, 'x').leftJoinAndSelect('x.recordedBy', 'e').orderBy('x.date', 'DESC');
    if (from) qb.andWhere('x.date >= :from', { from });
    if (to) qb.andWhere('x.date <= :to', { to });
    return qb.getMany();
  }

  async saveExpense(dto: Partial<ExpenseDto>, user: AuthUser, id?: number) {
    const repo = this.ds.getRepository(ExpenseRecord);
    const x = id ? await repo.findOneByOrFail({ id }) : repo.create({ recordedBy: user.employeeId ? ({ id: user.employeeId } as any) : null });
    const before = id ? { ...x } : null;
    Object.assign(x, dto);
    const saved = await repo.save(x);
    if (id) await this.audit.log(user, 'EXPENSE_UPDATE', 'ExpenseRecord', id, `Sửa khoản chi ${saved.content}`, before, saved);
    return saved;
  }

  // ---- Tư vấn
  listConsultations(customerId?: number) {
    return this.ds.manager.find(Consultation, { where: customerId ? { customer: { id: customerId } } : {}, order: { createdAt: 'DESC' }, take: 100 });
  }

  createConsultation(dto: ConsultationDto, user: AuthUser) {
    const { customerId, ...rest } = dto;
    return this.ds.manager.save(this.ds.manager.create(Consultation, { ...rest, customer: customerId ? ({ id: customerId } as any) : null, consultant: { id: user.employeeId } as any }));
  }

  // ---- Nhật ký
  auditLogs(entity?: string) {
    return this.ds.manager.find(AuditLog, { where: entity ? { entity } : {}, order: { createdAt: 'DESC' }, take: 200 });
  }
}

@ApiTags('operations')
@Controller()
export class OperationsController {
  constructor(private readonly svc: OperationsService) {}

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Get('complaints')
  complaints(@Query('status') status?: ComplaintStatus) {
    return this.svc.listComplaints(status);
  }

  @Roles(Role.CUSTOMER) @Get('complaints/mine')
  myComplaints(@CurrentUser() u: AuthUser) {
    return this.svc.listMyComplaints(u.customerId!);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.CUSTOMER) @Post('complaints')
  createComplaint(@Body() dto: ComplaintDto, @CurrentUser() u: AuthUser) {
    return this.svc.createComplaint(dto, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Patch('complaints/:id')
  updateComplaint(@Param('id', ParseIntPipe) id: number, @Body() dto: ComplaintUpdateDto, @CurrentUser() u: AuthUser) {
    return this.svc.updateComplaint(id, dto, u);
  }

  @Roles(...STAFF_ROLES) @Get('equipment')
  equipment() {
    return this.svc.listEquipment();
  }

  @Roles(Role.OWNER) @Post('equipment')
  createEquipment(@Body() dto: EquipmentDto) {
    return this.svc.saveEquipment(dto);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Patch('equipment/:id')
  updateEquipment(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEquipmentDto) {
    return this.svc.saveEquipment(dto, id);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Post('equipment/:id/maintenance')
  maintenance(@Param('id', ParseIntPipe) id: number, @Body() dto: MaintenanceDto, @CurrentUser() u: AuthUser) {
    return this.svc.addMaintenance(id, dto, u);
  }

  @Roles(Role.OWNER) @Get('expenses')
  expenses(@Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.listExpenses(from, to);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Post('expenses')
  createExpense(@Body() dto: ExpenseDto, @CurrentUser() u: AuthUser) {
    return this.svc.saveExpense(dto, u);
  }

  /** BR-16: chỉ chủ salon được sửa khoản chi đã ghi nhận. */
  @Roles(Role.OWNER) @Patch('expenses/:id')
  updateExpense(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateExpenseDto, @CurrentUser() u: AuthUser) {
    return this.svc.saveExpense(dto, u, id);
  }

  @Roles(...STAFF_ROLES) @Get('consultations')
  consultations(@Query('customerId') customerId?: string) {
    return this.svc.listConsultations(customerId ? Number(customerId) : undefined);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST) @Post('consultations')
  createConsultation(@Body() dto: ConsultationDto, @CurrentUser() u: AuthUser) {
    return this.svc.createConsultation(dto, u);
  }

  @Roles(Role.OWNER) @Get('audit-logs')
  audit(@Query('entity') entity?: string) {
    return this.svc.auditLogs(entity);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Complaint, ComplaintHistory, Equipment, MaintenanceRecord, ExpenseRecord, Consultation, AuditLog])],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
