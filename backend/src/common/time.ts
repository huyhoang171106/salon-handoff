/**
 * Tiện ích thời gian theo giờ Việt Nam (UTC+7, không có giờ mùa hè).
 * Dữ liệu được lưu dạng timestamptz; mọi phép tính "giờ salon" đi qua đây.
 */
export const VN_OFFSET_MIN = 7 * 60;

/** "2026-10-22" + "13:30" -> Date (UTC) tương ứng giờ Việt Nam. */
export function vnDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time.length === 5 ? time + ':00' : time}+07:00`);
}

/** Date -> "YYYY-MM-DD" theo giờ Việt Nam. */
export function vnDateString(d: Date): string {
  const shifted = new Date(d.getTime() + VN_OFFSET_MIN * 60000);
  return shifted.toISOString().slice(0, 10);
}

/** Date -> "HH:mm" theo giờ Việt Nam. */
export function vnTimeString(d: Date): string {
  const shifted = new Date(d.getTime() + VN_OFFSET_MIN * 60000);
  return shifted.toISOString().slice(11, 16);
}

/** "HH:mm" -> số phút trong ngày. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60000);
}

/** Hai khoảng [aStart,aEnd) và [bStart,bEnd) có giao nhau không. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Đầu và cuối ngày (giờ VN) của một ngày "YYYY-MM-DD", dạng UTC. */
export function vnDayRange(date: string): { from: Date; to: Date } {
  const from = vnDateTime(date, '00:00');
  return { from, to: addMinutes(from, 24 * 60) };
}
