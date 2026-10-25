import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { In, Repository } from 'typeorm';
import { SalonService } from './service.entity';
import { Employee } from '../employees/employee.entities';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { CommissionMode, EmployeePosition, EmployeeStatus, Role, ServiceStatus } from '../common/enums';
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
}

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(SalonService) private readonly services: Repository<SalonService>,
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    private readonly audit: AuditService,
  ) {}

  list(includeAll: boolean) {
    return this.services.find({
      where: includeAll ? {} : { status: ServiceStatus.ACTIVE },
      order: { audience: 'ASC', category: 'ASC', basePrice: 'ASC' },
    });
  }

  async get(id: number) {
    const s = await this.services.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Không tìm thấy dịch vụ');
    return s;
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
  list(@Query('all') all?: string) {
    return this.catalog.list(all === 'true');
  }

  @Public() @Get('services/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.get(id);
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
    return {
      name: 'Atelier Luxury Haircare',
      openTime: process.env.OPEN_TIME ?? '08:00',
      closeTime: process.env.CLOSE_TIME ?? '20:00',
      hotline: process.env.SALON_HOTLINE ?? '[SỐ HOTLINE]',
      address: process.env.SALON_ADDRESS ?? '[ĐỊA CHỈ SALON]',
      cancelLockHours: Number(process.env.CANCEL_LOCK_HOURS ?? 2),
      graceMinutes: Number(process.env.GRACE_MINUTES ?? 15),
    };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([SalonService, Employee])],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
