import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { addMinutes, vnDateString, vnDayRange } from '../common/time';

const n = (v: unknown) => Number(v ?? 0);

/**
 * Báo cáo & thống kê (mục 3.9, FR-20..22). Truy vấn SQL tổng hợp trực tiếp
 * vì dữ liệu chỉ vài chục nghìn bản ghi/năm (NFR-03).
 */
@Injectable()
export class ReportsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private range(from?: string, to?: string) {
    const today = vnDateString(new Date());
    const f = from ?? today.slice(0, 8) + '01';
    const t = to ?? today;
    return { from: f, to: t, start: vnDayRange(f).from, end: vnDayRange(t).to };
  }

  async summary(fromQ?: string, toQ?: string) {
    const { from, to, start, end } = this.range(fromQ, toQ);
    const q = (sql: string, params: unknown[] = [start, end]) => this.ds.query(sql, params);

    const [rev] = await q(`SELECT COALESCE(SUM(total),0) revenue, COUNT(*) invoices, COALESCE(SUM("discountTotal"),0) discounts
                           FROM invoices WHERE status='PAID' AND "paidAt" >= $1 AND "paidAt" < $2`);
    const byDay = await q(`SELECT to_char("paidAt" AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD') d, SUM(total) revenue, COUNT(*) invoices
                           FROM invoices WHERE status='PAID' AND "paidAt" >= $1 AND "paidAt" < $2 GROUP BY 1 ORDER BY 1`);
    const byService = await q(`SELECT ii.description name, COUNT(*) count, SUM(ii."unitPrice"*ii.quantity - ii.discount) revenue
                               FROM invoice_items ii JOIN invoices i ON i.id = ii."invoiceId"
                               WHERE i.status='PAID' AND ii.type='SERVICE' AND i."paidAt" >= $1 AND i."paidAt" < $2
                               GROUP BY 1 ORDER BY revenue DESC`);
    const byProduct = await q(`SELECT ii.description name, SUM(ii.quantity) count, SUM(ii."unitPrice"*ii.quantity - ii.discount) revenue
                               FROM invoice_items ii JOIN invoices i ON i.id = ii."invoiceId"
                               WHERE i.status='PAID' AND ii.type='PRODUCT' AND i."paidAt" >= $1 AND i."paidAt" < $2
                               GROUP BY 1 ORDER BY revenue DESC`);
    const byEmployee = await q(`SELECT e.id, e.code, e."fullName", e.position,
                                  COUNT(*) FILTER (WHERE c.role='LEAD_STYLIST') "leadCount",
                                  COUNT(*) FILTER (WHERE c.role='ASSISTANT') "assistCount",
                                  COALESCE(SUM(c."baseAmount") FILTER (WHERE c.role='LEAD_STYLIST'),0) revenue,
                                  COALESCE(SUM(c.amount),0) commission
                                FROM commission_lines c JOIN employees e ON e.id = c."employeeId"
                                WHERE c."earnedAt" >= $1 AND c."earnedAt" < $2
                                GROUP BY e.id ORDER BY revenue DESC`);
    const appts = await q(`SELECT status, source, COUNT(*) c FROM appointments WHERE "startAt" >= $1 AND "startAt" < $2 GROUP BY status, source`);
    const busyHours = await q(`SELECT EXTRACT(HOUR FROM "startAt" AT TIME ZONE 'Asia/Ho_Chi_Minh')::int h, COUNT(*) c
                               FROM appointments WHERE status NOT IN ('CANCELLED','NO_SHOW') AND "startAt" >= $1 AND "startAt" < $2
                               GROUP BY 1 ORDER BY 1`);
    const [exp] = await q(`SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE date >= $1 AND date <= $2`, [from, to]);
    // Tiền cọc bị giữ lại (khách bùng/hủy muộn) là thu nhập; hoa hồng và tiền nhập hàng là chi phí chưa nằm trong `expenses`.
    const [forfeit] = await q(`SELECT COALESCE(SUM("depositAmount"),0) total FROM appointments WHERE "depositStatus" = 'FORFEITED' AND "updatedAt" >= $1 AND "updatedAt" < $2`);
    const [comm] = await q(`SELECT COALESCE(SUM(amount),0) total FROM commission_lines WHERE "earnedAt" >= $1 AND "earnedAt" < $2`);
    const [purchase] = await q(`SELECT COALESCE(SUM(quantity * "unitCost"),0) total FROM inventory_transactions WHERE type = 'RECEIPT' AND "createdAt" >= $1 AND "createdAt" < $2`);
    const lowStock = await this.ds.query(`SELECT id, sku, name, stock, "minStock", unit FROM products WHERE active AND stock <= "minStock" ORDER BY stock`);
    const complaints = await this.ds.query(`SELECT status, COUNT(*) c FROM complaints GROUP BY status`);
    const equipment = await this.ds.query(`SELECT id, code, name, status FROM equipment WHERE status IN ('MAINTENANCE','BROKEN')`);

    const count = (pred: (r: any) => boolean) => appts.filter(pred).reduce((s: number, r: any) => s + n(r.c), 0);
    return {
      from, to,
      revenue: n(rev.revenue),
      invoices: n(rev.invoices),
      discounts: n(rev.discounts),
      expenses: n(exp.total),
      forfeitedDeposits: n(forfeit.total),
      commissions: n(comm.total),
      purchases: n(purchase.total),
      /** Doanh thu hóa đơn + cọc bị giữ − chi phí − hoa hồng − tiền nhập hàng. */
      profitEstimate: n(rev.revenue) + n(forfeit.total) - n(exp.total) - n(comm.total) - n(purchase.total),
      appointments: {
        total: count(() => true),
        walkIn: count((r) => r.source === 'WALK_IN'),
        booked: count((r) => r.source !== 'WALK_IN'),
        completed: count((r) => r.status === 'COMPLETED'),
        cancelled: count((r) => r.status === 'CANCELLED'),
        noShow: count((r) => r.status === 'NO_SHOW'),
        pending: count((r) => r.status === 'BOOKED'),
      },
      byDay: byDay.map((r: any) => ({ date: r.d, revenue: n(r.revenue), invoices: n(r.invoices) })),
      byService: byService.map((r: any) => ({ name: r.name, count: n(r.count), revenue: n(r.revenue) })),
      byProduct: byProduct.map((r: any) => ({ name: r.name, count: n(r.count), revenue: n(r.revenue) })),
      byEmployee: byEmployee.map((r: any) => ({ id: r.id, code: r.code, fullName: r.fullName, position: r.position, leadCount: n(r.leadCount), assistCount: n(r.assistCount), revenue: n(r.revenue), commission: n(r.commission) })),
      /** Số lịch (trừ hủy và vắng mặt) theo giờ hẹn. */
      busyHours: busyHours.map((r: any) => ({ hour: n(r.h), count: n(r.c) })),
      lowStock,
      complaints: complaints.map((r: any) => ({ status: r.status, count: n(r.c) })),
      equipmentIssues: equipment,
    };
  }

  /** Danh sách lịch bị hủy / no-show trong khoảng (FR-22). */
  async cancellations(fromQ?: string, toQ?: string) {
    const { start, end } = this.range(fromQ, toQ);
    return this.ds.query(
      `SELECT a.id, a.code, a."startAt", a.status, a."statusReason", c."fullName", c.phone, c."noShowCount"
       FROM appointments a JOIN customers c ON c.id = a."customerId"
       WHERE a.status IN ('CANCELLED','NO_SHOW') AND a."startAt" >= $1 AND a."startAt" < $2 ORDER BY a."startAt" DESC`,
      [start, end],
    );
  }

  /** Doanh thu hôm nay — dùng cho lễ tân đối soát cuối ngày. */
  async today() {
    const d = vnDateString(new Date());
    const s = await this.summary(d, d);
    return { date: d, revenue: s.revenue, invoices: s.invoices, appointments: s.appointments, nextHour: addMinutes(new Date(), 60) };
  }
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Roles(Role.OWNER) @Get('summary')
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.summary(from, to);
  }

  @Roles(Role.OWNER) @Get('cancellations')
  cancellations(@Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.cancellations(from, to);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Get('today')
  today() {
    return this.svc.today();
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
