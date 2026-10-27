import { Column, Entity, ManyToOne, OneToMany, OneToOne, JoinColumn } from 'typeorm';
import { BaseEntity, moneyColumn } from '../common/base.entity';
import { AssignmentRole, CommissionMode, SessionItemStatus, SessionStatus } from '../common/enums';
import { Appointment } from '../appointments/appointment.entities';
import { Customer } from '../customers/customer.entity';
import { Employee } from '../employees/employee.entities';
import { SalonService } from '../catalog/service.entity';

/** Phiên phục vụ (ServiceSession): tạo khi check-in hoặc tiếp nhận walk-in. */
@Entity('service_sessions')
export class ServiceSession extends BaseEntity {
  @Column({ unique: true, length: 20 })
  code: string;

  @OneToOne(() => Appointment, { nullable: true, eager: true })
  @JoinColumn()
  appointment: Appointment | null;

  /** Có thể null với khách walk-in chưa cung cấp thông tin. */
  @ManyToOne(() => Customer, { nullable: true, eager: true })
  customer: Customer | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  walkInName: string | null;

  @Column({ type: 'enum', enum: SessionStatus, default: SessionStatus.OPEN })
  status: SessionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  chair: string | null;

  @OneToMany(() => ServiceSessionItem, (i) => i.session, { cascade: true, eager: true })
  items: ServiceSessionItem[];

  activeItems(): ServiceSessionItem[] {
    return (this.items ?? []).filter((i) => i.status !== SessionItemStatus.REMOVED);
  }

  isEditable(): boolean {
    return [SessionStatus.OPEN, SessionStatus.IN_SERVICE].includes(this.status);
  }
}

/** Dịch vụ thực tế trong phiên. */
@Entity('service_session_items')
export class ServiceSessionItem extends BaseEntity {
  @ManyToOne(() => ServiceSession, (s) => s.items, { onDelete: 'CASCADE' })
  session: ServiceSession;

  @ManyToOne(() => SalonService, { eager: true })
  service: SalonService;

  /** Giá áp dụng cho khách (khách đã xác nhận, BR-12). */
  @Column(moneyColumn)
  agreedPrice: number;

  @Column({ type: 'enum', enum: SessionItemStatus, default: SessionItemStatus.CONFIRMED })
  status: SessionItemStatus;

  /** Ghi nhận xác nhận bổ sung của khách khi phát sinh dịch vụ (BR-12). */
  @Column({ type: 'text', nullable: true })
  confirmationNote: string | null;

  /**
   * Cấu hình hoa hồng chốt lúc thêm dịch vụ vào phiên (BR-08): đổi cấu hình dịch vụ sau đó
   * không làm đổi hoa hồng của phiên đã làm xong nhưng chưa thanh toán.
   */
  @Column({ type: 'numeric', precision: 5, scale: 4, default: 0.1, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  commissionRate: number;

  @Column({ type: 'enum', enum: CommissionMode, default: CommissionMode.PERCENT_SPLIT })
  commissionMode: CommissionMode;

  @Column({ type: 'numeric', precision: 5, scale: 4, default: 0.7, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  leadShare: number;

  @Column(moneyColumn)
  assistantFixedFee: number;

  /** AppointmentItem tạo thêm khi dịch vụ phát sinh kéo dài lịch (xóa lại nếu dịch vụ bị bỏ). */
  @Column({ type: 'int', nullable: true })
  appointmentItemId: number | null;

  @OneToMany(() => ServiceAssignment, (a) => a.item, { cascade: true, eager: true })
  assignments: ServiceAssignment[];

  commissionConfig() {
    return { serviceName: this.service.name, rate: this.commissionRate, mode: this.commissionMode, leadShare: this.leadShare, assistantFixedFee: this.assistantFixedFee };
  }

  lead(): ServiceAssignment | undefined {
    return (this.assignments ?? []).find((a) => a.role === AssignmentRole.LEAD_STYLIST);
  }
}

/** Phân công nhân viên cho một dịch vụ trong phiên (ServiceAssignment, mục 3.8.3). */
@Entity('service_assignments')
export class ServiceAssignment extends BaseEntity {
  @ManyToOne(() => ServiceSessionItem, (i) => i.assignments, { onDelete: 'CASCADE' })
  item: ServiceSessionItem;

  @ManyToOne(() => Employee, { eager: true })
  employee: Employee;

  @Column({ type: 'enum', enum: AssignmentRole })
  role: AssignmentRole;

  /** Ghi đè tỷ lệ trong quỹ hoa hồng (0..1); null = theo cấu hình dịch vụ. */
  @Column({ type: 'numeric', precision: 5, scale: 4, nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v == null ? null : Number(v)) } })
  shareOverride: number | null;

  /** Ghi đè thù lao cố định (VND); null = theo cấu hình dịch vụ. */
  @Column({ type: 'bigint', nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v == null ? null : Number(v)) } })
  fixedFeeOverride: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  performedAt: Date | null;
}
