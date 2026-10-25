import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, In, Not } from 'typeorm';
import { CommissionLine, Invoice, InvoiceItem, Payment, Promotion } from './billing.entities';
import { CommissionCalculator } from './commission.calculator';
import { PromotionEngine } from './promotion.engine';
import { ServiceSession, ServiceSessionItem } from '../sessions/session.entities';
import { Appointment } from '../appointments/appointment.entities';
import { Customer } from '../customers/customer.entity';
import { InventoryTransaction, Product } from '../inventory/inventory.entities';
import {
  AppointmentStatus, InventoryTxType, InvoiceItemType, InvoiceStatus, PaymentMethod, PaymentStatus,
  ProductKind, SessionItemStatus, SessionStatus,
} from '../common/enums';
import { AuthUser } from '../common/auth.decorators';
import { BusinessRuleError } from '../common/business.error';
import { BusinessRulesConfig } from '../common/business-rules.config';
import { AuditService, CodeService } from '../common/shared.services';
import { vnDateString, vnDayRange } from '../common/time';

export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  /** Mã giao dịch chuyển khoản / mã biên nhận. Trùng mã sẽ không ghi nhận lần 2 (BR-15). */
  reference?: string;
  /** Lễ tân đã xác nhận tiền về (với chuyển khoản). Tiền mặt luôn xác nhận ngay. */
  confirmed?: boolean;
}

