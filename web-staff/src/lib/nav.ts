import type { Role } from './auth';

export interface NavItem {
  to: string;
  label: string;
  roles: Role[];
}

const DESK: Role[] = ['OWNER', 'RECEPTIONIST'];
const OWNER: Role[] = ['OWNER'];
const CRAFT: Role[] = ['STYLIST', 'ASSISTANT'];
const CONSULT: Role[] = ['OWNER', 'RECEPTIONIST', 'STYLIST'];
const ALL_STAFF: Role[] = ['OWNER', 'RECEPTIONIST', 'STYLIST', 'ASSISTANT'];

/** Menu theo vai trò, thứ tự hiển thị trên thanh điều hướng. */
export const NAV: NavItem[] = [
  { to: '/tong-quan', label: 'Tổng quan', roles: OWNER },
  { to: '/lich-hom-nay', label: 'Lịch hôm nay', roles: DESK },
  { to: '/phuc-vu', label: 'Đang phục vụ', roles: DESK },
  { to: '/hoa-don', label: 'Hóa đơn', roles: DESK },
  { to: '/khach-hang', label: 'Khách hàng', roles: DESK },
  { to: '/nhan-vien', label: 'Nhân viên', roles: OWNER },
  { to: '/ca-lam', label: 'Ca làm việc', roles: OWNER },
  { to: '/dich-vu', label: 'Dịch vụ & giá', roles: OWNER },
  { to: '/hoa-hong', label: 'Hoa hồng', roles: OWNER },
  { to: '/khuyen-mai', label: 'Khuyến mãi', roles: OWNER },
  { to: '/kho', label: 'Kho', roles: DESK },
  { to: '/thiet-bi', label: 'Thiết bị', roles: OWNER },
  { to: '/chi-phi', label: 'Chi phí vận hành', roles: OWNER },
  { to: '/tu-van', label: 'Tư vấn', roles: CONSULT },
  { to: '/khieu-nai', label: 'Khiếu nại', roles: DESK },
  { to: '/yeu-cau-mat-khau', label: 'Yêu cầu mật khẩu', roles: DESK },
  { to: '/tai-khoan', label: 'Tài khoản nhân viên', roles: OWNER },
  { to: '/nhat-ky', label: 'Nhật ký thao tác', roles: OWNER },
  { to: '/ngay-cua-toi', label: 'Ngày của tôi', roles: CRAFT },
  { to: '/ca-cua-toi', label: 'Ca làm việc', roles: CRAFT },
  { to: '/hoa-hong-cua-toi', label: 'Hoa hồng của tôi', roles: CRAFT },
  { to: '/ho-so', label: 'Hồ sơ của tôi', roles: ALL_STAFF },
];

export function homeOf(role: Role): string {
  if (role === 'OWNER') return '/tong-quan';
  if (role === 'RECEPTIONIST') return '/lich-hom-nay';
  return '/ngay-cua-toi';
}
