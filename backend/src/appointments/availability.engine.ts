import { addMinutes, minutesOf, overlaps, vnDateTime, vnTimeString } from '../common/time';

export interface EngineService {
  id: number;
  name: string;
  durationMinutes: number;
  needsAssistant: boolean;
  /** 0 = cần thợ phụ suốt dịch vụ */
  assistantMinutes: number;
  bookable: boolean;
  /** Loại thiết bị bắt buộc (BR-14), null = không cần. */
  equipmentKind?: string | null;
}

/** Tình trạng một loại thiết bị trong ngày: số máy dùng được và các khoảng đang bị lịch khác chiếm. */
export interface EngineEquipment {
  name: string;
  units: number;
  busy: { start: Date; end: Date }[];
}

export interface EngineEmployee {
  id: number;
  name: string;
  active: boolean;
  skillIds: number[];
  /** Ca trong ngày đang xét, dạng phút trong ngày [start, end). Rỗng = nghỉ. */
  shifts: { start: number; end: number }[];
  /** Các khoảng bận (lịch hẹn khác). */
  busy: { start: Date; end: Date }[];
}

export interface PlannedItem {
  serviceId: number;
  leadId: number;
  assistantId: number | null;
  start: Date;
  end: Date;
  assistantStart: Date | null;
  assistantEnd: Date | null;
}

export interface SlotResult {
  time: string;
  available: boolean;
  /** Lý do không khả dụng (hiển thị cho khách / lễ tân). */
  reason?: string;
  rule?: string;
  plan?: PlannedItem[];
}

export interface EngineInput {
  date: string;
  services: EngineService[];
  stylists: EngineEmployee[];
  assistants: EngineEmployee[];
  preferredStylistId?: number | null;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  now: Date;
  /** Theo loại thiết bị (EQUIPMENT_KINDS). */
  equipment?: Record<string, EngineEquipment>;
  /** Lý do salon đóng cửa cả ngày (nghỉ lễ...); có giá trị thì không nhận lịch (FR-05). */
  closedReason?: string | null;
}

/**
 * Bộ máy tính khung giờ khả dụng (FR-04, BR-01..05, BR-14, BR-17).
 * Các dịch vụ được làm nối tiếp bởi cùng một thợ chính; với mỗi giai đoạn cần hỗ trợ
 * phải còn ít nhất một thợ phụ rảnh và đang trong ca.
 */
export class AvailabilityEngine {
  constructor(private readonly input: EngineInput) {}

  totalDuration(): number {
    return this.input.services.reduce((s, x) => s + x.durationMinutes, 0);
  }

