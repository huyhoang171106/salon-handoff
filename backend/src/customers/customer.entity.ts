import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/** Khách hàng (mục 2.1). Chỉ lưu thông tin phục vụ nghiệp vụ. */
@Entity('customers')
export class Customer extends BaseEntity {
  @Column({ unique: true, length: 20 })
  code: string;

  @Column({ length: 120 })
  fullName: string;

  @Index({ unique: true })
  @Column({ length: 20 })
  phone: string;

  @Column({ type: 'date', nullable: true })
  birthDate: string | null;

  /** Ghi chú về tóc / công thức màu — chỉ nhân viên xem. */
  @Column({ type: 'text', nullable: true })
  hairNotes: string | null;

  @Column({ default: false })
  isMember: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  memberSince: Date | null;

  /** Số lần bùng lịch (BR-20). */
  @Column({ default: 0 })
  noShowCount: number;

  /** Đã dùng ưu đãi "lần đầu sau khi đăng ký" chưa. */
  @Column({ default: false })
  firstVisitPromoUsed: boolean;

  /** Hồ sơ "Khách vãng lai" dùng chung cho walk-in không để lại thông tin. Không đăng ký, không tính no-show. */
  @Column({ default: false })
  isAnonymous: boolean;

  /** Đã ẩn danh theo yêu cầu xóa dữ liệu cá nhân (§22). Lịch sử giao dịch vẫn giữ để đối soát. */
  @Column({ type: 'timestamptz', nullable: true })
  anonymizedAt: Date | null;

  @Column({ default: 0 })
  visitCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastVisitAt: Date | null;

  /** Khách có từ N lần no-show trở lên thì phải đặt cọc / gọi hotline. */
  requiresDeposit(threshold: number): boolean {
    return !this.isAnonymous && this.noShowCount >= threshold;
  }

  registerNoShow(): void {
    if (!this.isAnonymous) this.noShowCount += 1;
  }

  recordVisit(at: Date): void {
    this.visitCount += 1;
    this.lastVisitAt = at;
  }
}
