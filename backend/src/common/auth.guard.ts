import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ALLOW_MUST_CHANGE_KEY, AuthUser, PUBLIC_KEY, ROLES_KEY } from './auth.decorators';
import { EmployeeStatus, Role } from './enums';

/**
 * Guard toàn cục: đọc JWT (nếu có), đối chiếu trạng thái tài khoản trong CSDL, chặn endpoint nội bộ
 * khi chưa đăng nhập (NFR-05) và kiểm tra vai trò (NFR-06).
 * Trạng thái khóa / nghỉ việc / bắt đổi mật khẩu / vai trò lấy từ CSDL mỗi request nên có hiệu lực ngay,
 * không đợi token hết hạn.
 * ponytail: một truy vấn khóa chính mỗi request; thêm cache vài giây nếu tải tăng.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets);
    const header: string | undefined = req.headers['authorization'];
    let mustChange = false;
    let blocked: string | null = null;
    if (header?.startsWith('Bearer ')) {
      try {
        const claims = this.jwt.verify<AuthUser>(header.slice(7));
        const [row]: { active: boolean; role: Role; mustChangePassword: boolean; empStatus: EmployeeStatus | null }[] = await this.ds.query(
          `SELECT a.active, a.role, a."mustChangePassword", e.status AS "empStatus"
             FROM user_accounts a LEFT JOIN employees e ON e.id = a."employeeId" WHERE a.id = $1`,
          [claims.accountId],
        );
        if (!row) blocked = 'Phiên đăng nhập không còn hiệu lực';
        else if (!row.active) blocked = 'Tài khoản đã bị khóa — liên hệ chủ salon';
        else if (row.empStatus === EmployeeStatus.INACTIVE) blocked = 'Nhân viên đã nghỉ việc, tài khoản không còn hiệu lực';
        else {
          req.user = { ...claims, role: row.role };
          mustChange = row.mustChangePassword;
        }
      } catch {
        req.user = undefined;
      }
    }
    if (isPublic) return true;
    if (blocked) throw new UnauthorizedException(blocked);
    if (!req.user) throw new UnauthorizedException('Vui lòng đăng nhập');
    if (mustChange && !this.reflector.getAllAndOverride<boolean>(ALLOW_MUST_CHANGE_KEY, targets)) {
      throw new ForbiddenException('Bạn cần đổi mật khẩu trước khi tiếp tục');
    }
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(req.user.role)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }
    return true;
  }
}
