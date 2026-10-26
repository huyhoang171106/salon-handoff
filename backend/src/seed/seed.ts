import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import 'dotenv/config';
import { dbOptions } from '../entities';
import { SalonService } from '../catalog/service.entity';
import { Employee, WorkShift } from '../employees/employee.entities';
import { UserAccount } from '../auth/user-account.entity';
import { Customer } from '../customers/customer.entity';
import { Product } from '../inventory/inventory.entities';
import { Promotion } from '../billing/billing.entities';
import { Equipment, CodeSequence } from '../operations/operations.entities';
import { CommissionMode, EmployeePosition, EquipmentStatus, ProductKind, PromotionType, Role } from '../common/enums';
import { vnDateString } from '../common/time';


/**
 * Dữ liệu mẫu theo báo cáo lần 1 (bảng 1, 2, 4, 5). Chạy: npm run seed
 * Tài khoản demo (mật khẩu 123456): owner, letan, ST-001..ST-004, TP-001..TP-002, khách 0901234567
 */
async function main() {
  const ds = new DataSource({ ...dbOptions(process.env), synchronize: true, dropSchema: process.argv.includes('--reset') });
  await ds.initialize();
  const m = ds.manager;
  if ((await m.count(SalonService)) > 0 && !process.argv.includes('--reset')) {
    console.log('CSDL đã có dữ liệu. Dùng "npm run seed -- --reset" để xóa và tạo lại.');
    await ds.destroy();
    return;
  }
  const hash = await bcrypt.hash('123456', 10);

  // --- Dịch vụ (Bảng 4: tóc dài/nữ, Bảng 5: tóc ngắn/nam)
  const svc = (code: string, name: string, category: string, audience: string, basePrice: number, durationMinutes: number, extra: Partial<SalonService> = {}) =>
    m.create(SalonService, { code, name, category, audience, basePrice, durationMinutes, ...extra });
  const chem = { needsAssistant: true, assistantMinutes: 40, priceFrom: true, depositRequired: true };
  const services = await m.save([
    svc('DV-L01', 'Cắt tóc', 'CẮT', 'LONG', 100000, 30, { needsAssistant: true, assistantMinutes: 10 }),
    svc('DV-L02', 'Gội đầu, sấy tóc', 'GỘI SẤY', 'LONG', 50000, 20, { needsAssistant: true, commissionMode: CommissionMode.FIXED_TASK, assistantFixedFee: 20000, leadShare: 0 }),
    svc('DV-L03', 'Nhuộm tóc', 'MÀU', 'LONG', 500000, 120, chem),
    svc('DV-L04', 'Tẩy tóc (mỗi lần)', 'MÀU', 'LONG', 250000, 120, { ...chem, commissionMode: CommissionMode.FIXED_TASK, assistantFixedFee: 30000 }),
    svc('DV-L05', 'Uốn tóc', 'HÓA CHẤT', 'LONG', 500000, 120, chem),
    svc('DV-L06', 'Duỗi tóc', 'HÓA CHẤT', 'LONG', 500000, 120, chem),
    svc('DV-L07', 'Tạo kiểu tóc', 'TẠO KIỂU', 'LONG', 500000, 120, { priceFrom: true }),
    svc('DV-L08', 'Chăm sóc & phục hồi', 'HAIR SPA', 'LONG', 300000, 90, { priceFrom: true, needsAssistant: true, assistantMinutes: 30 }),
    svc('DV-S01', 'Cắt tóc nam', 'CẮT', 'SHORT', 80000, 30),
    svc('DV-S02', 'Gội đầu, sấy tóc nam', 'GỘI SẤY', 'SHORT', 50000, 15, { needsAssistant: true, commissionMode: CommissionMode.FIXED_TASK, assistantFixedFee: 20000, leadShare: 0 }),
    svc('DV-S03', 'Nhuộm tóc nam', 'MÀU', 'SHORT', 300000, 50, { needsAssistant: true, assistantMinutes: 20 }),
    svc('DV-S04', 'Tẩy tóc nam (mỗi lần)', 'MÀU', 'SHORT', 200000, 45, { needsAssistant: true, assistantMinutes: 20 }),
    svc('DV-S05', 'Tạo kiểu tóc nam', 'TẠO KIỂU', 'SHORT', 250000, 60),
    svc('DV-S06', 'Chăm sóc & phục hồi nam', 'HAIR SPA', 'SHORT', 200000, 90, { needsAssistant: true, assistantMinutes: 30 }),
  ]);
  const byCat = (...cats: string[]) => services.filter((s) => cats.includes(s.category));
  // Thiết bị bắt buộc theo nhóm dịch vụ (BR-14).
  const needs: Record<string, string> = { 'GỘI SẤY': 'GIUONG', 'HÓA CHẤT': 'UON', 'HAIR SPA': 'HAP' };
  services.forEach((s) => (s.requiredEquipment = needs[s.category] ?? null));
  await m.save(services);

  // --- Nhân viên
  const emp = (code: string, fullName: string, position: EmployeePosition, level: string | null, skills: SalonService[], bio: string | null = null) =>
    m.create(Employee, { code, fullName, position, level, skills, bio, phone: '09' + Math.floor(10000000 + Math.random() * 89999999) });
  const owner = emp('NV-001', 'Ngọc Hân', EmployeePosition.OWNER, 'CHỦ SALON', []);
  const reception = emp('NV-002', 'Thanh Mai', EmployeePosition.RECEPTIONIST, 'LỄ TÂN', []);
  const stylists = [
    emp('ST-001', 'Minh Anh', EmployeePosition.STYLIST, 'MASTER STYLIST', services, 'Chuyên màu nhuộm, balayage và tẩy.'),
    emp('ST-002', 'Quốc Thịnh', EmployeePosition.STYLIST, 'SENIOR STYLIST', byCat('CẮT', 'TẠO KIỂU', 'GỘI SẤY', 'HAIR SPA'), 'Cắt nam, fade và tạo kiểu.'),
    emp('ST-003', 'Thảo Linh', EmployeePosition.STYLIST, 'SENIOR STYLIST', byCat('HÓA CHẤT', 'HAIR SPA', 'CẮT', 'GỘI SẤY'), 'Uốn, duỗi và phục hồi tóc.'),
    emp('ST-004', 'Hải Nam', EmployeePosition.STYLIST, 'STYLIST', byCat('CẮT', 'MÀU', 'GỘI SẤY'), 'Cắt và nhuộm cơ bản.'),
  ];
  const assistants = [
    emp('TP-001', 'Bảo Ngọc', EmployeePosition.ASSISTANT, 'THỢ PHỤ', byCat('GỘI SẤY')),
    emp('TP-002', 'Tuấn Kiệt', EmployeePosition.ASSISTANT, 'THỢ PHỤ', byCat('GỘI SẤY')),
  ];
  const all = await m.save([owner, reception, ...stylists, ...assistants]);
  await m.save(all.map((e) =>
    m.create(UserAccount, {
      username: e === owner ? 'owner' : e === reception ? 'letan' : e.code,
      passwordHash: hash,
      role: { OWNER: Role.OWNER, RECEPTIONIST: Role.RECEPTIONIST, STYLIST: Role.STYLIST, ASSISTANT: Role.ASSISTANT }[e.position],
      employee: e,
    }),
  ));
  await m.save(m.create(CodeSequence, { prefix: 'ST', value: 4 }));
  await m.save(m.create(CodeSequence, { prefix: 'TP', value: 2 }));
  await m.save(m.create(CodeSequence, { prefix: 'NV', value: 2 }));

  // --- Ca làm việc 14 ngày tới: ca sáng 08–17, ca chiều 11–20
  const shifts: WorkShift[] = [];
  const morning = [stylists[0], stylists[2], assistants[0]];
  const evening = [stylists[1], stylists[3], assistants[1]];
  for (let i = 0; i < 14; i++) {
    const date = vnDateString(new Date(Date.now() + i * 86400000));
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    for (const e of morning) if (dow !== 0) shifts.push(m.create(WorkShift, { employee: e, date, startTime: '08:00', endTime: '17:00' }));
    for (const e of evening) if (dow !== 1) shifts.push(m.create(WorkShift, { employee: e, date, startTime: '11:00', endTime: '20:00' }));
  }
  await m.save(shifts);

  // --- Khách hàng thành viên mẫu
  const c = await m.save(m.create(Customer, { code: 'KH-00001', fullName: 'Lan Phương', phone: '0901234567', isMember: true, memberSince: new Date(), hairNotes: 'Lần trước: chân 6.1 + 7.0 (1:1), oxy 6%, 35 phút.' }));
  await m.save(m.create(UserAccount, { username: '0901234567', passwordHash: hash, role: Role.CUSTOMER, customer: c }));
  await m.save(m.create(CodeSequence, { prefix: 'KH', value: 1 }));

  // --- Kho
  const p = (sku: string, name: string, kind: ProductKind, unit: string, price: number, stock: number, minStock: number) => m.create(Product, { sku, name, kind, unit, price, stock, minStock });
  await m.save([
    p('SP-001', 'Dầu gội phục hồi 500ml', ProductKind.RETAIL, 'chai', 320000, 12, 5),
    p('SP-002', 'Dầu xả dưỡng ẩm 500ml', ProductKind.RETAIL, 'chai', 300000, 9, 5),
    p('SP-003', 'Serum phục hồi 100ml', ProductKind.RETAIL, 'chai', 280000, 4, 6),
    p('SP-004', 'Sáp tóc matte', ProductKind.RETAIL, 'hộp', 220000, 5, 8),
    p('VT-001', 'Thuốc nhuộm nâu lạnh 6.1', ProductKind.MATERIAL, 'tuýp', 0, 3, 5),
    p('VT-002', 'Oxy 6% (1L)', ProductKind.MATERIAL, 'chai', 0, 2, 4),
    p('VT-003', 'Thuốc uốn lạnh', ProductKind.MATERIAL, 'bộ', 0, 10, 4),
    p('VT-004', 'Dầu gội salon 5L', ProductKind.MATERIAL, 'can', 0, 3, 1),
  ]);

  // --- Khuyến mãi
  await m.save([
    m.create(Promotion, { name: 'Thành viên mới: giảm 10% lần đầu', type: PromotionType.PERCENT, value: 10, memberOnly: true, firstVisitOnly: true }),
    m.create(Promotion, { name: 'Thành viên: giảm 5% Hair Spa', type: PromotionType.PERCENT, value: 5, memberOnly: true, serviceCategory: 'HAIR SPA' }),
  ]);

  // --- Thiết bị (Bảng 2)
  const eq: Equipment[] = [];
  const add = (prefix: string, name: string, count: number, location: string) => {
    for (let i = 1; i <= count; i++) eq.push(m.create(Equipment, { code: `${prefix}-${String(i).padStart(2, '0')}`, name: `${name} ${i}`, kind: prefix, location, cost: 0 }));
  };
  add('GHE', 'Ghế cắt tóc', 6, 'Khu cắt');
  add('GUONG', 'Gương / bàn làm tóc', 6, 'Khu cắt');
  add('GIUONG', 'Giường gội đầu', 3, 'Khu gội');
  add('SAY', 'Máy sấy tóc', 6, 'Khu cắt');
  add('HAP', 'Máy hấp tóc', 2, 'Khu hóa chất');
  add('UON', 'Máy uốn/duỗi chuyên dụng', 3, 'Khu hóa chất');
  add('XE', 'Xe đẩy dụng cụ', 4, 'Khu cắt');
  eq.find((e) => e.code === 'HAP-02')!.status = EquipmentStatus.MAINTENANCE;
  await m.save(eq);

  console.log('Đã tạo dữ liệu mẫu. Tài khoản (mật khẩu 123456): owner, letan, ST-001..ST-004, TP-001, TP-002, khách 0901234567');
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
