import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity, moneyColumn } from '../common/base.entity';
import { ComplaintStatus, ConsultationResult, EquipmentStatus } from '../common/enums';
import { Customer } from '../customers/customer.entity';
import { Employee } from '../employees/employee.entities';
import { Invoice } from '../billing/billing.entities';
import { UserAccount } from '../auth/user-account.entity';

/** Khiếu nại / phản hồi (mục 3.10, BR-13: không xóa lịch sử). */
@Entity('complaints')
export class Complaint extends BaseEntity {
  @Column({ unique: true, length: 20 })
  code: string;

  @ManyToOne(() => Customer, { nullable: true, eager: true })
  customer: Customer | null;

  @ManyToOne(() => Invoice, { nullable: true, eager: true })
  invoice: Invoice | null;

  @Column({ length: 200 })
  subject: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: ComplaintStatus, default: ComplaintStatus.RECEIVED })
  status: ComplaintStatus;

  @ManyToOne(() => Employee, { nullable: true, eager: true })
  receivedBy: Employee | null;

  @ManyToOne(() => Employee, { nullable: true, eager: true })
  assignee: Employee | null;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @OneToMany(() => ComplaintHistory, (h) => h.complaint, { cascade: true, eager: true })
  history: ComplaintHistory[];
}

@Entity('complaint_history')
export class ComplaintHistory extends BaseEntity {
  @ManyToOne(() => Complaint, (c) => c.history, { onDelete: 'CASCADE' })
  complaint: Complaint;

  @Column({ type: 'enum', enum: ComplaintStatus })
  status: ComplaintStatus;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ length: 120 })
  actorName: string;
}

/** Thiết bị (mục 3.11, BR-14). */
@Entity('equipment')
export class Equipment extends BaseEntity {
  @Column({ unique: true, length: 20 })
  code: string;

  @Column({ length: 120 })
  name: string;

  /** Loại tài nguyên (EQUIPMENT_KINDS): ghế, giường gội, máy hấp... — dịch vụ tham chiếu loại này (BR-14). */
  @Column({ length: 20, default: 'KHAC' })
  kind: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  location: string | null;

  @Column({ type: 'date', nullable: true })
  purchaseDate: string | null;

  @Column(moneyColumn)
  cost: number;

  @Column({ type: 'enum', enum: EquipmentStatus, default: EquipmentStatus.IN_USE })
  status: EquipmentStatus;

  @OneToMany(() => MaintenanceRecord, (m) => m.equipment, { eager: true })
  maintenance: MaintenanceRecord[];

  isAvailable(): boolean {
    return this.status === EquipmentStatus.IN_USE;
  }
}

@Entity('maintenance_records')
export class MaintenanceRecord extends BaseEntity {
  @ManyToOne(() => Equipment, (e) => e.maintenance, { onDelete: 'CASCADE' })
  equipment: Equipment;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'text' })
  description: string;

  @Column(moneyColumn)
  cost: number;
}

/** Chi phí vận hành (mục 3.11, BR-16). */
@Entity('expenses')
export class ExpenseRecord extends BaseEntity {
  @Column({ type: 'date' })
  date: string;

  /** ĐIỆN NƯỚC, VẬT TƯ, SỬA CHỮA, MẶT BẰNG, KHÁC */
  @Column({ length: 40 })
  category: string;

  @Column(moneyColumn)
  amount: number;

  @Column({ type: 'text' })
  content: string;

  @ManyToOne(() => Employee, { nullable: true, eager: true })
  recordedBy: Employee | null;
}

/** Phiên tư vấn trước khi chốt dịch vụ (mục 3.1.1). */
@Entity('consultations')
export class Consultation extends BaseEntity {
  @ManyToOne(() => Customer, { nullable: true, eager: true })
  customer: Customer | null;

  @ManyToOne(() => Employee, { eager: true })
  consultant: Employee;

  @Column({ type: 'text' })
  needs: string;

  @Column({ type: 'text', nullable: true })
  hairCondition: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v == null ? null : Number(v)) } })
  budget: number | null;

  @Column({ type: 'text' })
  proposal: string;

  @Column({ type: 'enum', enum: ConsultationResult })
  result: ConsultationResult;
}

/** Nhật ký thao tác quan trọng (NFR-08). */
@Entity('audit_logs')
export class AuditLog extends BaseEntity {
  @ManyToOne(() => UserAccount, { nullable: true, eager: false })
  actor: UserAccount | null;

  @Column({ length: 120 })
  actorName: string;

  @Column({ length: 60 })
  action: string;

  @Column({ length: 60 })
  entity: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  entityId: string | null;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'jsonb', nullable: true })
  before: unknown;

  @Column({ type: 'jsonb', nullable: true })
  after: unknown;
}

/** Bộ đếm sinh mã nghiệp vụ (KH-00001, LH-00001...). */
@Entity('code_sequences')
export class CodeSequence {
  @Column({ primary: true, length: 10 })
  prefix: string;

  @Column({ default: 0 })
  value: number;
}
