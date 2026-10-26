import { Column, Entity, Index, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity, moneyColumn } from '../common/base.entity';
import { AppointmentSource, AppointmentStatus, DepositStatus } from '../common/enums';
import { Customer } from '../customers/customer.entity';
import { Employee } from '../employees/employee.entities';
import { SalonService } from '../catalog/service.entity';
import { BusinessRuleError } from '../common/business.error';

/** Các chuyển trạng thái hợp lệ của lịch hẹn (mục 4.3.1). */
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  [AppointmentStatus.BOOKED]: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED, AppointmentStatus.LATE, AppointmentStatus.CHECKED_IN, AppointmentStatus.NO_SHOW],
  [AppointmentStatus.CONFIRMED]: [AppointmentStatus.LATE, AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
  [AppointmentStatus.LATE]: [AppointmentStatus.CHECKED_IN, AppointmentStatus.NO_SHOW, AppointmentStatus.CANCELLED],
  [AppointmentStatus.CHECKED_IN]: [AppointmentStatus.IN_SERVICE, AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
  [AppointmentStatus.IN_SERVICE]: [AppointmentStatus.COMPLETED],
  [AppointmentStatus.COMPLETED]: [],
  [AppointmentStatus.CANCELLED]: [],
  [AppointmentStatus.NO_SHOW]: [],
};

/** Lịch hẹn (Appointment). */
@Entity('appointments')
export class Appointment extends BaseEntity {
  @Column({ unique: true, length: 20 })
  code: string;

  @ManyToOne(() => Customer, { eager: true })
  customer: Customer;

  @Index()
  @Column({ type: 'timestamptz' })
  startAt: Date;

  @Column({ type: 'timestamptz' })
  endAt: Date;

  @Column({ type: 'enum', enum: AppointmentStatus, default: AppointmentStatus.BOOKED })
  status: AppointmentStatus;

  @Column({ type: 'enum', enum: AppointmentSource })
  source: AppointmentSource;

  /** Khách để salon tự phân công thợ. */
  @Column({ default: false })
  autoAssigned: boolean;

  @Column({ type: 'enum', enum: DepositStatus, default: DepositStatus.NOT_REQUIRED })
  depositStatus: DepositStatus;

  @Column(moneyColumn)
  depositAmount: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'text', nullable: true })
  statusReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  checkedInAt: Date | null;

  /** Ghi chú khi salon tự đổi thợ/giờ vì thợ xin nghỉ; lễ tân hỏi lại khách lúc check-in. */
  @Column({ type: 'text', nullable: true })
  stylistChangeNote: string | null;

  /** Thời điểm đã gửi nhắc lịch tự động (FR-25). */
  @Column({ type: 'timestamptz', nullable: true })
  remindedAt: Date | null;

  @OneToMany(() => AppointmentItem, (i) => i.appointment, { cascade: true, eager: true })
  items: AppointmentItem[];

  canTransitionTo(next: AppointmentStatus): boolean {
    return TRANSITIONS[this.status].includes(next);
  }

  /** Chuyển trạng thái, ném lỗi nếu không hợp lệ (trạng thái kết thúc không đảo ngược). */
  transitionTo(next: AppointmentStatus, reason?: string): void {
    if (!this.canTransitionTo(next)) {
      throw new BusinessRuleError('LIFECYCLE', `Không thể chuyển lịch từ ${this.status} sang ${next}`);
    }
    this.status = next;
    if (reason) this.statusReason = reason;
  }

  /** Số giờ còn lại đến giờ hẹn tính từ `now`. */
  hoursUntilStart(now: Date): number {
    return (this.startAt.getTime() - now.getTime()) / 3600000;
  }

  totalQuoted(): number {
    return (this.items ?? []).reduce((s, i) => s + i.quotedPrice, 0);
  }
}

/** Chi tiết lịch hẹn: một dịch vụ với thợ chính và (nếu cần) thợ phụ. */
@Entity('appointment_items')
export class AppointmentItem extends BaseEntity {
  @ManyToOne(() => Appointment, (a) => a.items, { onDelete: 'CASCADE' })
  appointment: Appointment;

  @ManyToOne(() => SalonService, { eager: true })
  service: SalonService;

  @ManyToOne(() => Employee, { eager: true })
  leadStylist: Employee;

  @ManyToOne(() => Employee, { eager: true, nullable: true })
  assistant: Employee | null;

  @Column({ type: 'timestamptz' })
  startAt: Date;

  @Column({ type: 'timestamptz' })
  endAt: Date;

  /** Khoảng thời gian cần thợ phụ (nếu có). */
  @Column({ type: 'timestamptz', nullable: true })
  assistantStartAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  assistantEndAt: Date | null;

  /** Giá báo khi đặt (tham khảo, hóa đơn sẽ chốt giá riêng). */
  @Column(moneyColumn)
  quotedPrice: number;
}
