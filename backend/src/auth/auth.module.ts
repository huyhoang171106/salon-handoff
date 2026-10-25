import {
  Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe,
  Patch, Post, Query, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { PasswordResetRequest, UserAccount } from './user-account.entity';
import { Customer } from '../customers/customer.entity';
import { Employee } from '../employees/employee.entities';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { EmployeePosition, EmployeeStatus, Role } from '../common/enums';
import { AuditService, CodeService } from '../common/shared.services';

const PHONE = /^0\d{9,10}$/;
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;
const PASSWORD_MSG = 'Mật khẩu tối thiểu 6 ký tự, có cả chữ và số';

export class LoginDto {
  @IsString() @IsNotEmpty({ message: 'Nhập tài khoản' }) username: string;
  @IsString() @IsNotEmpty({ message: 'Nhập mật khẩu' }) password: string;
}

export class RegisterDto {
  @IsString() @IsNotEmpty({ message: 'Nhập họ tên' }) @MaxLength(120) fullName: string;
  @Matches(PHONE, { message: 'Số điện thoại không hợp lệ' }) phone: string;
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password: string;
  @IsOptional() @IsString() birthDate?: string;
}

export class ChangePasswordDto {
  @IsString() @IsNotEmpty({ message: 'Nhập mật khẩu hiện tại' }) oldPassword: string;
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) newPassword: string;
}

export class ForgotPasswordDto {
  @Matches(PHONE, { message: 'Số điện thoại không hợp lệ' }) phone: string;
  @IsString() @IsNotEmpty({ message: 'Nhập họ tên' }) fullName: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreateAccountDto {
  @IsInt() employeeId: number;
  /** Mặc định = mã nhân viên */
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9._-]{3,40}$/, { message: 'Tên đăng nhập 3–40 ký tự, không dấu, không khoảng trắng' }) username?: string;
  /** Bỏ trống để hệ thống tạo mật khẩu tạm */
  @IsOptional() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password?: string;
}

export class UpdateAccountDto {
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ResetPasswordDto {
  /** Bỏ trống để hệ thống tạo mật khẩu tạm */
  @IsOptional() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) newPassword?: string;
}

export class HandleResetRequestDto {
  @IsIn(['DONE', 'REJECTED']) status: 'DONE' | 'REJECTED';
}

const POSITION_ROLE: Record<EmployeePosition, Role> = {
  [EmployeePosition.OWNER]: Role.OWNER,
  [EmployeePosition.RECEPTIONIST]: Role.RECEPTIONIST,
  [EmployeePosition.STYLIST]: Role.STYLIST,
  [EmployeePosition.ASSISTANT]: Role.ASSISTANT,
};

