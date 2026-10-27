/** Vai trò tài khoản đăng nhập (UserAccount.role). */
export enum Role {
  OWNER = 'OWNER',
  RECEPTIONIST = 'RECEPTIONIST',
  STYLIST = 'STYLIST',
  ASSISTANT = 'ASSISTANT',
  CUSTOMER = 'CUSTOMER',
}

export const STAFF_ROLES = [Role.OWNER, Role.RECEPTIONIST, Role.STYLIST, Role.ASSISTANT];

/** Chức danh nhân viên. Thợ chính = STYLIST, thợ phụ = ASSISTANT. */
export enum EmployeePosition {
  OWNER = 'OWNER',
  RECEPTIONIST = 'RECEPTIONIST',
  STYLIST = 'STYLIST',
  ASSISTANT = 'ASSISTANT',
}

export enum EmployeeStatus {
  ACTIVE = 'ACTIVE',
  ON_LEAVE = 'ON_LEAVE',
  INACTIVE = 'INACTIVE',
}

export enum ShiftStatus {
  SCHEDULED = 'SCHEDULED',
  ABSENT = 'ABSENT',
}

export enum ServiceStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DISCONTINUED = 'DISCONTINUED',
}

/** Cơ chế chia hoa hồng cho thợ phụ (mục 3.8.4). */
export enum CommissionMode {
  PERCENT_SPLIT = 'PERCENT_SPLIT',
  FIXED_TASK = 'FIXED_TASK',
}

/** Vòng đời lịch hẹn (mục 4.3.1). */
export enum AppointmentStatus {
  BOOKED = 'BOOKED',
  CONFIRMED = 'CONFIRMED',
  LATE = 'LATE',
  CHECKED_IN = 'CHECKED_IN',
  IN_SERVICE = 'IN_SERVICE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

/** Các trạng thái còn giữ chỗ của thợ (dùng để kiểm tra trùng lịch BR-01). */
export const BLOCKING_STATUSES = [
  AppointmentStatus.BOOKED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.LATE,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_SERVICE,
];

export enum AppointmentSource {
  ONLINE_GUEST = 'ONLINE_GUEST',
  ONLINE_MEMBER = 'ONLINE_MEMBER',
  RECEPTION = 'RECEPTION',
  WALK_IN = 'WALK_IN',
}

export enum DepositStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  REQUIRED = 'REQUIRED',
  PAID = 'PAID',
  FORFEITED = 'FORFEITED',
  REFUNDED = 'REFUNDED',
}

export enum SessionStatus {
  OPEN = 'OPEN',
  IN_SERVICE = 'IN_SERVICE',
  AWAITING_PAYMENT = 'AWAITING_PAYMENT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum SessionItemStatus {
  PROPOSED = 'PROPOSED',
  CONFIRMED = 'CONFIRMED',
  DONE = 'DONE',
  REMOVED = 'REMOVED',
}

export enum AssignmentRole {
  LEAD_STYLIST = 'LEAD_STYLIST',
  ASSISTANT = 'ASSISTANT',
}

/** Vòng đời hóa đơn (mục 4.3.2). */
export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export enum InvoiceItemType {
  SERVICE = 'SERVICE',
  PRODUCT = 'PRODUCT',
  /** Dòng điều chỉnh thủ công (giảm giá / phụ thu) có ghi lý do và audit. */
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum PaymentMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
  /** Tiền cọc đã nhận trước, trừ vào hóa đơn. */
  DEPOSIT = 'DEPOSIT',
  /** Hoàn tiền cho khách (số tiền âm). */
  REFUND = 'REFUND',
}

export enum PaymentStatus {
  INITIATED = 'INITIATED',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum PromotionType {
  PERCENT = 'PERCENT',
  AMOUNT = 'AMOUNT',
}

export enum ProductKind {
  RETAIL = 'RETAIL',
  MATERIAL = 'MATERIAL',
}

export enum InventoryTxType {
  RECEIPT = 'RECEIPT',
  SALE = 'SALE',
  USAGE = 'USAGE',
  ADJUSTMENT = 'ADJUSTMENT',
  DAMAGE = 'DAMAGE',
}

export enum LeaveRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum QueueStatus {
  WAITING = 'WAITING',
  SERVED = 'SERVED',
  CANCELLED = 'CANCELLED',
}

export enum ComplaintStatus {
  RECEIVED = 'RECEIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  WAITING_CUSTOMER = 'WAITING_CUSTOMER',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum EquipmentStatus {
  IN_USE = 'IN_USE',
  MAINTENANCE = 'MAINTENANCE',
  BROKEN = 'BROKEN',
  RETIRED = 'RETIRED',
}

/** Loại tài nguyên/thiết bị của salon (Bảng 2). */
export const EQUIPMENT_KINDS: Record<string, string> = {
  GHE: 'Ghế cắt tóc',
  GUONG: 'Gương / bàn',
  GIUONG: 'Giường gội',
  SAY: 'Máy sấy',
  HAP: 'Máy hấp',
  UON: 'Máy uốn/duỗi',
  XE: 'Xe đẩy',
  KHAC: 'Khác',
};

export enum ConsultationResult {
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  FOLLOW_UP = 'FOLLOW_UP',
}
