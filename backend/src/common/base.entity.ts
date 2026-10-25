import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Lớp cơ sở cho mọi entity: khóa chính và mốc thời gian. */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** Cột tiền VND lưu số nguyên; pg trả bigint dạng chuỗi nên cần chuyển về number. */
export const moneyColumn = {
  type: 'bigint' as const,
  default: 0,
  transformer: { to: (v: number) => v, from: (v: string | null) => (v == null ? 0 : Number(v)) },
};
