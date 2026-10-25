import { Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { ILike, Repository } from 'typeorm';
import { Customer } from './customer.entity';
import { Appointment } from '../appointments/appointment.entities';
import { Invoice } from '../billing/billing.entities';
import { UserAccount } from '../auth/user-account.entity';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { InvoiceStatus, Role } from '../common/enums';
import { CodeService } from '../common/shared.services';

export class CustomerDto {
  @IsString() fullName: string;
  @Matches(/^0\d{9,10}$/, { message: 'Số điện thoại không hợp lệ' }) phone: string;
  @IsOptional() @IsString() birthDate?: string;
  @IsOptional() @IsString() hairNotes?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @Matches(/^0\d{9,10}$/) phone?: string;
  @IsOptional() @IsString() birthDate?: string;
  @IsOptional() @IsString() hairNotes?: string;
}

export class UpdateMeDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() birthDate?: string;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(UserAccount) private readonly accounts: Repository<UserAccount>,
    private readonly codes: CodeService,
  ) {}

  search(q?: string) {
    if (!q) return this.customers.find({ order: { updatedAt: 'DESC' }, take: 50 });
    return this.customers.find({ where: [{ phone: ILike(`%${q}%`) }, { fullName: ILike(`%${q}%`) }, { code: ILike(`%${q}%`) }], take: 50 });
  }

  async get(id: number) {
    const c = await this.customers.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Không tìm thấy khách hàng');
    return c;
  }

  /** Hồ sơ + lịch sử đặt lịch + lịch sử dịch vụ (FR-01, FR-02). */
  async detail(id: number, includeHairNotes: boolean) {
    const customer = await this.get(id);
    if (!includeHairNotes) (customer as any).hairNotes = undefined;
    const appointments = await this.appointments.find({ where: { customer: { id } }, order: { startAt: 'DESC' }, take: 50 });
    const invoices = await this.invoices.find({ where: { customer: { id }, status: InvoiceStatus.PAID }, order: { paidAt: 'DESC' }, take: 50 });
    const acc = includeHairNotes ? await this.accounts.findOne({ where: { customer: { id } } }) : null;
    return {
      customer,
      account: acc ? { id: acc.id, username: acc.username, active: acc.active, lastLoginAt: acc.lastLoginAt } : null,
      appointments,
      invoices: invoices.map((i) => ({
        id: i.id,
        code: i.code,
        paidAt: i.paidAt,
        total: i.total,
        items: i.items.map((x) => ({ description: x.description, unitPrice: x.unitPrice, quantity: x.quantity, discount: x.discount })),
        stylists: [...new Set((i.session?.items ?? []).flatMap((it) => it.assignments.map((a) => a.employee.fullName)))],
      })),
    };
  }

  /** Tìm theo SĐT hoặc tạo mới — dùng khi đặt lịch không tài khoản / walk-in. */
  async findOrCreate(fullName: string, phone: string, manager = this.customers.manager) {
    let c = await manager.findOne(Customer, { where: { phone } });
    if (!c) c = await manager.save(manager.create(Customer, { code: await this.codes.next('KH', manager), fullName, phone }));
    return c;
  }

  async create(dto: CustomerDto) {
    if (await this.customers.findOne({ where: { phone: dto.phone } })) throw new ConflictException('Số điện thoại đã có hồ sơ');
    return this.customers.save(this.customers.create({ ...dto, code: await this.codes.next('KH') }));
  }

  async update(id: number, dto: UpdateCustomerDto) {
    const c = await this.get(id);
    Object.assign(c, dto);
    return this.customers.save(c);
  }
}

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  @Roles(Role.CUSTOMER) @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.svc.detail(u.customerId!, false);
  }

  @Roles(Role.CUSTOMER) @Patch('me')
  updateMe(@CurrentUser() u: AuthUser, @Body() dto: UpdateMeDto) {
    return this.svc.update(u.customerId!, dto);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST, Role.ASSISTANT) @Get()
  search(@Query('q') q?: string) {
    return this.svc.search(q);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST, Role.ASSISTANT) @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.svc.detail(id, true);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Post()
  create(@Body() dto: CustomerDto) {
    return this.svc.create(dto);
  }

  /** Lễ tân/quản lý sửa hồ sơ; stylist ghi chú tóc/công thức màu. */
  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST) @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto, @CurrentUser() u: AuthUser) {
    if (u.role === Role.STYLIST) return this.svc.update(id, { hairNotes: dto.hairNotes });
    return this.svc.update(id, dto);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Appointment, Invoice, UserAccount])],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
