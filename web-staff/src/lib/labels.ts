/** Nhãn tiếng Việt cho các trạng thái / vai trò (luôn đi kèm màu). */
import type { Role } from './auth';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'gold' | 'neutral';
export type LabelMap = Record<string, { label: string; tone: Tone | string }>;

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Chủ salon',
  RECEPTIONIST: 'Lễ tân',
  STYLIST: 'Stylist',
  ASSISTANT: 'Thợ phụ',
  CUSTOMER: 'Khách hàng',
};

export const POSITION_LABEL: Record<string, string> = {
  OWNER: 'Chủ salon',
  RECEPTIONIST: 'Lễ tân',
  STYLIST: 'Thợ chính',
  ASSISTANT: 'Thợ phụ',
};

export const EMPLOYEE_STATUS: LabelMap = {
  ACTIVE: { label: 'Đang làm', tone: 'ok' },
  ON_LEAVE: { label: 'Nghỉ phép', tone: 'warn' },
  INACTIVE: { label: 'Đã nghỉ việc', tone: 'neutral' },
};

export const SESSION_STATUS: LabelMap = {
  OPEN: { label: 'Đã check-in', tone: 'ok' },
  IN_SERVICE: { label: 'Đang phục vụ', tone: 'info' },
  AWAITING_PAYMENT: { label: 'Chờ thanh toán', tone: 'gold' },
  COMPLETED: { label: 'Hoàn tất', tone: 'ok' },
  CANCELLED: { label: 'Đã hủy', tone: 'bad' },
};

export const ITEM_STATUS: LabelMap = {
  PROPOSED: { label: 'Đề xuất · chờ khách', tone: 'warn' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'ok' },
  DONE: { label: 'Đã làm', tone: 'ok' },
  REMOVED: { label: 'Đã bỏ', tone: 'neutral' },
};

export const PAYMENT_STATUS: LabelMap = {
  INITIATED: { label: 'Khởi tạo', tone: 'neutral' },
  PROCESSING: { label: 'Chờ xác nhận', tone: 'warn' },
  SUCCEEDED: { label: 'Thành công', tone: 'ok' },
  FAILED: { label: 'Thất bại', tone: 'bad' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};

export const CONSULT_RESULT: LabelMap = {
  ACCEPTED: { label: 'Khách đồng ý', tone: 'ok' },
  DECLINED: { label: 'Khách từ chối', tone: 'bad' },
  FOLLOW_UP: { label: 'Cần tư vấn lại', tone: 'warn' },
};

export const SERVICE_STATUS: LabelMap = {
  ACTIVE: { label: 'Đang áp dụng', tone: 'ok' },
  PAUSED: { label: 'Tạm ngưng', tone: 'warn' },
  DISCONTINUED: { label: 'Ngừng cung cấp', tone: 'neutral' },
};

export const EQUIPMENT_STATUS: LabelMap = {
  IN_USE: { label: 'Đang dùng', tone: 'ok' },
  MAINTENANCE: { label: 'Đang bảo trì', tone: 'warn' },
  BROKEN: { label: 'Hỏng', tone: 'bad' },
  RETIRED: { label: 'Thanh lý', tone: 'neutral' },
};

/** Loại thiết bị/tài nguyên (Bảng 2) — trùng với EQUIPMENT_KINDS phía backend. */
export const EQUIPMENT_KIND: Record<string, string> = {
  GHE: 'Ghế cắt tóc',
  GUONG: 'Gương / bàn',
  GIUONG: 'Giường gội',
  SAY: 'Máy sấy',
  HAP: 'Máy hấp',
  UON: 'Máy uốn/duỗi',
  XE: 'Xe đẩy',
  KHAC: 'Khác',
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = { CASH: 'Tiền mặt', TRANSFER: 'Chuyển khoản', DEPOSIT: 'Trừ tiền cọc', REFUND: 'Hoàn tiền' };

export const LEAVE_STATUS: LabelMap = {
  PENDING: { label: 'Chờ duyệt', tone: 'warn' },
  APPROVED: { label: 'Đã duyệt', tone: 'ok' },
  REJECTED: { label: 'Từ chối', tone: 'bad' },
};

export const DEPOSIT_STATUS: LabelMap = {
  NOT_REQUIRED: { label: 'Không cần cọc', tone: 'neutral' },
  REQUIRED: { label: 'Chờ đặt cọc', tone: 'warn' },
  PAID: { label: 'Đã nhận cọc', tone: 'ok' },
  FORFEITED: { label: 'Mất cọc', tone: 'bad' },
  REFUNDED: { label: 'Đã hoàn cọc', tone: 'neutral' },
};

export const SOURCE_LABEL: Record<string, string> = {
  ONLINE_GUEST: 'Đặt online (khách lẻ)',
  ONLINE_MEMBER: 'Đặt online (thành viên)',
  RECEPTION: 'Lễ tân đặt',
  WALK_IN: 'Walk-in',
};

export const ASSIGN_ROLE: Record<string, string> = { LEAD_STYLIST: 'Thợ chính', ASSISTANT: 'Thợ phụ' };

export const TX_TYPE: Record<string, string> = {
  RECEIPT: 'Nhập kho',
  SALE: 'Bán',
  USAGE: 'Dùng cho dịch vụ',
  ADJUSTMENT: 'Điều chỉnh',
  DAMAGE: 'Hư hỏng',
};

export const COMMISSION_MODE: Record<string, string> = {
  PERCENT_SPLIT: 'Chia theo % quỹ',
  FIXED_TASK: 'Thợ phụ nhận khoán',
};

export const EXPENSE_CATEGORIES = ['ĐIỆN NƯỚC', 'VẬT TƯ', 'SỬA CHỮA', 'MẶT BẰNG', 'LƯƠNG', 'KHÁC'];
