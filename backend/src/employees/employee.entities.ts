import { Column, Entity, Index, JoinTable, ManyToMany, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { EmployeePosition, EmployeeStatus, ShiftStatus } from '../common/enums';
import { SalonService } from '../catalog/service.entity';
import { minutesOf, vnDateString, vnTimeString } from '../common/time';

/** Nhân viên (mục 2.2): chủ, lễ tân, thợ chính, thợ phụ. */
@Entity('employees')
export class Employee extends BaseEntity {
  @Column({ unique: true, length: 20 })
  code: string;

  @Column({ length: 120 })
  fullName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: EmployeePosition })
  position: EmployeePosition;

  /** Cấp bậc hiển thị: MASTER STYLIST, SENIOR STYLIST... */
  @Column({ type: 'varchar', length: 40, nullable: true })
  level: string | null;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ type: 'enum', enum: EmployeeStatus, default: EmployeeStatus.ACTIVE })
  status: EmployeeStatus;

  /** Hiển thị trên website khách hàng. */
  @Column({ default: true })
  publicProfile: boolean;

  /** Các dịch vụ nhân viên có thể thực hiện (EmployeeService, BR-04). */
  @ManyToMany(() => SalonService, { eager: false })
  @JoinTable({ name: 'employee_services' })
  skills: SalonService[];

  @OneToMany(() => WorkShift, (s) => s.employee)
  shifts: WorkShift[];

  canPerform(serviceId: number): boolean {
    return (this.skills ?? []).some((s) => s.id === serviceId);
  }

  isWorking(): boolean {
    return this.status === EmployeeStatus.ACTIVE;
  }
}

/** Ca làm việc trong một ngày (BR-02). */
@Entity('work_shifts')
@Index(['employee', 'date'])
export class WorkShift extends BaseEntity {
  @ManyToOne(() => Employee, (e) => e.shifts, { onDelete: 'CASCADE', eager: true })
  employee: Employee;

  @Column({ type: 'date' })
  date: string;

  @Column({ length: 5 })
  startTime: string;

  @Column({ length: 5 })
  endTime: string;

  @Column({ type: 'enum', enum: ShiftStatus, default: ShiftStatus.SCHEDULED })
  status: ShiftStatus;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** Nghỉ giữa ca [leaveStart, leaveEnd), null = làm đủ ca. */
  @Column({ type: 'varchar', length: 5, nullable: true })
  leaveStart: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  leaveEnd: string | null;

  @Column({ type: 'text', nullable: true })
  leaveReason: string | null;

  /** Các khoảng thực sự làm việc trong ca (phút trong ngày), đã trừ phần nghỉ giữa ca. */
  workRanges(): { start: number; end: number }[] {
    if (this.status !== ShiftStatus.SCHEDULED) return [];
    const start = minutesOf(this.startTime);
    const end = minutesOf(this.endTime);
    if (!this.leaveStart || !this.leaveEnd) return [{ start, end }];
    const ls = minutesOf(this.leaveStart);
    const le = minutesOf(this.leaveEnd);
    return [{ start, end: ls }, { start: le, end }].filter((r) => r.end > r.start);
  }

  /** Ca có bao trọn khoảng [start, end) không (cùng ngày). */
  covers(start: Date, end: Date): boolean {
    if (vnDateString(start) !== this.date) return false;
    const s = minutesOf(vnTimeString(start));
    const e = vnDateString(end) === this.date ? minutesOf(vnTimeString(end)) : 24 * 60;
    return this.workRanges().some((r) => s >= r.start && e <= r.end);
  }
}
