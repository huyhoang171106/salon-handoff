import { Body, ConflictException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { InjectDataSource, InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { DataSource, In, MoreThanOrEqual, Repository } from 'typeorm';
import { ClosedDay } from '../appointments/appointment.entities';
import { Product, ServiceMaterial } from '../inventory/inventory.entities';
import { BusinessRulesConfig } from '../common/business-rules.config';
import { vnDateString, vnDayRange } from '../common/time';
import { SalonService } from './service.entity';
import { Employee } from '../employees/employee.entities';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { AppointmentStatus, BLOCKING_STATUSES, CommissionMode, EmployeePosition, EmployeeStatus, EQUIPMENT_KINDS, Role, ServiceStatus } from '../common/enums';
import { AuditService } from '../common/shared.services';

export class ServiceDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsString() category: string;
  @IsOptional() @IsIn(['LONG', 'SHORT', 'ALL']) audience?: string;
  @IsInt() @Min(0, { message: 'Giá không được âm (BR-06)' }) basePrice: number;
  @IsOptional() @IsBoolean() priceFrom?: boolean;
  @IsInt() @Min(5) durationMinutes: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(ServiceStatus) status?: ServiceStatus;
  @IsOptional() @IsBoolean() needsAssistant?: boolean;
  @IsOptional() @IsInt() @Min(0) assistantMinutes?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) commissionRate?: number;
  @IsOptional() @IsEnum(CommissionMode) commissionMode?: CommissionMode;
  @IsOptional() @IsNumber() @Min(0) @Max(1) leadShare?: number;
  @IsOptional() @IsInt() @Min(0) assistantFixedFee?: number;
  @IsOptional() @IsBoolean() depositRequired?: boolean;
  @IsOptional() @IsIn(Object.keys(EQUIPMENT_KINDS)) requiredEquipment?: string | null;
}

export class UpdateServiceDto implements Partial<ServiceDto> {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['LONG', 'SHORT', 'ALL']) audience?: string;
  @IsOptional() @IsInt() @Min(0, { message: 'Giá không được âm (BR-06)' }) basePrice?: number;
  @IsOptional() @IsBoolean() priceFrom?: boolean;
  @IsOptional() @IsInt() @Min(5) durationMinutes?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(ServiceStatus) status?: ServiceStatus;
  @IsOptional() @IsBoolean() needsAssistant?: boolean;
  @IsOptional() @IsInt() @Min(0) assistantMinutes?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) commissionRate?: number;
  @IsOptional() @IsEnum(CommissionMode) commissionMode?: CommissionMode;
  @IsOptional() @IsNumber() @Min(0) @Max(1) leadShare?: number;
  @IsOptional() @IsInt() @Min(0) assistantFixedFee?: number;
  @IsOptional() @IsBoolean() depositRequired?: boolean;
  @IsOptional() @IsIn(Object.keys(EQUIPMENT_KINDS)) requiredEquipment?: string | null;
}

export class MaterialLineDto {
  @IsInt() productId: number;
  @IsInt() @Min(1) quantity: number;
}

export class SetMaterialsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => MaterialLineDto)
  @ArrayUnique((l: MaterialLineDto) => l.productId, { message: 'Mỗi vật tư chỉ khai báo một dòng' })
  materials: MaterialLineDto[];
}

export class ClosedDayDto {
  @IsDateString() date: string;
  @IsString() @IsNotEmpty() reason: string;
}

