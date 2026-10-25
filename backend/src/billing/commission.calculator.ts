import { AssignmentRole, CommissionMode } from '../common/enums';
import { BusinessRuleError } from '../common/business.error';

export interface CommissionServiceConfig {
  serviceName: string;
  /** Giá thực tế của dịch vụ sau giảm giá dòng. */
  price: number;
  rate: number;
  mode: CommissionMode;
  leadShare: number;
  assistantFixedFee: number;
}

export interface CommissionParticipant {
  employeeId: number;
  role: AssignmentRole;
  shareOverride?: number | null;
  fixedFeeOverride?: number | null;
}

export interface CommissionResult {
  employeeId: number;
  role: AssignmentRole;
  amount: number;
  formula: string;
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

/**
 * Tính hoa hồng cho một dịch vụ có nhiều nhân viên (mục 3.8.4, BR-19).
 * - PERCENT_SPLIT: quỹ = giá × rate; thợ chính leadShare, thợ phụ chia đều phần còn lại.
 *   Không có thợ phụ thì thợ chính nhận 100% quỹ. Có thể ghi đè tỷ lệ, tổng phải = 100%.
 * - FIXED_TASK: mỗi thợ phụ nhận thù lao cố định; thợ chính nhận phần quỹ còn lại.
 * Tổng tiền các dòng luôn khớp quỹ (phần lẻ do làm tròn dồn vào người cuối).
 */
export class CommissionCalculator {
  static compute(cfg: CommissionServiceConfig, people: CommissionParticipant[]): CommissionResult[] {
    if (cfg.price < 0) throw new BusinessRuleError('BR-06', 'Giá không được âm');
    const leads = people.filter((p) => p.role === AssignmentRole.LEAD_STYLIST);
    const assistants = people.filter((p) => p.role === AssignmentRole.ASSISTANT);
    if (leads.length === 0) throw new BusinessRuleError('BR-19', `Dịch vụ "${cfg.serviceName}" chưa có thợ chính`);
    const pool = Math.round(cfg.price * cfg.rate);

    if (cfg.mode === CommissionMode.FIXED_TASK) {
      const out: CommissionResult[] = assistants.map((a) => ({
        employeeId: a.employeeId,
        role: a.role,
        amount: a.fixedFeeOverride ?? cfg.assistantFixedFee,
        formula: 'Định mức cố định / lượt',
      }));
      const fixedTotal = out.reduce((s, r) => s + r.amount, 0);
      const remaining = Math.max(0, pool - fixedTotal);
      this.splitEvenly(remaining, leads).forEach((amt, i) =>
        out.unshift({
          employeeId: leads[i].employeeId,
          role: AssignmentRole.LEAD_STYLIST,
          amount: amt,
          formula: `Quỹ ${pct(cfg.rate)} trừ định mức thợ phụ`,
        }),
      );
      return out;
    }

    // PERCENT_SPLIT
    const hasOverride = people.some((p) => p.shareOverride != null);
    let shares: number[];
    if (hasOverride) {
      if (people.some((p) => p.shareOverride == null)) {
        throw new BusinessRuleError('BR-19', 'Khi chia tay, mọi nhân viên của dịch vụ đều phải có tỷ lệ');
      }
      shares = people.map((p) => p.shareOverride as number);
    } else if (assistants.length === 0) {
      shares = people.map(() => 1 / leads.length);
    } else {
      shares = people.map((p) =>
        p.role === AssignmentRole.LEAD_STYLIST ? cfg.leadShare / leads.length : (1 - cfg.leadShare) / assistants.length,
      );
    }
    const sum = shares.reduce((s, x) => s + x, 0);
    if (Math.abs(sum - 1) > 0.0001) {
      throw new BusinessRuleError('BR-19', `Tổng tỷ lệ chia hoa hồng phải bằng 100% (hiện ${pct(sum)})`);
    }
    const amounts = shares.map((s) => Math.floor(pool * s));
    amounts[amounts.length - 1] += pool - amounts.reduce((s, x) => s + x, 0);
    return people.map((p, i) => ({
      employeeId: p.employeeId,
      role: p.role,
      amount: amounts[i],
      formula: `Quỹ ${pct(cfg.rate)} × ${pct(shares[i])}`,
    }));
  }

  private static splitEvenly(total: number, people: unknown[]): number[] {
    const base = Math.floor(total / people.length);
    const arr = people.map(() => base);
    arr[0] += total - base * people.length;
    return arr;
  }
}
