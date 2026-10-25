import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Role } from '../common/enums';
import { Customer } from '../customers/customer.entity';
import { Employee } from '../employees/employee.entities';

/** Tài khoản đăng nhập. Gắn với Employee (nhân viên) hoặc Customer (thành viên). */
@Entity('user_accounts')
export class UserAccount extends BaseEntity {
  /** Mã nhân viên, email hoặc số điện thoại của khách. */
  @Column({ unique: true, length: 120 })
  username: string;

  /** bcrypt hash — không lưu mật khẩu dạng văn bản (NFR-07). */
  @Column({ select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ default: true })
  active: boolean;

  /** Bắt buộc đổi mật khẩu ở lần đăng nhập tới (tài khoản mới tạo / vừa cấp lại). */
  @Column({ default: false })
  mustChangePassword: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @OneToOne(() => Employee, { nullable: true, eager: true })
  @JoinColumn()
  employee: Employee | null;

  @OneToOne(() => Customer, { nullable: true, eager: true })
  @JoinColumn()
  customer: Customer | null;
}

/** Yêu cầu cấp lại mật khẩu của khách (không có SMS/OTP — lễ tân gọi xác minh rồi cấp mật khẩu tạm). */
@Entity('password_reset_requests')
export class PasswordResetRequest extends BaseEntity {
  @Column({ length: 20 })
  phone: string;

  @Column({ length: 120 })
  fullName: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** PENDING | DONE | REJECTED */
  @Column({ length: 10, default: 'PENDING' })
  status: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  handledBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  handledAt: Date | null;
}
