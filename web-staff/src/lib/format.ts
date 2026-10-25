/** Định dạng tiền VND, ngày giờ theo múi giờ Việt Nam (NFR-11). */
const TZ = 'Asia/Ho_Chi_Minh';

export const vnd = (n: number | null | undefined) => `${(n ?? 0).toLocaleString('vi-VN')} ₫`;

export const time = (iso: string | Date) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });

export const date = (iso: string | Date) => new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });

export const dateTime = (iso: string | Date) => `${date(iso)} ${time(iso)}`;

export const weekday = (iso: string | Date) => new Date(iso).toLocaleDateString('vi-VN', { weekday: 'short', timeZone: TZ });

/** "YYYY-MM-DD" của hôm nay (+offset ngày) theo giờ Việt Nam. */
export function todayVN(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000 + 7 * 3600000);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" -> "T5 22/10" */
export function shortDay(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00+07:00');
  const dows = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return `${dows[d.getUTCDay()]} ${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

export const APPOINTMENT_STATUS: Record<string, { label: string; tone: string }> = {
  BOOKED: { label: 'Chờ xác nhận', tone: 'neutral' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'ok' },
  LATE: { label: 'Đến trễ', tone: 'warn' },
  CHECKED_IN: { label: 'Đã check-in', tone: 'info' },
  IN_SERVICE: { label: 'Đang phục vụ', tone: 'info' },
  COMPLETED: { label: 'Hoàn thành', tone: 'ok' },
  CANCELLED: { label: 'Đã hủy', tone: 'bad' },
  NO_SHOW: { label: 'Vắng mặt', tone: 'bad' },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  PENDING: { label: 'Chờ thanh toán', tone: 'warn' },
  PAID: { label: 'Đã thanh toán', tone: 'ok' },
  CANCELLED: { label: 'Đã hủy', tone: 'bad' },
};

export const COMPLAINT_STATUS: Record<string, { label: string; tone: string }> = {
  RECEIVED: { label: 'Đã tiếp nhận', tone: 'neutral' },
  IN_PROGRESS: { label: 'Đang xử lý', tone: 'info' },
  WAITING_CUSTOMER: { label: 'Chờ khách', tone: 'warn' },
  RESOLVED: { label: 'Đã giải quyết', tone: 'ok' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
};
