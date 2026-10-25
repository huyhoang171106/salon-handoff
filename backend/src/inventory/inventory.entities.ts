import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity, moneyColumn } from '../common/base.entity';
import { InventoryTxType, ProductKind } from '../common/enums';
import { Employee } from '../employees/employee.entities';

/** Sản phẩm bán lẻ hoặc nguyên vật liệu dùng trong dịch vụ (mục 3.7). */
@Entity('products')
export class Product extends BaseEntity {
  @Column({ unique: true, length: 30 })
  sku: string;

  @Column({ length: 160 })
  name: string;

  @Column({ type: 'enum', enum: ProductKind })
  kind: ProductKind;

  /** Đơn vị đóng gói: chai, tuýp, hộp... */
  @Column({ length: 20 })
  unit: string;

  /** Giá bán lẻ hiện tại (0 với nguyên vật liệu). */
  @Column(moneyColumn)
  price: number;

  @Column({ default: 0 })
  stock: number;

  /** Mức tồn tối thiểu để cảnh báo (FR-19). */
  @Column({ default: 0 })
  minStock: number;

  @Column({ default: true })
  active: boolean;

  isLow(): boolean {
    return this.stock <= this.minStock;
  }
}

/** Biến động kho. quantity có dấu: + nhập, - xuất. */
@Entity('inventory_transactions')
export class InventoryTransaction extends BaseEntity {
  @ManyToOne(() => Product, { eager: true })
  product: Product;

  @Column({ type: 'enum', enum: InventoryTxType })
  type: InventoryTxType;

  @Column()
  quantity: number;

  @Column()
  stockAfter: number;

  @Column(moneyColumn)
  unitCost: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  reference: string | null;

  @ManyToOne(() => Employee, { nullable: true, eager: true })
  recordedBy: Employee | null;
}