@Injectable()
export class BillingService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly codes: CodeService,
    private readonly audit: AuditService,
    private readonly rules: BusinessRulesConfig,
  ) {}

  async get(id: number, m: EntityManager = this.ds.manager) {
    const inv = await m.findOne(Invoice, { where: { id } });
    if (!inv) throw new NotFoundException('Không tìm thấy hóa đơn');
    return inv;
  }

  list(date?: string, status?: InvoiceStatus) {
    const where: any = {};
    if (date) {
      const { from, to } = vnDayRange(date);
      where.createdAt = Between(from, to);
    }
    if (status) where.status = status;
    return this.ds.manager.find(Invoice, { where, order: { createdAt: 'DESC' }, take: 200 });
  }

  /**
   * Lập hóa đơn từ phiên phục vụ (FR-13): chỉ lấy dịch vụ đã thực hiện (BR-11),
   * chốt đơn giá thực tế (BR-07, FR-14) và áp dụng khuyến mãi tốt nhất (mục 3.5).
   */
  async createFromSession(sessionId: number, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const session = await m.findOne(ServiceSession, { where: { id: sessionId } });
      if (!session) throw new NotFoundException('Không tìm thấy phiên phục vụ');
      const existing = await m.findOne(Invoice, { where: { session: { id: sessionId }, status: Not(InvoiceStatus.CANCELLED) } });
      if (existing) return existing;
      if (session.status !== SessionStatus.AWAITING_PAYMENT) {
        throw new BusinessRuleError('BR-11', 'Cần hoàn tất phục vụ trước khi lập hóa đơn');
      }
      const done = session.items.filter((i) => i.status === SessionItemStatus.DONE);
      const inv = m.create(Invoice, {
        code: await this.codes.next('HD', m),
        session,
        customer: session.customer,
        status: InvoiceStatus.DRAFT,
        createdBy: user.employeeId ? ({ id: user.employeeId } as any) : null,
        items: done.map((i) =>
          m.create(InvoiceItem, { type: InvoiceItemType.SERVICE, refId: i.id, description: i.service.name, unitPrice: i.agreedPrice, quantity: 1, discount: 0 }),
        ),
      });
      await this.applyPromotion(inv, m);
      const saved = await m.save(inv);
      return this.get(saved.id, m);
    });
  }

  private async applyPromotion(inv: Invoice, m: EntityManager) {
    const promos = await m.find(Promotion, { where: { active: true } });
    const serviceLines = inv.items.filter((i) => i.type === InvoiceItemType.SERVICE);
    const sessionItems = inv.session ? await m.findBy(ServiceSessionItem, { id: In(serviceLines.map((l) => l.refId)) }) : [];
    const result = PromotionEngine.best(
      inv.customer,
      promos,
      serviceLines.map((l, idx) => ({ key: idx, category: sessionItems.find((s) => s.id === l.refId)?.service.category ?? '', amount: l.unitPrice * l.quantity })),
      vnDateString(new Date()),
    );
    inv.items.forEach((i) => (i.discount = 0));
    serviceLines.forEach((l, idx) => (l.discount = result.discounts.get(idx) ?? 0));
    inv.promotionName = result.promotion?.name ?? null;
    inv.recalculate();
  }

  async addProduct(invoiceId: number, productId: number, quantity: number) {
    return this.ds.transaction(async (m) => {
      const inv = await this.get(invoiceId, m);
      if (!inv.isEditable()) throw new BusinessRuleError('BR-10', 'Hóa đơn đã chốt hoặc đã hủy');
      const p = await m.findOneBy(Product, { id: productId });
      if (!p || p.kind !== ProductKind.RETAIL || !p.active) throw new BusinessRuleError('INVENTORY', 'Sản phẩm không bán lẻ');
      if (!this.rules.allowNegativeStock && p.stock < quantity) throw new BusinessRuleError('BR-09', `Không đủ tồn kho "${p.name}" (còn ${p.stock})`);
      inv.items.push(m.create(InvoiceItem, { type: InvoiceItemType.PRODUCT, refId: p.id, description: p.name, unitPrice: p.price, quantity, discount: 0 }));
      inv.recalculate();
      await m.save(inv);
      return this.get(invoiceId, m);
    });
  }

  async removeItem(invoiceId: number, itemId: number, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const inv = await this.get(invoiceId, m);
      if (!inv.isEditable()) throw new BusinessRuleError('BR-10', 'Hóa đơn đã chốt hoặc đã hủy');
      const item = inv.items.find((i) => i.id === itemId);
      if (!item) throw new NotFoundException('Không có dòng này');
      if (item.type === InvoiceItemType.SERVICE) throw new BusinessRuleError('FR-09', 'Bỏ dịch vụ ở phiên phục vụ, không xóa trực tiếp trên hóa đơn');
      await m.delete(InvoiceItem, { id: itemId });
      inv.items = inv.items.filter((i) => i.id !== itemId);
      inv.recalculate();
      await m.save(inv);
      await this.audit.log(user, 'INVOICE_ITEM_REMOVE', 'Invoice', invoiceId, `Bỏ "${item.description}" khỏi ${inv.code}`, null, null, m);
      return this.get(invoiceId, m);
    });
  }

  async submit(invoiceId: number) {
    const inv = await this.get(invoiceId);
    if (inv.status !== InvoiceStatus.DRAFT) throw new BusinessRuleError('LIFECYCLE', 'Chỉ chốt được hóa đơn nháp');
    inv.status = InvoiceStatus.PENDING;
    return this.ds.manager.save(inv);
  }

  async cancel(invoiceId: number, reason: string, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const inv = await this.get(invoiceId, m);
      if (inv.status === InvoiceStatus.PAID) throw new BusinessRuleError('BR-10', 'Hóa đơn đã thanh toán không thể hủy (cần nghiệp vụ hoàn tiền)');
      if (inv.status === InvoiceStatus.CANCELLED) return inv;
      inv.status = InvoiceStatus.CANCELLED;
      inv.cancelReason = reason;
      await m.save(inv);
      await this.audit.log(user, 'INVOICE_CANCEL', 'Invoice', invoiceId, `Hủy hóa đơn ${inv.code}: ${reason}`, { total: inv.total }, null, m);
      return inv;
    });
  }

  /** Ghi nhận thanh toán (FR-15). Idempotent theo `reference` (BR-15). */
  async pay(invoiceId: number, input: PaymentInput, user: AuthUser) {
    if (input.amount <= 0) throw new BusinessRuleError('BR-06', 'Số tiền phải lớn hơn 0');
    return this.ds.transaction(async (m) => {
      await m.query('SELECT id FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
      const inv = await this.get(invoiceId, m);
      if (inv.status === InvoiceStatus.CANCELLED) throw new BusinessRuleError('BR-10', 'Không thể thanh toán hóa đơn đã hủy');
      const reference = input.reference?.trim() || `${input.method}-${inv.code}-${Date.now()}`;
      const dup = await m.findOne(Payment, { where: { reference } });
      if (dup) return { invoice: inv, payment: dup, duplicate: true };
      if (inv.status === InvoiceStatus.PAID) throw new BusinessRuleError('BR-15', 'Hóa đơn đã thanh toán đủ');
      const confirmed = input.method === PaymentMethod.CASH || input.confirmed === true;
      const payment = await m.save(
        m.create(Payment, {
          invoice: inv,
          method: input.method,
          amount: input.amount,
          reference,
          status: confirmed ? PaymentStatus.SUCCEEDED : PaymentStatus.PROCESSING,
          confirmedAt: confirmed ? new Date() : null,
          recordedBy: user.employeeId ? ({ id: user.employeeId } as any) : null,
        }),
      );
      // Không save(inv): quan hệ payments không cascade, save sẽ gỡ khóa ngoại của giao dịch mới
      if (inv.status === InvoiceStatus.DRAFT) await m.update(Invoice, inv.id, { status: InvoiceStatus.PENDING });
      const fresh = await this.finalizeIfPaid(inv.id, m);
      return { invoice: fresh, payment, duplicate: false };
    });
  }

  /** Lễ tân xác nhận đã thấy tiền chuyển khoản về / hoặc báo giao dịch thất bại. */
  async resolvePayment(paymentId: number, success: boolean, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const p = await m.findOne(Payment, { where: { id: paymentId } });
      if (!p) throw new NotFoundException('Không tìm thấy giao dịch');
      const [{ invoiceId }] = await m.query('SELECT "invoiceId" FROM payments WHERE id = $1', [paymentId]);
      if (p.status !== PaymentStatus.PROCESSING && p.status !== PaymentStatus.INITIATED) return { payment: p, invoice: await this.get(invoiceId, m) };
      p.status = success ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED;
      p.confirmedAt = success ? new Date() : null;
      await m.save(p);
      await this.audit.log(user, success ? 'PAYMENT_CONFIRM' : 'PAYMENT_FAIL', 'Payment', p.id, `${success ? 'Xác nhận' : 'Thất bại'} giao dịch ${p.reference}`, null, null, m);
      return { payment: p, invoice: await this.finalizeIfPaid(invoiceId, m) };
    });
  }

  /**
   * Khi đã nhận đủ tiền: hóa đơn PAID, phiên & lịch hoàn thành, cập nhật lịch sử khách,
   * trừ kho sản phẩm bán, chốt dòng hoa hồng bất biến — tất cả trong một giao dịch (NFR-12).
   */
  private async finalizeIfPaid(invoiceId: number, m: EntityManager) {
    const inv = await this.get(invoiceId, m);
    if (inv.status === InvoiceStatus.PAID || inv.paidAmount() < inv.total) return inv;
    const now = new Date();
    inv.status = InvoiceStatus.PAID;
    inv.paidAt = now;
    await m.update(Invoice, inv.id, { status: InvoiceStatus.PAID, paidAt: now });

    if (inv.session) {
      const s = await m.findOneByOrFail(ServiceSession, { id: inv.session.id });
      s.status = SessionStatus.COMPLETED;
      await m.save(s);
      if (s.appointment) {
        const a = await m.findOneByOrFail(Appointment, { id: s.appointment.id });
        if (a.canTransitionTo(AppointmentStatus.COMPLETED)) {
          a.transitionTo(AppointmentStatus.COMPLETED);
          await m.save(a);
        }
      }
      // Hoa hồng
      for (const line of inv.items.filter((i) => i.type === InvoiceItemType.SERVICE)) {
        const item = s.items.find((x) => x.id === line.refId);
        if (!item) continue;
        const results = CommissionCalculator.compute(
          { serviceName: item.service.name, price: line.lineTotal(), rate: item.service.commissionRate, mode: item.service.commissionMode, leadShare: item.service.leadShare, assistantFixedFee: item.service.assistantFixedFee },
          item.assignments.map((a) => ({ employeeId: a.employee.id, role: a.role, shareOverride: a.shareOverride, fixedFeeOverride: a.fixedFeeOverride })),
        );
        for (const r of results) {
          await m.save(m.create(CommissionLine, {
            employee: { id: r.employeeId } as any, invoice: inv, invoiceItemId: line.id, serviceName: line.description,
            role: r.role, baseAmount: line.lineTotal(), formula: r.formula, amount: r.amount, earnedAt: now,
          }));
        }
      }
    }
    // Kho: trừ sản phẩm bán lẻ (BR-09)
    for (const line of inv.items.filter((i) => i.type === InvoiceItemType.PRODUCT)) {
      await m.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [line.refId]);
      const p = await m.findOneByOrFail(Product, { id: line.refId });
      if (!this.rules.allowNegativeStock && p.stock < line.quantity) throw new BusinessRuleError('BR-09', `Không đủ tồn kho "${p.name}"`);
      p.stock -= line.quantity;
      await m.save(p);
      await m.save(m.create(InventoryTransaction, { product: p, type: InventoryTxType.SALE, quantity: -line.quantity, stockAfter: p.stock, unitCost: 0, reference: inv.code }));
    }
    // Khách hàng
    if (inv.customer) {
      const c = await m.findOneByOrFail(Customer, { id: inv.customer.id });
      c.recordVisit(now);
      if (inv.promotionName) {
        const promo = await m.findOne(Promotion, { where: { name: inv.promotionName } });
        if (promo?.firstVisitOnly) c.firstVisitPromoUsed = true;
      }
      await m.save(c);
    }
    return this.get(invoiceId, m);
  }

  // ---------------------------------------------------------------- Hoa hồng

  async commissionsOf(employeeId: number, from: string, to: string) {
    const lines = await this.ds.manager.find(CommissionLine, {
      where: { employee: { id: employeeId }, earnedAt: Between(vnDayRange(from).from, vnDayRange(to).to) },
      relations: { invoice: true },
      order: { earnedAt: 'DESC' },
    });
    return {
      total: lines.reduce((s, l) => s + l.amount, 0),
      lines: lines.map((l) => ({ id: l.id, earnedAt: l.earnedAt, invoiceCode: l.invoice.code, serviceName: l.serviceName, role: l.role, baseAmount: l.baseAmount, formula: l.formula, amount: l.amount })),
    };
  }

  // ---------------------------------------------------------------- Khuyến mãi

  listPromotions() {
    return this.ds.manager.find(Promotion, { order: { id: 'DESC' } });
  }

  async savePromotion(data: Partial<Promotion>, user: AuthUser, id?: number) {
    const repo = this.ds.getRepository(Promotion);
    const p = id ? await repo.findOneByOrFail({ id }) : repo.create();
    Object.assign(p, data);
    const saved = await repo.save(p);
    await this.audit.log(user, id ? 'PROMOTION_UPDATE' : 'PROMOTION_CREATE', 'Promotion', saved.id, `${id ? 'Sửa' : 'Tạo'} khuyến mãi "${saved.name}"`);
    return saved;
  }
}
