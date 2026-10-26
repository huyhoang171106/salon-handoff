import { Column, Entity } from 'typeorm';
import { BaseEntity, moneyColumn } from '../common/base.entity';
import { CommissionMode, ServiceStatus } from '../common/enums';

/** Dịch vụ của salon (mục 2.3). Giá ở đây là giá HIỆN TẠI; hóa đơn lưu giá riêng (BR-07). */
@Entity('services')
export class SalonService extends BaseEntity {
  @Column({ unique: true, length: 20 })
  code: string;

  @Column({ length: 120 })
  name: string;

  /** Nhóm: CẮT, MÀU, HÓA CHẤT, TẠO KIỂU, HAIR SPA, GỘI SẤY, GÓI */
  @Column({ length: 40 })
  category: string;

  /** Đối tượng tham chiếu bảng giá: LONG (tóc dài/nữ), SHORT (tóc ngắn/nam), ALL */
  @Column({ length: 10, default: 'ALL' })
  audience: string;

  @Column(moneyColumn)
  basePrice: number;

  /** true nếu giá hiển thị là "Từ ..." */
  @Column({ default: false })
  priceFrom: boolean;

  @Column()
  durationMinutes: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ServiceStatus, default: ServiceStatus.ACTIVE })
  status: ServiceStatus;

  /** Dịch vụ cần thợ phụ (gội, xả hóa chất, sấy...) — dùng cho BR-17. */
  @Column({ default: false })
  needsAssistant: boolean;

  /** Số phút đầu tiên của dịch vụ cần thợ phụ (0 = toàn bộ). */
  @Column({ default: 0 })
  assistantMinutes: number;

  /** Quỹ hoa hồng tính trên giá thực tế, vd 0.1 = 10%. */
  @Column({ type: 'numeric', precision: 5, scale: 4, default: 0.1, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  commissionRate: number;

  @Column({ type: 'enum', enum: CommissionMode, default: CommissionMode.PERCENT_SPLIT })
  commissionMode: CommissionMode;

  /** Phần của thợ chính trong quỹ khi PERCENT_SPLIT (vd 0.7). Phần còn lại chia đều cho thợ phụ. */
  @Column({ type: 'numeric', precision: 5, scale: 4, default: 0.7, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  leadShare: number;

  /** Thù lao cố định mỗi thợ phụ khi FIXED_TASK (VND/lượt). */
  @Column(moneyColumn)
  assistantFixedFee: number;

  /** Loại thiết bị bắt buộc (EQUIPMENT_KINDS), null = không phụ thuộc thiết bị (BR-14). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  requiredEquipment: string | null;

  /** Dịch vụ lớn bắt buộc đặt cọc. */
  @Column({ default: false })
  depositRequired: boolean;

  isBookable(): boolean {
    return this.status === ServiceStatus.ACTIVE;
  }
}
