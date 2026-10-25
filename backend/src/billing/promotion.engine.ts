import { PromotionType } from '../common/enums';

export interface PromoCustomer {
  isMember: boolean;
  firstVisitPromoUsed: boolean;
}

export interface PromoDefinition {
  id: number;
  name: string;
  type: PromotionType;
  value: number;
  memberOnly: boolean;
  firstVisitOnly: boolean;
  serviceCategory: string | null;
  isValidOn(date: string): boolean;
}

export interface PromoLine {
  key: number;
  category: string;
  amount: number;
}

export interface PromoResult {
  promotion: PromoDefinition | null;
  /** Giảm giá theo từng dòng (key -> số tiền). */
  discounts: Map<number, number>;
  total: number;
}

/**
 * Chọn MỘT chương trình khuyến mãi có lợi nhất cho khách (mục 3.5):
 * xác định khách → kiểm tra thành viên → điều kiện → tính mức giảm theo dòng dịch vụ.
 */
export class PromotionEngine {
  static best(customer: PromoCustomer | null, promos: PromoDefinition[], lines: PromoLine[], date: string): PromoResult {
    let best: PromoResult = { promotion: null, discounts: new Map(), total: 0 };
    for (const p of promos) {
      if (!p.isValidOn(date)) continue;
      if (p.memberOnly && !customer?.isMember) continue;
      if (p.firstVisitOnly && (!customer || customer.firstVisitPromoUsed)) continue;
      const eligible = lines.filter((l) => !p.serviceCategory || l.category === p.serviceCategory);
      if (eligible.length === 0) continue;
      const discounts = new Map<number, number>();
      if (p.type === PromotionType.PERCENT) {
        for (const l of eligible) discounts.set(l.key, Math.round((l.amount * Math.min(100, p.value)) / 100));
      } else {
        // Giảm số tiền cố định, phân bổ theo tỷ lệ giá các dòng
        const base = eligible.reduce((s, l) => s + l.amount, 0);
        const cap = Math.min(p.value, base);
        let used = 0;
        eligible.forEach((l, i) => {
          const d = i === eligible.length - 1 ? cap - used : Math.floor((cap * l.amount) / base);
          used += d;
          discounts.set(l.key, d);
        });
      }
      const total = [...discounts.values()].reduce((s, x) => s + x, 0);
      if (total > best.total) best = { promotion: p, discounts, total };
    }
    return best;
  }
}
