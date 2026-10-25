import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from './enums';

export const ROLES_KEY = 'roles';
export const PUBLIC_KEY = 'public';

/** Giới hạn endpoint theo vai trò (bảng phân quyền 5.3). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Endpoint không cần đăng nhập (xem dịch vụ, đặt lịch khách vãng lai...). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export interface AuthUser {
  accountId: number;
  role: Role;
  employeeId: number | null;
  customerId: number | null;
  name: string;
}

/** Lấy người dùng đang đăng nhập (null nếu endpoint Public và chưa đăng nhập). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | null => {
  return ctx.switchToHttp().getRequest().user ?? null;
});
