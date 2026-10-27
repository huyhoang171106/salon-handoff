import { PasswordResetRequest, UserAccount } from './auth/user-account.entity';
import { Customer } from './customers/customer.entity';
import { Employee, LeaveRequest, WorkShift } from './employees/employee.entities';
import { SalonService } from './catalog/service.entity';
import { Appointment, AppointmentItem, ClosedDay, WalkInQueueEntry } from './appointments/appointment.entities';
import { ServiceAssignment, ServiceSession, ServiceSessionItem } from './sessions/session.entities';
import { CommissionLine, Invoice, InvoiceItem, Payment, Promotion } from './billing/billing.entities';
import { InventoryTransaction, Product, ServiceMaterial } from './inventory/inventory.entities';
import {
  AuditLog, CodeSequence, Complaint, ComplaintHistory, Consultation, Equipment, ExpenseRecord, MaintenanceRecord,
} from './operations/operations.entities';

/** Toàn bộ lớp miền được ánh xạ xuống CSDL quan hệ. */
export const ENTITIES = [
  UserAccount, PasswordResetRequest, Customer, Employee, WorkShift, SalonService,
  Appointment, AppointmentItem, ServiceSession, ServiceSessionItem, ServiceAssignment,
  Invoice, InvoiceItem, Payment, Promotion, CommissionLine,
  Product, InventoryTransaction, ServiceMaterial, LeaveRequest, ClosedDay, WalkInQueueEntry,
  Complaint, ComplaintHistory, Equipment, MaintenanceRecord, ExpenseRecord, Consultation, AuditLog, CodeSequence,
];

export function dbOptions(env: Record<string, string | undefined>) {
  return {
    type: 'postgres' as const,
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 5432),
    username: env.DB_USER ?? 'salon',
    password: env.DB_PASSWORD ?? 'salon',
    database: env.DB_NAME ?? 'salon',
    entities: ENTITIES,
    synchronize: (env.DB_SYNC ?? 'true') === 'true',
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
  };
}
