import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthUser, PUBLIC_KEY, ROLES_KEY } from './auth.decorators';
import { Role } from './enums';

/**
 * Guard toàn cục: đọc JWT (nếu có), chặn endpoint nội bộ khi chưa đăng nhập (NFR-05)
 * và kiểm tra vai trò (NFR-06).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (header?.startsWith('Bearer ')) {
      try {
        req.user = this.jwt.verify<AuthUser>(header.slice(7));
      } catch {
        req.user = undefined;
      }
    }
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets);
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException('Vui lòng đăng nhập');
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(req.user.role)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }
    return true;
  }
}
