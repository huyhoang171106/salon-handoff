/** Kiểu dữ liệu trả về từ API (rút gọn theo docs/API.md và mã nguồn backend). */
export type Position = 'OWNER' | 'RECEPTIONIST' | 'STYLIST' | 'ASSISTANT';

export interface Service {
  id: number;
  code: string;
  name: string;
  category: string;
  audience: 'LONG' | 'SHORT' | 'ALL';
  basePrice: number;
  priceFrom: boolean;
  durationMinutes: number;
  description: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'DISCONTINUED';
  needsAssistant: boolean;
  assistantMinutes: number;
  commissionRate: number;
  commissionMode: 'PERCENT_SPLIT' | 'FIXED_TASK';
  leadShare: number;
  assistantFixedFee: number;
  depositRequired: boolean;
  requiredEquipment: string | null;
}

export interface Employee {
  id: number;
  code: string;
  fullName: string;
  phone: string | null;
  position: Position;
  level: string | null;
  bio: string | null;
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
  publicProfile: boolean;
  skills?: Service[];
  username?: string | null;
}

export interface Shift {
  id: number;
  employee: Employee;
  date: string;
  startTime: string;
  endTime: string;
  status: 'SCHEDULED' | 'ABSENT';
  note: string | null;
  leaveStart: string | null;
  leaveEnd: string | null;
  leaveReason: string | null;
}

export interface LeaveRequest {
  id: number;
  employee: Employee;
  date: string;
  fromTime: string;
  toTime: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  handledBy: string | null;
  handledNote: string | null;
}

export interface Customer {
  id: number;
  code: string;
  fullName: string;
  phone: string;
  birthDate: string | null;
  hairNotes?: string | null;
  isMember: boolean;
  noShowCount: number;
  visitCount: number;
  lastVisitAt: string | null;
}

export interface AppointmentItem {
  id: number;
  service: Service;
  leadStylist: Employee;
  assistant: Employee | null;
  startAt: string;
  endAt: string;
  assistantStartAt: string | null;
  assistantEndAt: string | null;
  quotedPrice: number;
}

export type AppointmentStatus = 'BOOKED' | 'CONFIRMED' | 'LATE' | 'CHECKED_IN' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface Appointment {
  id: number;
  code: string;
  customer: Customer;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  source: 'ONLINE_GUEST' | 'ONLINE_MEMBER' | 'RECEPTION' | 'WALK_IN';
  depositStatus: 'NOT_REQUIRED' | 'REQUIRED' | 'PAID' | 'FORFEITED' | 'REFUNDED';
  depositAmount: number;
  note: string | null;
  statusReason: string | null;
  checkedInAt: string | null;
  remindedAt: string | null;
  /** Salon đã tự đổi thợ/giờ vì thợ xin nghỉ — hỏi lại khách lúc check-in */
  stylistChangeNote: string | null;
  items: AppointmentItem[];
}

export interface Slot {
  time: string;
  available: boolean;
  reason?: string;
  rule?: string;
}

export interface Availability {
  date: string;
  totalDuration: number;
  totalPrice: number;
  depositRequired: boolean;
  slots: Slot[];
}

export interface Assignment {
  id: number;
  employee: Employee;
  role: 'LEAD_STYLIST' | 'ASSISTANT';
  shareOverride: number | null;
  fixedFeeOverride: number | null;
}

export interface SessionItem {
  id: number;
  service: Service;
  agreedPrice: number;
  status: 'PROPOSED' | 'CONFIRMED' | 'DONE' | 'REMOVED';
  confirmationNote: string | null;
  assignments: Assignment[];
}

export interface Session {
  id: number;
  code: string;
  appointment: Appointment | null;
  customer: Customer | null;
  walkInName: string | null;
  status: 'OPEN' | 'IN_SERVICE' | 'AWAITING_PAYMENT' | 'COMPLETED' | 'CANCELLED';
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  chair: string | null;
  items: SessionItem[];
}

