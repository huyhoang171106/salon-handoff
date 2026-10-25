import { Column, Entity, Index, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity, moneyColumn } from '../common/base.entity';
import { AssignmentRole, InvoiceItemType, InvoiceStatus, PaymentMethod, PaymentStatus, PromotionType } from '../common/enums';
import { Customer } from '../customers/customer.entity';
import { Employee } from '../employees/employee.entities';
import { ServiceSession } from '../sessions/session.entities';

/** Hóa đơn. Tổng tiền và giá từng dòng được chốt tại thời điểm lập (BR-07). */
@Entity('invoices')
export class Invoice extends BaseEntity {
  @Column({ unique: true, length: 20 })
  code: string;

  @ManyToOne(() => ServiceSession, { nullable: true, eager: true })
  session: ServiceSession | null;

  @ManyToOne(() => Customer, { nullable: true, eager: true })
  customer: Customer | null;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Column(moneyColumn)
  subtotal: number;

  @Column(moneyColumn)
  discountTotal: number;

  @Column(moneyColumn)
  total: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  promotionName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'text', nullable: true })
  cancelReason: string | null;

  @ManyToOne(() => Employee, { nullable: true, eager: true })
  createdBy: Employee | null;

  @OneToMany(() => InvoiceItem, (i) => i.invoice, { cascade: true, eager: true })
  items: InvoiceItem[];

  @OneToMany(() => Payment, (p) => p.invoice, { eager: true })
  payments: Payment[];

  /** Tính lại tổng từ các dòng. */
  recalculate(): void {
    const items = this.items ?? [];
    this.subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    this.discountTotal = items.reduce((s, i) => s + i.discount, 0);
    this.total = Math.max(0, this.subtotal - this.discountTotal);
  }

  paidAmount(): number {
    return (this.payments ?? []).filter((p) => p.status === PaymentStatus.SUCCEEDED).reduce((s, p) => s + p.amount, 0);
  }

  isEditable(): boolean {
    return this.status === InvoiceStatus.DRAFT || this.status === InvoiceStatus.PENDING;
  }
}

/** Dòng hóa đơn: lưu tên, đơn giá thực tế, giảm giá của dòng. */
@Entity('invoice_items')
export class InvoiceItem extends BaseEntity {
  @ManyToOne(() => Invoice, (i) => i.items, { onDelete: 'CASCADE' })
  invoice: Invoice;

  @Column({ type: 'enum', enum: InvoiceItemType })
  type: InvoiceItemType;

  /** id của ServiceSessionItem (SERVICE) hoặc Product (PRODUCT). */
  @Column()
  refId: number;

  @Column({ length: 200 })
  description: string;

  @Column(moneyColumn)
  unitPrice: number;

  @Column({ default: 1 })
  quantity: number;

  @Column(moneyColumn)
  discount: number;

  lineTotal(): number {
    return this.unitPrice * this.quantity - this.discount;
  }
}

/** Giao dịch thanh toán. `reference` duy nhất để chống ghi nhận trùng (BR-15). */
@Entity('payments')
export class Payment extends BaseEntity {
  @ManyToOne(() => Invoice, (i) => i.payments, { onDelete: 'CASCADE' })
  invoice: Invoice;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column(moneyColumn)
  amount: number;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.INITIATED })
  status: PaymentStatus;

  @Index({ unique: true })
  @Column({ length: 80 })
  reference: string;

  @ManyToOne(() => Employee, { nullable: true, eager: true })
  recordedBy: Employee | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;
}

/** Chương trình khuyến mãi (mục 3.5). */
@Entity('promotions')
export class Promotion extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ type: 'enum', enum: PromotionType })
  type: PromotionType;

  /** % (0-100) hoặc số tiền VND. */
  @Column({ type: 'bigint', transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  value: number;

  @Column({ default: true })
  memberOnly: boolean;

  /** Chỉ áp dụng lần đầu sau khi đăng ký thành viên. */
  @Column({ default: false })
  firstVisitOnly: boolean;

  /** null = mọi nhóm dịch vụ. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  serviceCategory: string | null;

  @Column({ type: 'date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({ default: true })
  active: boolean;

  isValidOn(date: string): boolean {
    if (!this.active) return false;
    if (this.startDate && date < this.startDate) return false;
    if (this.endDate && date > this.endDate) return false;
    return true;
  }
}

/** Dòng hoa hồng bất biến, chốt khi hóa đơn thanh toán thành công (BR-08). */
@Entity('commission_lines')
export class CommissionLine extends BaseEntity {
  @ManyToOne(() => Employee, { eager: true })
  employee: Employee;

  @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
  invoice: Invoice;

  @Column()
  invoiceItemId: number;

  @Column({ length: 200 })
  serviceName: string;

  @Column({ type: 'enum', enum: AssignmentRole })
  role: AssignmentRole;

  /** Giá dịch vụ dùng làm cơ sở tính. */
  @Column(moneyColumn)
  baseAmount: number;

  /** Diễn giải cách tính, vd "Quỹ 10% × 70%". */
  @Column({ length: 200 })
  formula: string;

  @Column(moneyColumn)
  amount: number;

  @Index()
  @Column({ type: 'timestamptz' })
  earnedAt: Date;
}