/** Trường nội bộ (hoa hồng) không trả cho khách và người chưa đăng nhập. */
const INTERNAL_FIELDS = ['commissionRate', 'commissionMode', 'leadShare', 'assistantFixedFee'] as const;

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(SalonService) private readonly services: Repository<SalonService>,
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly rules: BusinessRulesConfig,
  ) {}

  private static isStaff(u: AuthUser | null): u is AuthUser {
    return !!u && u.role !== Role.CUSTOMER;
  }

  private static view(s: SalonService, u: AuthUser | null) {
    if (CatalogService.isStaff(u)) return s;
    const copy: Record<string, unknown> = { ...s };
    for (const f of INTERNAL_FIELDS) delete copy[f];
    return copy;
  }

  /** `all=true` (kèm dịch vụ ngừng) chỉ dành cho quản lý/lễ tân; khách và người ẩn danh chỉ thấy dịch vụ đang bán, không có hoa hồng. */
  async list(includeAll: boolean, u: AuthUser | null) {
    const desk = !!u && (u.role === Role.OWNER || u.role === Role.RECEPTIONIST);
    const rows = await this.services.find({
      where: includeAll && desk ? {} : { status: ServiceStatus.ACTIVE },
      order: { audience: 'ASC', category: 'ASC', basePrice: 'ASC' },
    });
    return rows.map((s) => CatalogService.view(s, u));
  }

  async get(id: number, u: AuthUser | null = null) {
    const s = await this.services.findOne({ where: { id } });
    if (!s || (!CatalogService.isStaff(u) && s.status !== ServiceStatus.ACTIVE)) throw new NotFoundException('Không tìm thấy dịch vụ');
    return CatalogService.view(s, u);
  }

  // ---------------------------------------------------------------- Định mức vật tư (FR-18)

  listMaterials(serviceId: number) {
    return this.ds.manager.find(ServiceMaterial, { where: { service: { id: serviceId } }, order: { id: 'ASC' } });
  }

  /** Thay toàn bộ định mức của dịch vụ; kho tự trừ theo định mức khi hóa đơn thanh toán xong. */
  async setMaterials(serviceId: number, dto: SetMaterialsDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const service = await m.findOneBy(SalonService, { id: serviceId });
      if (!service) throw new NotFoundException('Không tìm thấy dịch vụ');
      const products = await m.findBy(Product, { id: In(dto.materials.map((l) => l.productId)) });
      if (products.length !== dto.materials.length) throw new NotFoundException('Có vật tư không tồn tại');
      await m.delete(ServiceMaterial, { service: { id: serviceId } });
      for (const l of dto.materials) await m.save(m.create(ServiceMaterial, { service, product: products.find((p) => p.id === l.productId)!, quantity: l.quantity }));
      await this.audit.log(user, 'SERVICE_MATERIALS', 'Service', serviceId, `Định mức vật tư "${service.name}": ${dto.materials.map((l) => `${products.find((p) => p.id === l.productId)!.name} ×${l.quantity}`).join(', ') || 'không có'}`, null, dto.materials, m);
      return m.find(ServiceMaterial, { where: { service: { id: serviceId } }, order: { id: 'ASC' } });
    });
  }

  // ---------------------------------------------------------------- Ngày nghỉ lễ / đóng cửa (FR-05)

  listClosedDays(fromToday: boolean) {
    return this.ds.manager.find(ClosedDay, { where: fromToday ? { date: MoreThanOrEqual(vnDateString(new Date())) } : {}, order: { date: 'ASC' } });
  }

  /** Đặt ngày đóng cửa; không tự hủy lịch đã đặt mà trả số lịch bị ảnh hưởng để lễ tân liên hệ khách. */
  async addClosedDay(dto: ClosedDayDto, user: AuthUser) {
    if (await this.ds.manager.existsBy(ClosedDay, { date: dto.date })) throw new ConflictException('Ngày này đã được đặt là ngày nghỉ');
    const day = await this.ds.manager.save(ClosedDay, this.ds.manager.create(ClosedDay, dto));
    const { from, to } = vnDayRange(dto.date);
    const affected = await this.ds.query(
      `SELECT a.id, a.code, a."startAt" FROM appointments a WHERE a."startAt" >= $1 AND a."startAt" < $2 AND a.status = ANY($3) ORDER BY a."startAt"`,
      [from, to, BLOCKING_STATUSES.filter((x) => x !== AppointmentStatus.CHECKED_IN && x !== AppointmentStatus.IN_SERVICE)],
    );
    await this.audit.log(user, 'CLOSED_DAY_ADD', 'ClosedDay', day.id, `Đặt ngày nghỉ ${dto.date}: ${dto.reason} (${affected.length} lịch đã đặt bị ảnh hưởng)`);
    return { ...day, affectedAppointments: affected };
  }

  async removeClosedDay(id: number, user: AuthUser) {
    const day = await this.ds.manager.findOneBy(ClosedDay, { id });
    if (!day) throw new NotFoundException('Không tìm thấy ngày nghỉ');
    await this.ds.manager.delete(ClosedDay, id);
    await this.audit.log(user, 'CLOSED_DAY_REMOVE', 'ClosedDay', id, `Bỏ ngày nghỉ ${day.date}`);
    return { ok: true };
  }

  /** Thông tin công khai của salon, lấy từ cấu hình nghiệp vụ để không lệch giá trị mặc định. */
  salonInfo() {
    const r = this.rules;
    return {
      name: r.salonName, openTime: r.openTime, closeTime: r.closeTime, hotline: r.hotline, address: r.address,
      cancelLockHours: r.cancelLockHours, graceMinutes: r.graceMinutes,
      depositRate: r.depositRate, depositMinAmount: r.depositMinAmount, depositHoldHours: r.depositHoldHours, checkInEarlyMinutes: r.checkInEarlyMinutes,
    };
  }

  async create(dto: ServiceDto, user: AuthUser) {
    const s = await this.services.save(this.services.create(dto));
    await this.audit.log(user, 'SERVICE_CREATE', 'Service', s.id, `Thêm dịch vụ "${s.name}"`, null, s);
    return s;
  }

  /** Cập nhật dịch vụ; đổi giá/hoa hồng được ghi audit, hóa đơn cũ không bị ảnh hưởng (BR-07, BR-08). */
  async update(id: number, dto: UpdateServiceDto, user: AuthUser) {
    const s = await this.get(id);
    const before = { ...s };
    Object.assign(s, dto);
    const saved = await this.services.save(s);
    const changes: string[] = [];
    if (dto.basePrice != null && dto.basePrice !== before.basePrice) changes.push(`giá ${before.basePrice} → ${dto.basePrice}`);
    if (dto.commissionRate != null && dto.commissionRate !== before.commissionRate) changes.push(`quỹ hoa hồng ${before.commissionRate} → ${dto.commissionRate}`);
    if (dto.leadShare != null && dto.leadShare !== before.leadShare) changes.push(`tỷ lệ thợ chính ${before.leadShare} → ${dto.leadShare}`);
    if (dto.status && dto.status !== before.status) changes.push(`trạng thái ${before.status} → ${dto.status}`);
    await this.audit.log(user, 'SERVICE_UPDATE', 'Service', id, `Cập nhật "${s.name}"${changes.length ? ': ' + changes.join(', ') : ''}`, before, saved);
    return saved;
  }

  /** Stylist hiển thị công khai trên website khách hàng. */
  async publicStylists() {
    const list = await this.employees.find({
      where: { position: In([EmployeePosition.STYLIST]), status: EmployeeStatus.ACTIVE, publicProfile: true },
      relations: { skills: true },
      order: { id: 'ASC' },
    });
    return list.map((e) => ({
      id: e.id,
      fullName: e.fullName,
      level: e.level,
      bio: e.bio,
      skills: e.skills.map((s) => ({ id: s.id, name: s.name, category: s.category })),
    }));
  }
}

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public() @Get('services')
  list(@CurrentUser() u: AuthUser | null, @Query('all') all?: string) {
    return this.catalog.list(all === 'true', u);
  }

  @Public() @Get('services/:id')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser | null) {
    return this.catalog.get(id, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Get('services/:id/materials')
  materials(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.listMaterials(id);
  }

  @Roles(Role.OWNER) @Put('services/:id/materials')
  setMaterials(@Param('id', ParseIntPipe) id: number, @Body() dto: SetMaterialsDto, @CurrentUser() user: AuthUser) {
    return this.catalog.setMaterials(id, dto, user);
  }

  @Public() @Get('closed-days')
  closedDays() {
    return this.catalog.listClosedDays(true);
  }

  @Roles(Role.OWNER) @Post('closed-days')
  addClosedDay(@Body() dto: ClosedDayDto, @CurrentUser() user: AuthUser) {
    return this.catalog.addClosedDay(dto, user);
  }

  @Roles(Role.OWNER) @Delete('closed-days/:id')
  removeClosedDay(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.catalog.removeClosedDay(id, user);
  }

  @Roles(Role.OWNER) @Post('services')
  create(@Body() dto: ServiceDto, @CurrentUser() user: AuthUser) {
    return this.catalog.create(dto, user);
  }

  @Roles(Role.OWNER) @Patch('services/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateServiceDto, @CurrentUser() user: AuthUser) {
    return this.catalog.update(id, dto, user);
  }

  @Public() @Get('stylists')
  stylists() {
    return this.catalog.publicStylists();
  }

  @Public() @Get('salon-info')
  info() {
    return this.catalog.salonInfo();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([SalonService, Employee, ClosedDay, ServiceMaterial, Product])],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