  /** Danh sách mọi khung giờ trong ngày với kết quả kiểm tra. */
  slots(): SlotResult[] {
    const { openTime, closeTime, slotMinutes } = this.input;
    const out: SlotResult[] = [];
    for (let m = minutesOf(openTime); m < minutesOf(closeTime); m += slotMinutes) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      out.push(this.check(`${hh}:${mm}`));
    }
    return out;
  }

  /** Kiểm tra một giờ bắt đầu cụ thể. */
  check(time: string): SlotResult {
    const { date, services, openTime, closeTime, now } = this.input;
    const start = vnDateTime(date, time);
    const fail = (rule: string, reason: string): SlotResult => ({ time, available: false, rule, reason });

    if (services.length === 0) return fail('INPUT', 'Chưa chọn dịch vụ');
    const stopped = services.find((s) => !s.bookable);
    if (stopped) return fail('BR-05', `Dịch vụ "${stopped.name}" đã ngừng cung cấp`);
    if (this.input.closedReason) return fail('CLOSED', `Salon nghỉ ngày này: ${this.input.closedReason}`);
    if (start <= now) return fail('PAST', 'Đã qua giờ này');

    const end = addMinutes(start, this.totalDuration());
    const endMin = minutesOf(time) + this.totalDuration();
    if (minutesOf(time) < minutesOf(openTime) || endMin > minutesOf(closeTime)) {
      return fail('BR-03', 'Vượt quá giờ hoạt động của salon');
    }

    const noEquipment = this.equipmentShortage(start);
    if (noEquipment) return fail('BR-14', noEquipment);

    const leads = this.candidateLeads();
    if (leads.length === 0) return fail('BR-04', 'Không có stylist phù hợp chuyên môn');

    let lastReason: SlotResult = fail('BR-02', 'Stylist không làm việc giờ này');
    for (const lead of leads) {
      if (!this.inShift(lead, minutesOf(time), endMin)) {
        lastReason = fail('BR-02', `${lead.name} không trong ca làm việc`);
        continue;
      }
      if (lead.busy.some((b) => overlaps(start, end, b.start, b.end))) {
        lastReason = fail('BR-01', `${lead.name} đã có lịch`);
        continue;
      }
      const plan = this.planWithAssistants(lead, start);
      if (!plan) {
        lastReason = fail('BR-17', 'Không còn thợ phụ hỗ trợ');
        continue;
      }
      return { time, available: true, plan };
    }
    return lastReason;
  }

  /** Thợ (stylist hoặc phụ) có trong ca và rảnh suốt [start, end) không (dùng cho dịch vụ phát sinh giữa phiên). */
  staffFree(id: number, start: Date, end: Date): boolean {
    const a = [...this.input.stylists, ...this.input.assistants].find((x) => x.id === id);
    if (!a || !a.active) return false;
    const s0 = minutesOf(vnTimeString(start));
    return this.inShift(a, s0, s0 + Math.round((end.getTime() - start.getTime()) / 60000)) && !a.busy.some((b) => overlaps(start, end, b.start, b.end));
  }

  /** Từng stylist đủ chuyên môn có nhận được khung giờ này không (dùng khi khách muốn đổi thợ). */
  stylistOptions(time: string): { id: number; name: string; available: boolean; reason?: string }[] {
    const { stylists, services } = this.input;
    return stylists
      .filter((s) => s.active && services.every((sv) => s.skillIds.includes(sv.id)))
      .map((s) => {
        const r = new AvailabilityEngine({ ...this.input, preferredStylistId: s.id }).check(time);
        return { id: s.id, name: s.name, available: r.available, reason: r.reason };
      });
  }

  /**
   * BR-14: thiết bị hỏng/bảo trì không tính là khả dụng. Các dịch vụ làm nối tiếp nên khung giờ
   * của từng dịch vụ không phụ thuộc thợ; mỗi khung cần số lịch khác đang dùng cùng loại < số máy.
   */
  private equipmentShortage(start: Date): string | null {
    let cursor = start;
    for (const sv of this.input.services) {
      const end = addMinutes(cursor, sv.durationMinutes);
      const kind = sv.equipmentKind;
      if (kind) {
        const eq = this.input.equipment?.[kind];
        if (!eq || eq.units === 0) return `${eq?.name ?? kind} đang hỏng hoặc bảo trì, chưa nhận "${sv.name}"`;
        const inWindow = eq.busy.filter((b) => overlaps(cursor, end, b.start, b.end));
        // Số lịch dùng đồng thời lớn nhất chỉ đổi ở đầu khung hoặc đầu một khoảng bận.
        const peak = Math.max(
          ...[cursor, ...inWindow.map((b) => b.start)]
            .filter((t) => t >= cursor)
            .map((t) => inWindow.filter((b) => b.start <= t && t < b.end).length),
        );
        if (peak >= eq.units) return `Hết ${eq.name.toLowerCase()} trống cho "${sv.name}" giờ này`;
      }
      cursor = end;
    }
    return null;
  }

  private candidateLeads(): EngineEmployee[] {
    const { stylists, services, preferredStylistId } = this.input;
    return stylists.filter(
      (s) =>
        s.active &&
        (!preferredStylistId || s.id === preferredStylistId) &&
        services.every((sv) => s.skillIds.includes(sv.id)),
    );
  }

  private inShift(e: EngineEmployee, startMin: number, endMin: number): boolean {
    return e.shifts.some((sh) => startMin >= sh.start && endMin <= sh.end);
  }

  private planWithAssistants(lead: EngineEmployee, start: Date): PlannedItem[] | null {
    const plan: PlannedItem[] = [];
    let cursor = start;
    const taken: { id: number; start: Date; end: Date }[] = [];
    for (const sv of this.input.services) {
      const itemEnd = addMinutes(cursor, sv.durationMinutes);
      let assistantId: number | null = null;
      let aStart: Date | null = null;
      let aEnd: Date | null = null;
      if (sv.needsAssistant) {
        aStart = cursor;
        aEnd = addMinutes(cursor, sv.assistantMinutes > 0 ? Math.min(sv.assistantMinutes, sv.durationMinutes) : sv.durationMinutes);
        const s0 = minutesOf(vnTimeString(aStart));
        const e0 = s0 + Math.round((aEnd.getTime() - aStart.getTime()) / 60000);
        const found = this.input.assistants.find(
          (a) =>
            a.active &&
            this.inShift(a, s0, e0) &&
            !a.busy.some((b) => overlaps(aStart!, aEnd!, b.start, b.end)) &&
            !taken.some((t) => t.id === a.id && overlaps(aStart!, aEnd!, t.start, t.end)),
        );
        if (!found) return null;
        assistantId = found.id;
        taken.push({ id: found.id, start: aStart, end: aEnd });
      }
      plan.push({ serviceId: sv.id, leadId: lead.id, assistantId, start: cursor, end: itemEnd, assistantStart: aStart, assistantEnd: aEnd });
      cursor = itemEnd;
    }
    return plan;
  }
}