/** Mật khẩu tạm dễ đọc qua điện thoại: 4 chữ + 4 số, bỏ các ký tự dễ nhầm. */
export function tempPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  let s = '';
  for (let i = 0; i < 4; i++) s += letters[randomInt(letters.length)];
  for (let i = 0; i < 4; i++) s += String(randomInt(2, 10));
  return s;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserAccount) private readonly accounts: Repository<UserAccount>,
    @InjectRepository(PasswordResetRequest) private readonly resets: Repository<PasswordResetRequest>,
    private readonly jwt: JwtService,
    private readonly ds: DataSource,
    private readonly codes: CodeService,
    private readonly audit: AuditService,
  ) {}

  static hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  toAuthUser(acc: UserAccount): AuthUser & { username: string; mustChangePassword: boolean } {
    return {
      accountId: acc.id,
      role: acc.role,
      employeeId: acc.employee?.id ?? null,
      customerId: acc.customer?.id ?? null,
      name: acc.employee?.fullName ?? acc.customer?.fullName ?? acc.username,
      username: acc.username,
      mustChangePassword: acc.mustChangePassword,
    };
  }

  private issue(acc: UserAccount) {
    const user = this.toAuthUser(acc);
    const { username, mustChangePassword, ...claims } = user;
    return { accessToken: this.jwt.sign(claims), user };
  }

  private withHash(where: string, params: Record<string, unknown>) {
    return this.accounts.createQueryBuilder('a').addSelect('a.passwordHash')
      .leftJoinAndSelect('a.employee', 'e').leftJoinAndSelect('a.customer', 'c').where(where, params);
  }

  async login(dto: LoginDto) {
    const acc = await this.withHash('LOWER(a.username) = LOWER(:u)', { u: dto.username.trim() }).getOne();
    if (!acc || !(await bcrypt.compare(dto.password, acc.passwordHash))) {
      throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');
    }
    if (!acc.active) throw new UnauthorizedException('Tài khoản đã bị khóa — liên hệ chủ salon');
    if (acc.employee && acc.employee.status === EmployeeStatus.INACTIVE) throw new UnauthorizedException('Nhân viên đã nghỉ việc, tài khoản không còn hiệu lực');
    acc.lastLoginAt = new Date();
    await this.accounts.update(acc.id, { lastLoginAt: acc.lastLoginAt });
    return this.issue(acc);
  }

  /** Lấy thông tin mới nhất từ CSDL (JWT có thể đã cũ sau khi đổi mật khẩu). */
  async me(user: AuthUser) {
    const acc = await this.accounts.findOne({ where: { id: user.accountId } });
    if (!acc || !acc.active) throw new UnauthorizedException('Phiên đăng nhập không còn hiệu lực');
    return this.toAuthUser(acc);
  }

  /** Đăng ký thành viên (mục 3.4): dùng lại hồ sơ khách nếu SĐT đã có. */
  async registerCustomer(dto: RegisterDto) {
    return this.ds.transaction(async (m) => {
      if (await m.findOne(UserAccount, { where: { username: dto.phone } })) {
        throw new ConflictException('Số điện thoại đã có tài khoản — hãy đăng nhập hoặc dùng "Quên mật khẩu"');
      }
      let customer = await m.findOne(Customer, { where: { phone: dto.phone } });
      if (!customer) {
        customer = m.create(Customer, { code: await this.codes.next('KH', m), fullName: dto.fullName, phone: dto.phone });
      }
      customer.fullName = dto.fullName.trim();
      customer.birthDate = dto.birthDate || customer.birthDate || null;
      customer.isMember = true;
      customer.memberSince = customer.memberSince ?? new Date();
      customer = await m.save(customer);
      const acc = await m.save(
        m.create(UserAccount, { username: dto.phone, passwordHash: await AuthService.hash(dto.password), role: Role.CUSTOMER, customer, lastLoginAt: new Date() }),
      );
      acc.customer = customer;
      acc.employee = null;
      return this.issue(acc);
    });
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto) {
    const acc = await this.withHash('a.id = :id', { id: user.accountId }).getOneOrFail();
    if (!(await bcrypt.compare(dto.oldPassword, acc.passwordHash))) throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    if (dto.oldPassword === dto.newPassword) throw new ConflictException('Mật khẩu mới phải khác mật khẩu cũ');
    await this.accounts.update(acc.id, { passwordHash: await AuthService.hash(dto.newPassword), mustChangePassword: false });
    acc.mustChangePassword = false;
    return this.issue(acc);
  }

  /** Khách quên mật khẩu: ghi nhận yêu cầu; luôn trả lời giống nhau để không lộ SĐT nào có tài khoản. */
  async forgotPassword(dto: ForgotPasswordDto) {
    const pending = await this.resets.findOne({ where: { phone: dto.phone, status: 'PENDING' } });
    if (!pending) await this.resets.save(this.resets.create({ phone: dto.phone, fullName: dto.fullName.trim(), note: dto.note ?? null }));
    return { ok: true, message: 'Đã gửi yêu cầu. Lễ tân sẽ gọi lại số điện thoại này để xác minh và cấp mật khẩu tạm.' };
  }

  // ---------------------------------------------------------------- Quản lý tài khoản (chủ salon)

  async listStaffAccounts() {
    const employees = await this.ds.getRepository(Employee).find({ order: { position: 'ASC', code: 'ASC' } });
    const accs = await this.accounts.find({ where: { employee: { id: Not(IsNull()) } } });
    return employees.map((e) => {
      const a = accs.find((x) => x.employee?.id === e.id);
      return {
        employee: { id: e.id, code: e.code, fullName: e.fullName, position: e.position, level: e.level, status: e.status, phone: e.phone },
        account: a ? { id: a.id, username: a.username, role: a.role, active: a.active, mustChangePassword: a.mustChangePassword, lastLoginAt: a.lastLoginAt, createdAt: a.createdAt } : null,
      };
    });
  }

  /** Tạo tài khoản đăng nhập cho nhân viên đã có hồ sơ. Trả mật khẩu tạm một lần duy nhất. */
  async createStaffAccount(dto: CreateAccountDto, user: AuthUser) {
    const e = await this.ds.getRepository(Employee).findOneBy({ id: dto.employeeId });
    if (!e) throw new NotFoundException('Không tìm thấy nhân viên');
    if (await this.accounts.findOne({ where: { employee: { id: e.id } } })) throw new ConflictException('Nhân viên này đã có tài khoản');
    const username = (dto.username ?? e.code).trim();
    if (await this.accounts.createQueryBuilder('a').where('LOWER(a.username) = LOWER(:u)', { u: username }).getOne()) {
      throw new ConflictException('Tên đăng nhập đã được dùng');
    }
    const password = dto.password ?? tempPassword();
    const acc = await this.accounts.save(this.accounts.create({
      username, passwordHash: await AuthService.hash(password), role: POSITION_ROLE[e.position], employee: e, mustChangePassword: true,
    }));
    await this.audit.log(user, 'ACCOUNT_CREATE', 'UserAccount', acc.id, `Tạo tài khoản "${username}" cho ${e.code} ${e.fullName}`);
    return { account: { id: acc.id, username, role: acc.role }, temporaryPassword: password };
  }

  async updateAccount(id: number, dto: UpdateAccountDto, user: AuthUser) {
    const acc = await this.accounts.findOne({ where: { id } });
    if (!acc) throw new NotFoundException('Không tìm thấy tài khoản');
    if (acc.id === user.accountId && dto.active === false) throw new ForbiddenException('Không thể tự khóa tài khoản của mình');
    if (dto.active != null) acc.active = dto.active;
    await this.accounts.update(id, { active: acc.active });
    await this.audit.log(user, acc.active ? 'ACCOUNT_UNLOCK' : 'ACCOUNT_LOCK', 'UserAccount', id, `${acc.active ? 'Mở khóa' : 'Khóa'} tài khoản "${acc.username}"`);
    return { id, active: acc.active };
  }

  /**
   * Cấp lại mật khẩu. Chủ salon cấp cho mọi tài khoản; lễ tân chỉ cấp cho tài khoản khách.
   * Người dùng phải đổi mật khẩu ở lần đăng nhập kế tiếp.
   */
  async resetPassword(id: number, dto: ResetPasswordDto, user: AuthUser) {
    const acc = await this.accounts.findOne({ where: { id } });
    if (!acc) throw new NotFoundException('Không tìm thấy tài khoản');
    if (user.role === Role.RECEPTIONIST && acc.role !== Role.CUSTOMER) throw new ForbiddenException('Lễ tân chỉ cấp lại mật khẩu cho khách');
    const password = dto.newPassword ?? tempPassword();
    await this.accounts.update(id, { passwordHash: await AuthService.hash(password), mustChangePassword: true, active: true });
    await this.audit.log(user, 'PASSWORD_RESET', 'UserAccount', id, `Cấp lại mật khẩu cho "${acc.username}"`);
    return { username: acc.username, temporaryPassword: password };
  }

  // ---------------------------------------------------------------- Yêu cầu cấp lại mật khẩu khách (lễ tân)

  async listResetRequests(status?: string) {
    const list = await this.resets.find({ where: status ? { status } : {}, order: { createdAt: 'DESC' }, take: 100 });
    const accs = list.length ? await this.accounts.find({ where: { username: In(list.map((r) => r.phone)), role: Role.CUSTOMER } }) : [];
    return list.map((r) => {
      const a = accs.find((x) => x.username === r.phone);
      return { ...r, account: a ? { id: a.id, username: a.username, active: a.active, customerName: a.customer?.fullName ?? null } : null };
    });
  }

  async handleResetRequest(id: number, dto: HandleResetRequestDto, user: AuthUser) {
    const r = await this.resets.findOneBy({ id });
    if (!r) throw new NotFoundException('Không tìm thấy yêu cầu');
    if (r.status !== 'PENDING') throw new ConflictException('Yêu cầu đã được xử lý');
    let result: { username: string; temporaryPassword: string } | null = null;
    if (dto.status === 'DONE') {
      const acc = await this.accounts.findOne({ where: { username: r.phone, role: Role.CUSTOMER } });
      if (!acc) throw new NotFoundException('Số điện thoại này chưa có tài khoản thành viên');
      result = await this.resetPassword(acc.id, {}, user);
    }
    r.status = dto.status;
    r.handledBy = user.name;
    r.handledAt = new Date();
    await this.resets.save(r);
    return { request: r, ...(result ?? {}) };
  }
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public() @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.registerCustomer(dto);
  }

  @Public() @Post('forgot-password')
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  /** Trả token mới kèm user (mustChangePassword = false). */
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto);
  }
}

@ApiTags('accounts')
@Controller()
export class AccountsController {
  constructor(private readonly auth: AuthService) {}

  @Roles(Role.OWNER) @Get('accounts')
  list() {
    return this.auth.listStaffAccounts();
  }

  @Roles(Role.OWNER) @Post('accounts')
  create(@Body() dto: CreateAccountDto, @CurrentUser() u: AuthUser) {
    return this.auth.createStaffAccount(dto, u);
  }

  @Roles(Role.OWNER) @Patch('accounts/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAccountDto, @CurrentUser() u: AuthUser) {
    return this.auth.updateAccount(id, dto, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Post('accounts/:id/reset-password')
  reset(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto, @CurrentUser() u: AuthUser) {
    return this.auth.resetPassword(id, dto, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Get('password-requests')
  requests(@Query('status') status?: string) {
    return this.auth.listResetRequests(status);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Post('password-requests/:id')
  handle(@Param('id', ParseIntPipe) id: number, @Body() dto: HandleResetRequestDto, @CurrentUser() u: AuthUser) {
    return this.auth.handleResetRequest(id, dto, u);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([UserAccount, PasswordResetRequest, Customer, Employee])],
  controllers: [AuthController, AccountsController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}

