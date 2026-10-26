/** Kiểu dữ liệu trả về từ API (xem docs/API.md). */
export type Audience = 'LONG' | 'SHORT' | 'ALL';

export interface Service {
  id: number;
  code: string;
  name: string;
  category: string;
  audience: Audience;
  basePrice: number;
  priceFrom: boolean;
  durationMinutes: number;
  description: string | null;
  status: string;
  depositRequired: boolean;
}

export interface Stylist {
  id: number;
  fullName: string;
  level: string | null;
  bio: string | null;
  skills: { id: number; name: string; category: string }[];
}

export interface SalonInfo {
  name: string;
  openTime: string;
  closeTime: string;
  hotline: string;
  address: string;
  cancelLockHours: number;
  graceMinutes: number;
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

export interface Person {
  id: number;
  fullName: string;
}

export interface AppointmentItem {
  id: number;
  service: Service;
  leadStylist: Person;
  assistant: Person | null;
  startAt: string;
  endAt: string;
  quotedPrice: number;
}

export interface Appointment {
  id: number;
  code: string;
  startAt: string;
  endAt: string;
  status: string;
  source: string;
  autoAssigned?: boolean;
  depositStatus: 'NOT_REQUIRED' | 'REQUIRED' | 'PAID' | 'FORFEITED';
  depositAmount: number;
  note: string | null;
  statusReason: string | null;
  /** Salon đã tự đổi stylist/giờ vì stylist xin nghỉ */
  stylistChangeNote?: string | null;
  items: AppointmentItem[];
}

export interface Customer {
  id: number;
  code: string;
  fullName: string;
  phone: string;
  birthDate: string | null;
  isMember: boolean;
  noShowCount: number;
  firstVisitPromoUsed: boolean;
  visitCount: number;
  lastVisitAt: string | null;
}

export interface InvoiceSummary {
  id: number;
  code: string;
  paidAt: string | null;
  total: number;
  items: { description: string; unitPrice: number; quantity: number; discount: number }[];
  stylists: string[];
}

export interface CustomerDetail {
  customer: Customer;
  appointments: Appointment[];
  invoices: InvoiceSummary[];
}

export interface Complaint {
  id: number;
  code: string;
  subject: string;
  content: string;
  status: string;
  createdAt: string;
  resolution: string | null;
  invoice: { id: number; code: string } | null;
}

export interface Consultation {
  id: number;
  consultant: { fullName: string };
  needs: string;
  hairCondition: string | null;
  budget: number | null;
  proposal: string;
  result: 'ACCEPTED' | 'DECLINED' | 'FOLLOW_UP';
  createdAt: string;
}
