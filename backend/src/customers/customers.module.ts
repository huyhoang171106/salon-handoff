import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { InjectDataSource, InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { DataSource, ILike, In, Repository } from 'typeorm';
import { Customer } from './customer.entity';
import { Appointment } from '../appointments/appointment.entities';
import { Invoice } from '../billing/billing.entities';
import { UserAccount } from '../auth/user-account.entity';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { AppointmentStatus, InvoiceStatus, Role } from '../common/enums';
import { AuditService, CodeService } from '../common/shared.services';
import { BusinessRuleError } from '../common/business.error';
import { PHONE_MSG, PHONE_RE } from '../common/validation';

export class CustomerDto {
  @IsString() fullName: string;
  @Matches(PHONE_RE, { message: PHONE_MSG }) phone: string;
  @IsOptional() @IsString() birthDate?: string;
  @IsOptional() @IsString() hairNotes?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @Matches(PHONE_RE, { message: PHONE_MSG }) phone?: string;
  @IsOptional() @IsString() birthDate?: string;
  @IsOptional() @IsString() hairNotes?: string;
}

export class MergeDto {
  /** Hồ sơ giữ lại; hồ sơ trong URL được gộp vào và bị xóa. */
  @IsInt() targetId: number;
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
    private readonly audit: AuditService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** Id khách có lịch do thợ này phụ trách (SRS §22: thợ chỉ thấy khách của mình). */
  private async servedBy(employeeId: number): Promise<number[]> {
    const rows: { customerId: number }[] = await this.ds.query(
      `SELECT DISTINCT a."customerId" FROM appointments a JOIN appointment_items ai ON ai."appointmentId" = a.id
        WHERE ai."leadStylistId" = $1 OR ai."assistantId" = $1`,
      [employeeId],
    );
    return rows.map((r) => r.customerId);
  }

  private isFloor(u: AuthUser) {
    return u.role === Role.STYLIST || u.role === Role.ASSISTANT;
  }

  async assertCanSee(id: number, u: AuthUser) {
    if (this.isFloor(u) && !(await this.servedBy(u.employeeId!)).includes(id)) throw new ForbiddenException('Khách này không thuộc lịch bạn phụ trách');
  }

  async search(u: AuthUser, q?: string) {
    const scope = this.isFloor(u) ? { id: In(await this.servedBy(u.employeeId!)) } : {};
    if (!q) return this.customers.find({ where: scope, order: { updatedAt: 'DESC' }, take: 50 });
    return this.customers.find({
      where: [{ phone: ILike(`%${q}%`), ...scope }, { fullName: ILike(`%${q}%`), ...scope }, { code: ILike(`%${q}%`), ...scope }],
      take: 50,
    });
  }

  async get(id: number) {
    const c = await this.customers.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Không tìm thấy khách hàng');
    return c;
  }

  /** Hồ sơ + lịch sử đặt lịch + lịch sử dịch vụ (FR-01, FR-02). */
  async detail(id: number, includeHairNotes: boolean, u?: AuthUser) {
    if (u) await this.assertCanSee(id, u);
    const customer = await this.get(id);
    if (!includeHairNotes) (customer as any).hairNotes = undefined;
    const floor = !!u && this.isFloor(u);
    const appointments = await this.appointments.find({ where: { customer: { id } }, order: { startAt: 'DESC' }, take: 50 });
    // Thợ không xem hóa đơn/tài khoản của khách.
    const invoices = floor ? [] : await this.invoices.find({ where: { customer: { id }, status: InvoiceStatus.PAID }, order: { paidAt: 'DESC' }, take: 50 });
    const acc = includeHairNotes && !floor ? await this.accounts.findOne({ where: { customer: { id } } }) : null;
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

  /** Sửa hồ sơ. Đổi SĐT thì kiểm tra trùng và đồng bộ tên đăng nhập của tài khoản liên kết để khách vẫn đăng nhập được. */
  async update(id: number, dto: UpdateCustomerDto, u?: AuthUser) {
    return this.ds.transaction(async (m) => {
      const c = await m.findOne(Customer, { where: { id } });
      if (!c) throw new NotFoundException('Không tìm thấy khách hàng');
      if (c.isAnonymous || c.anonymizedAt) throw new BusinessRuleError('IDENTITY', 'Không sửa được hồ sơ vãng lai hoặc hồ sơ đã ẩn danh');
      const oldPhone = c.phone;
      Object.assign(c, dto);
      if (c.phone !== oldPhone) {
        if (await m.findOne(Customer, { where: { phone: c.phone } })) throw new ConflictException('Số điện thoại đã có hồ sơ khác');
        const acc = await m.findOne(UserAccount, { where: { customer: { id } } });
        if (acc) {
          if (await m.findOne(UserAccount, { where: { username: c.phone } })) throw new ConflictException('Số điện thoại đã được dùng làm tên đăng nhập');
          acc.username = c.phone;
          await m.save(acc);
        }
      }
      const saved = await m.save(c);
      if (u) await this.audit.log(u, 'CUSTOMER_UPDATE', 'Customer', id, `Cập nhật khách ${c.code}${c.phone !== oldPhone ? `: SĐT ${oldPhone} → ${c.phone}` : ''}`, null, dto, m);
      return saved;
    });
  }

  /** Gộp hồ sơ trùng: chuyển toàn bộ lịch sử của `sourceId` sang `targetId` rồi xóa hồ sơ nguồn. */
  async merge(sourceId: number, targetId: number, u: AuthUser) {
    if (sourceId === targetId) throw new BusinessRuleError('INPUT', 'Không gộp hồ sơ vào chính nó');
    return this.ds.transaction(async (m) => {
      const [src, dst] = await Promise.all([m.findOneBy(Customer, { id: sourceId }), m.findOneBy(Customer, { id: targetId })]);
      if (!src || !dst) throw new NotFoundException('Không tìm thấy khách hàng');
      if (src.isAnonymous || dst.isAnonymous || src.anonymizedAt || dst.anonymizedAt) throw new BusinessRuleError('IDENTITY', 'Không gộp hồ sơ vãng lai hoặc hồ sơ đã ẩn danh');
      const [srcAcc, dstAcc] = await Promise.all([m.findOneBy(UserAccount, { customer: { id: sourceId } }), m.findOneBy(UserAccount, { customer: { id: targetId } })]);
      if (srcAcc && dstAcc) throw new BusinessRuleError('IDENTITY', 'Cả hai hồ sơ đều có tài khoản — hãy xử lý tài khoản trước khi gộp');
      for (const t of ['appointments', 'service_sessions', 'invoices', 'complaints', 'consultations']) {
        await m.query(`UPDATE ${t} SET "customerId" = $1 WHERE "customerId" = $2`, [targetId, sourceId]);
      }
      if (srcAcc) {
        // Tài khoản đi theo hồ sơ giữ lại; tên đăng nhập = SĐT của hồ sơ đó.
        srcAcc.customer = dst;
        srcAcc.username = dst.phone;
        await m.save(srcAcc);
      }
      await m.delete(Customer, sourceId);
      dst.noShowCount += src.noShowCount;
      dst.visitCount += src.visitCount;
      dst.lastVisitAt = [dst.lastVisitAt, src.lastVisitAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      dst.isMember = dst.isMember || src.isMember;
      dst.memberSince = [dst.memberSince, src.memberSince].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
      dst.firstVisitPromoUsed = dst.firstVisitPromoUsed || src.firstVisitPromoUsed;
      dst.birthDate = dst.birthDate ?? src.birthDate;
      if (src.hairNotes && src.hairNotes !== dst.hairNotes) dst.hairNotes = [dst.hairNotes, src.hairNotes].filter(Boolean).join('\n---\n');
      await m.save(dst);
      await this.audit.log(u, 'CUSTOMER_MERGE', 'Customer', targetId, `Gộp khách ${src.code} (${src.phone}) vào ${dst.code} (${dst.phone})`, src, null, m);
      return dst;
    });
  }

  /** Yêu cầu xóa dữ liệu cá nhân (§22): xóa tên, SĐT, ghi chú; khóa tài khoản. Lịch sử giao dịch giữ để đối soát. */
  async anonymize(id: number, u: AuthUser) {
    return this.ds.transaction(async (m) => {
      const c = await m.findOne(Customer, { where: { id } });
      if (!c) throw new NotFoundException('Không tìm thấy khách hàng');
      if (c.isAnonymous || c.anonymizedAt) throw new BusinessRuleError('IDENTITY', 'Hồ sơ này đã là hồ sơ ẩn danh');
      const open = await m.count(Appointment, {
        where: { customer: { id }, status: In([AppointmentStatus.BOOKED, AppointmentStatus.CONFIRMED, AppointmentStatus.LATE, AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_SERVICE]) },
      });
      if (open) throw new BusinessRuleError('IDENTITY', 'Khách còn lịch hẹn đang mở — hủy hoặc hoàn tất trước khi ẩn danh');
      const before = { code: c.code, fullName: c.fullName, phone: c.phone };
      Object.assign(c, { fullName: 'Khách đã ẩn danh', phone: `DEL-${c.code}`, birthDate: null, hairNotes: null, isMember: false, anonymizedAt: new Date() });
      await m.save(c);
      const acc = await m.findOneBy(UserAccount, { customer: { id } });
      if (acc) {
        acc.active = false;
        acc.username = `deleted-${c.code}`;
        await m.save(acc);
      }
      await this.audit.log(u, 'CUSTOMER_ANONYMIZE', 'Customer', id, `Ẩn danh khách ${before.code}`, before, null, m);
      return c;
    });
  }

  /** Xóa hẳn hồ sơ chưa phát sinh gì; đã có lịch sử thì dùng ẩn danh. */
  async remove(id: number, u: AuthUser) {
    return this.ds.transaction(async (m) => {
      const c = await m.findOne(Customer, { where: { id } });
      if (!c) throw new NotFoundException('Không tìm thấy khách hàng');
      if (c.isAnonymous) throw new BusinessRuleError('IDENTITY', 'Không xóa hồ sơ vãng lai dùng chung');
      for (const t of ['appointments', 'service_sessions', 'invoices', 'complaints', 'consultations']) {
        const [{ n }] = await m.query(`SELECT count(*)::int n FROM ${t} WHERE "customerId" = $1`, [id]);
        if (n) throw new ConflictException('Khách đã có lịch sử giao dịch — dùng chức năng ẩn danh thay vì xóa');
      }
      await m.delete(UserAccount, { customer: { id } });
      await m.delete(Customer, id);
      await this.audit.log(u, 'CUSTOMER_DELETE', 'Customer', id, `Xóa khách ${c.code} ${c.fullName}`, c, null, m);
      return { ok: true };
    });
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
  search(@CurrentUser() u: AuthUser, @Query('q') q?: string) {
    return this.svc.search(u, q);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST, Role.ASSISTANT) @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.detail(id, true, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Post()
  create(@Body() dto: CustomerDto) {
    return this.svc.create(dto);
  }

  /** Lễ tân/quản lý sửa hồ sơ; stylist ghi chú tóc/công thức màu. */
  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST) @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto, @CurrentUser() u: AuthUser) {
    if (u.role === Role.STYLIST) return this.svc.assertCanSee(id, u).then(() => this.svc.update(id, { hairNotes: dto.hairNotes }, u));
    return this.svc.update(id, dto, u);
  }

  @Roles(Role.OWNER) @Post(':id/merge')
  merge(@Param('id', ParseIntPipe) id: number, @Body() dto: MergeDto, @CurrentUser() u: AuthUser) {
    return this.svc.merge(id, dto.targetId, u);
  }

  @Roles(Role.OWNER) @Post(':id/anonymize')
  anonymize(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.anonymize(id, u);
  }

  @Roles(Role.OWNER) @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.remove(id, u);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Appointment, Invoice, UserAccount])],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