export interface InvoiceItem {
  id: number;
  type: 'SERVICE' | 'PRODUCT' | 'ADJUSTMENT';
  refId: number;
  description: string;
  unitPrice: number;
  quantity: number;
  discount: number;
}

export interface Payment {
  id: number;
  method: 'CASH' | 'TRANSFER' | 'DEPOSIT' | 'REFUND';
  amount: number;
  status: 'INITIATED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  reference: string;
  createdAt: string;
  confirmedAt: string | null;
}

export interface Invoice {
  id: number;
  code: string;
  status: 'DRAFT' | 'PENDING' | 'PAID' | 'CANCELLED';
  subtotal: number;
  discountTotal: number;
  total: number;
  promotionName: string | null;
  paidAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  customer: Customer | null;
  session: Session | null;
  items: InvoiceItem[];
  payments: Payment[];
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  kind: 'RETAIL' | 'MATERIAL';
  unit: string;
  price: number;
  stock: number;
  minStock: number;
  active: boolean;
}

export interface InventoryTx {
  id: number;
  product: Product;
  type: 'RECEIPT' | 'SALE' | 'USAGE' | 'ADJUSTMENT' | 'DAMAGE';
  quantity: number;
  stockAfter: number;
  unitCost: number;
  note: string | null;
  reference: string | null;
  createdAt: string;
  recordedBy: Employee | null;
}

export interface CommissionResult {
  total: number;
  lines: { id: number; earnedAt: string; invoiceCode: string; serviceName: string; role: 'LEAD_STYLIST' | 'ASSISTANT'; baseAmount: number; formula: string; amount: number }[];
}

export interface Promotion {
  id: number;
  name: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
  memberOnly: boolean;
  firstVisitOnly: boolean;
  serviceCategory: string | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
}

export interface ComplaintHistory {
  id: number;
  status: string;
  note: string | null;
  actorName: string;
  createdAt: string;
}

export interface Complaint {
  id: number;
  code: string;
  customer: Customer | null;
  invoice: Invoice | null;
  subject: string;
  content: string;
  status: 'RECEIVED' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
  receivedBy: Employee | null;
  assignee: Employee | null;
  resolution: string | null;
  createdAt: string;
  history: ComplaintHistory[];
}

export interface Equipment {
  id: number;
  code: string;
  name: string;
  kind: string;
  location: string | null;
  purchaseDate: string | null;
  cost: number;
  status: 'IN_USE' | 'MAINTENANCE' | 'BROKEN' | 'RETIRED';
  maintenance: { id: number; date: string; description: string; cost: number }[];
}

export interface Expense {
  id: number;
  date: string;
  category: string;
  amount: number;
  content: string;
  recordedBy: Employee | null;
}

export interface AuditLog {
  id: number;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
}

export interface Summary {
  from: string;
  to: string;
  revenue: number;
  invoices: number;
  discounts: number;
  expenses: number;
  profitEstimate: number;
  appointments: { total: number; walkIn: number; booked: number; completed: number; cancelled: number; noShow: number; pending: number };
  byDay: { date: string; revenue: number; invoices: number }[];
  byService: { name: string; count: number; revenue: number }[];
  byProduct: { name: string; count: number; revenue: number }[];
  byEmployee: { id: number; code: string; fullName: string; position: Position; leadCount: number; assistCount: number; revenue: number; commission: number }[];
  busyHours: { hour: number; count: number }[];
  lowStock: { id: number; sku: string; name: string; stock: number; minStock: number; unit: string }[];
  complaints: { status: string; count: number }[];
  equipmentIssues: { id: number; code: string; name: string; status: string }[];
}

export interface Consultation {
  id: number;
  customer: Customer | null;
  consultant: Employee;
  needs: string;
  hairCondition: string | null;
  budget: number | null;
  proposal: string;
  result: 'ACCEPTED' | 'DECLINED' | 'FOLLOW_UP';
  createdAt: string;
}
