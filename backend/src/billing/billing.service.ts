import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, In, Not } from 'typeorm';
import { ServiceMaterial } from '../inventory/inventory.entities';
import { CommissionLine, Invoice, InvoiceItem, Payment, Promotion } from './billing.entities';
import { CommissionCalculator } from './commission.calculator';
import { PromotionEngine } from './promotion.engine';
import { ServiceSession, ServiceSessionItem } from '../sessions/session.entities';
import { Appointment } from '../appointments/appointment.entities';
import { Customer } from '../customers/customer.entity';
import { InventoryTransaction, Product } from '../inventory/inventory.entities';
import {
  AppointmentStatus, DepositStatus, InventoryTxType, InvoiceItemType, InvoiceStatus, PaymentMethod, PaymentStatus,
  ProductKind, PromotionType, Role, SessionItemStatus, SessionStatus,
} from '../common/enums';
import { SalonService } from '../catalog/service.entity';
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
      await this.creditDeposit(saved, session, m);
      return this.get(saved.id, m);
    });
  }

  /**
   * Tiền cọc đã thu trừ vào hóa đơn bằng một Payment DEPOSIT (nếu không khách trả hai lần).
   * Cọc lớn hơn hóa đơn thì chỉ trừ đến hết hóa đơn; phần dư ghi vào nhật ký để hoàn cho khách.
   */
  private async creditDeposit(inv: Invoice, session: ServiceSession, m: EntityManager) {
    const a = session.appointment;
    if (!a || a.depositStatus !== DepositStatus.PAID || a.depositAmount <= 0) return;
    const credit = Math.min(a.depositAmount, inv.total);
    if (credit > 0) {
      await m.save(m.create(Payment, {
        invoice: inv, method: PaymentMethod.DEPOSIT, amount: credit, reference: `DEP-${a.code}`,
        status: PaymentStatus.SUCCEEDED, confirmedAt: new Date(), recordedBy: null,
      }));
    }
    if (credit < a.depositAmount) {
      await this.audit.log(null, 'DEPOSIT_EXCESS', 'Invoice', inv.id, `Cọc ${a.depositAmount} của ${a.code} lớn hơn hóa đơn ${inv.code} (${inv.total}) — cần hoàn ${a.depositAmount - credit} cho khách`, null, null, m);
    }
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
    inv.promotionId = result.promotion?.id ?? null;
    inv.recalculate();
  }

  async addProduct(invoiceId: number, productId: number, quantity: number, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const inv = await this.get(invoiceId, m);
      if (!inv.isEditable()) throw new BusinessRuleError('BR-10', 'Hóa đơn đã chốt hoặc đã hủy');
      const p = await m.findOneBy(Product, { id: productId });
      if (!p || p.kind !== ProductKind.RETAIL || !p.active) throw new BusinessRuleError('INVENTORY', 'Sản phẩm không bán lẻ');
      const line = inv.items.find((i) => i.type === InvoiceItemType.PRODUCT && i.refId === p.id);
      const wanted = quantity + (line?.quantity ?? 0);
      if (!this.rules.allowNegativeStock && p.stock < wanted) throw new BusinessRuleError('BR-09', `Không đủ tồn kho "${p.name}" (còn ${p.stock})`);
      if (line) line.quantity = wanted;
      else inv.items.push(m.create(InvoiceItem, { type: InvoiceItemType.PRODUCT, refId: p.id, description: p.name, unitPrice: p.price, quantity, discount: 0 }));
      inv.recalculate();
      await m.save(inv);
      await this.audit.log(user, 'INVOICE_ITEM_ADD', 'Invoice', invoiceId, `Thêm ${quantity} "${p.name}" vào ${inv.code}`, null, null, m);
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

  /** Chốt hóa đơn nháp. Hóa đơn không còn gì phải thu (khuyến mãi 100%, giá 0đ, đã trừ cọc đủ) hoàn tất ngay. */
  async submit(invoiceId: number) {
    return this.ds.transaction(async (m) => {
      await m.query('SELECT id FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
      const inv = await this.get(invoiceId, m);
      if (inv.status !== InvoiceStatus.DRAFT) throw new BusinessRuleError('LIFECYCLE', 'Chỉ chốt được hóa đơn nháp');
      await m.update(Invoice, inv.id, { status: InvoiceStatus.PENDING });
      return this.finalizeIfPaid(inv.id, m);
    });
  }

  /** Số tiền khách đã thanh toán và chưa được hoàn (không tính khoản cọc giữ cho lịch). */
  private cashPaid(inv: Invoice): number {
    return inv.payments.filter((p) => p.status === PaymentStatus.SUCCEEDED && p.method !== PaymentMethod.DEPOSIT).reduce((s, p) => s + p.amount, 0);
  }

  /**
   * Hủy hóa đơn. Hóa đơn đã thu tiền chỉ hủy được kèm hoàn tiền (`refund`): ghi một giao dịch REFUND âm,
   * còn tiền cọc quay về lịch hẹn để hóa đơn mới trừ lại. Hóa đơn đã PAID (đã chốt hoa hồng, trừ kho) chỉ chủ
   * salon hủy được và hệ thống đảo toàn bộ ghi nhận, phiên quay về chờ thanh toán để lập hóa đơn mới.
   */
  async cancel(invoiceId: number, reason: string, user: AuthUser, refund = false) {
    return this.ds.transaction(async (m) => {
      await m.query('SELECT id FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
      const inv = await this.get(invoiceId, m);
      if (inv.status === InvoiceStatus.CANCELLED) return inv;
      const wasPaid = inv.status === InvoiceStatus.PAID;
      if (wasPaid && user.role !== Role.OWNER) throw new BusinessRuleError('BR-10', 'Chỉ chủ salon được hủy hóa đơn đã thanh toán');
      const money = this.cashPaid(inv);
      if (money > 0 && !refund) {
        throw new BusinessRuleError('BR-10', `Hóa đơn đã thu ${money.toLocaleString('vi-VN')} ₫ — chỉ hủy được kèm hoàn tiền cho khách`);
      }
      const now = new Date();
      if (money > 0) {
        await m.save(m.create(Payment, {
          invoice: inv, method: PaymentMethod.REFUND, amount: -money, reference: `REFUND-${inv.code}-${now.getTime()}`,
          status: PaymentStatus.SUCCEEDED, confirmedAt: now, recordedBy: user.employeeId ? ({ id: user.employeeId } as any) : null,
        }));
      }
      // Giao dịch còn treo và khoản cọc đã trừ đều mất hiệu lực cùng hóa đơn.
      await m.query(`UPDATE payments SET status = 'CANCELLED' WHERE "invoiceId" = $1 AND (status IN ('PROCESSING', 'INITIATED') OR (method = 'DEPOSIT' AND status = 'SUCCEEDED'))`, [inv.id]);
      if (wasPaid) await this.reversePaid(inv, user, m);
      await m.update(Invoice, inv.id, { status: InvoiceStatus.CANCELLED, cancelReason: reason });
      await this.audit.log(user, 'INVOICE_CANCEL', 'Invoice', invoiceId, `Hủy hóa đơn ${inv.code}${money > 0 ? `, hoàn ${money}` : ''}${wasPaid ? ' (đã thanh toán, đảo hoa hồng/kho)' : ''}: ${reason}`, { total: inv.total, status: inv.status }, null, m);
      return this.get(invoiceId, m);
    });
  }

  /** Đảo ghi nhận của hóa đơn đã PAID: hoa hồng, kho, lượt ghé, trạng thái phiên. */
  private async reversePaid(inv: Invoice, user: AuthUser, m: EntityManager) {
    const now = new Date();
    const lines = await m.find(CommissionLine, { where: { invoice: { id: inv.id } } });
    for (const l of lines.filter((x) => x.amount > 0)) {
      await m.save(m.create(CommissionLine, {
        employee: { id: l.employee.id } as any, invoice: inv, invoiceItemId: l.invoiceItemId, serviceName: l.serviceName,
        role: l.role, baseAmount: -l.baseAmount, formula: `Đảo do hủy hóa đơn ${inv.code}`, amount: -l.amount, earnedAt: now,
      }));
    }
    const moves = await m.find(InventoryTransaction, { where: { reference: inv.code, type: In([InventoryTxType.SALE, InventoryTxType.USAGE]) } });
    for (const t of moves) {
      await m.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [t.product.id]);
      const p = await m.findOneByOrFail(Product, { id: t.product.id });
      p.stock -= t.quantity;
      await m.save(p);
      await m.save(m.create(InventoryTransaction, { product: p, type: InventoryTxType.ADJUSTMENT, quantity: -t.quantity, stockAfter: p.stock, unitCost: 0, reference: inv.code, note: `Hoàn kho do hủy hóa đơn ${inv.code}`, recordedBy: user.employeeId ? ({ id: user.employeeId } as any) : null }));
    }
    if (inv.customer) {
      const c = await m.findOneByOrFail(Customer, { id: inv.customer.id });
      c.visitCount = Math.max(0, c.visitCount - 1);
      if (inv.promotionId && (await m.findOneBy(Promotion, { id: inv.promotionId }))?.firstVisitOnly) c.firstVisitPromoUsed = false;
      await m.save(c);
    }
    if (inv.session) await m.update(ServiceSession, inv.session.id, { status: SessionStatus.AWAITING_PAYMENT });
  }

  /** Dòng điều chỉnh thủ công (giảm giá > 0 không áp dụng khuyến mãi, hoặc phụ thu), bắt buộc có lý do và ghi audit (FR-13). */
  async addAdjustment(invoiceId: number, dto: { description: string; amount: number }, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      await m.query('SELECT id FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
      const inv = await this.get(invoiceId, m);
      if (!inv.isEditable()) throw new BusinessRuleError('BR-10', 'Hóa đơn đã chốt hoặc đã hủy');
      if (!Number.isInteger(dto.amount) || dto.amount === 0) throw new BusinessRuleError('BR-06', 'Số tiền điều chỉnh phải khác 0');
      if (inv.subtotal - inv.discountTotal + dto.amount < 0) throw new BusinessRuleError('BR-06', 'Giảm giá vượt quá tổng hóa đơn');
      inv.items.push(m.create(InvoiceItem, { type: InvoiceItemType.ADJUSTMENT, refId: 0, description: dto.description.trim(), unitPrice: dto.amount, quantity: 1, discount: 0 }));
      inv.recalculate();
      await m.save(inv);
      await this.audit.log(user, 'INVOICE_ADJUST', 'Invoice', invoiceId, `${dto.amount < 0 ? 'Giảm' : 'Phụ thu'} ${Math.abs(dto.amount)} trên ${inv.code}: ${dto.description}`, { total: inv.total - dto.amount }, { total: inv.total }, m);
      return this.get(invoiceId, m);
    });
  }

  /** Ghi nhận thanh toán (FR-15). Idempotent theo `reference` (BR-15). */
  async pay(invoiceId: number, input: PaymentInput, user: AuthUser) {
    if (input.amount <= 0) throw new BusinessRuleError('BR-06', 'Số tiền phải lớn hơn 0');
    if (input.method !== PaymentMethod.CASH && input.method !== PaymentMethod.TRANSFER) throw new BusinessRuleError('BR-06', 'Phương thức thanh toán không hợp lệ');
    return this.ds.transaction(async (m) => {
      await m.query('SELECT id FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
      const inv = await this.get(invoiceId, m);
      if (inv.status === InvoiceStatus.CANCELLED) throw new BusinessRuleError('BR-10', 'Không thể thanh toán hóa đơn đã hủy');
      const reference = input.reference?.trim() || `${input.method}-${inv.code}-${Date.now()}`;
      const dup = await m.findOne(Payment, { where: { reference } });
      if (dup) return { invoice: inv, payment: dup, duplicate: true };
      if (inv.status === InvoiceStatus.PAID) throw new BusinessRuleError('BR-15', 'Hóa đơn đã thanh toán đủ');
      const remaining = inv.total - inv.paidAmount();
      if (input.amount > remaining) throw new BusinessRuleError('BR-06', `Số tiền vượt phần còn phải thu (${remaining.toLocaleString('vi-VN')} ₫)`);
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
      const [row] = await m.query('SELECT "invoiceId" FROM payments WHERE id = $1', [paymentId]);
      if (!row) throw new NotFoundException('Không tìm thấy giao dịch');
      const invoiceId: number = row.invoiceId;
      await m.query('SELECT id FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
      const p = await m.findOneByOrFail(Payment, { id: paymentId });
      const inv = await this.get(invoiceId, m);
      if (p.status !== PaymentStatus.PROCESSING && p.status !== PaymentStatus.INITIATED) return { payment: p, invoice: inv };
      if (success && ![InvoiceStatus.DRAFT, InvoiceStatus.PENDING].includes(inv.status)) {
        throw new BusinessRuleError('BR-15', `Hóa đơn ${inv.code} đã ${inv.status === InvoiceStatus.PAID ? 'thanh toán đủ' : 'hủy'} — không ghi nhận thêm. Đánh dấu giao dịch thất bại và hoàn tiền cho khách nếu đã nhận.`);
      }
      if (success && p.amount > inv.total - inv.paidAmount()) {
        throw new BusinessRuleError('BR-15', 'Giao dịch vượt phần còn phải thu của hóa đơn — đánh dấu thất bại và hoàn tiền thừa cho khách');
      }
      p.status = success ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED;
      p.confirmedAt = success ? new Date() : null;
      await m.save(p);
      await this.audit.log(user, success ? 'PAYMENT_CONFIRM' : 'PAYMENT_FAIL', 'Payment', p.id, `${success ? 'Xác nhận' : 'Thất bại'} giao dịch ${p.reference}`, null, null, m);
      return { payment: p, invoice: await this.finalizeIfPaid(invoiceId, m) };
    });
  }

  /**
   * Khi đã nhận đủ tiền: hóa đơn PAID, phiên & lịch hoàn thành, cập nhật lịch sử khách,
   * trừ kho sản phẩm bán và vật tư theo định mức, chốt dòng hoa hồng bất biến — tất cả trong một giao dịch (NFR-12).
   */
  private async finalizeIfPaid(invoiceId: number, m: EntityManager) {
    const inv = await this.get(invoiceId, m);
    if (inv.status === InvoiceStatus.PAID || inv.status === InvoiceStatus.CANCELLED || inv.paidAmount() < inv.total) return inv;
    const now = new Date();
    inv.status = InvoiceStatus.PAID;
    inv.paidAt = now;
    await m.update(Invoice, inv.id, { status: InvoiceStatus.PAID, paidAt: now });
    // Chuyển khoản còn treo của hóa đơn đã thu đủ: hủy để lễ tân không xác nhận nhầm thành thu thừa.
    await m.query(`UPDATE payments SET status = 'CANCELLED' WHERE "invoiceId" = $1 AND status IN ('PROCESSING', 'INITIATED')`, [inv.id]);

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
      // Hoa hồng: dùng cấu hình đã chốt trên dòng phiên lúc thêm dịch vụ (BR-08)
      for (const line of inv.items.filter((i) => i.type === InvoiceItemType.SERVICE)) {
        const item = s.items.find((x) => x.id === line.refId);
        if (!item) continue;
        const results = CommissionCalculator.compute(
          { ...item.commissionConfig(), price: line.lineTotal() },
          item.assignments.map((a) => ({ employeeId: a.employee.id, role: a.role, shareOverride: a.shareOverride, fixedFeeOverride: a.fixedFeeOverride, personalRate: a.employee.commissionRate })),
        );
        for (const r of results) {
          await m.save(m.create(CommissionLine, {
            employee: { id: r.employeeId } as any, invoice: inv, invoiceItemId: line.id, serviceName: line.description,
            role: r.role, baseAmount: line.lineTotal(), formula: r.formula, amount: r.amount, earnedAt: now,
          }));
        }
        await this.consumeMaterials(m, item.service.id, item.service.name, inv.code);
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
      if (inv.promotionId && (await m.findOneBy(Promotion, { id: inv.promotionId }))?.firstVisitOnly) c.firstVisitPromoUsed = true;
      await m.save(c);
    }
    return this.get(invoiceId, m);
  }

  /**
   * Trừ vật tư theo định mức của dịch vụ đã làm (FR-18). Dịch vụ đã thực hiện nên không chặn thanh toán khi kho thiếu:
   * trừ đến hết tồn và ghi nhật ký phần thiếu để chủ salon kiểm kê.
   */
  private async consumeMaterials(m: EntityManager, serviceId: number, serviceName: string, reference: string) {
    const mats = await m.find(ServiceMaterial, { where: { service: { id: serviceId } } });
    for (const mat of mats) {
      await m.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [mat.product.id]);
      const p = await m.findOneByOrFail(Product, { id: mat.product.id });
      const use = this.rules.allowNegativeStock ? mat.quantity : Math.min(mat.quantity, Math.max(0, p.stock));
      if (use > 0) {
        p.stock -= use;
        await m.save(p);
        await m.save(m.create(InventoryTransaction, { product: p, type: InventoryTxType.USAGE, quantity: -use, stockAfter: p.stock, unitCost: 0, reference, note: `Định mức "${serviceName}"` }));
      }
      if (use < mat.quantity) await this.audit.log(null, 'MATERIAL_SHORT', 'Product', p.id, `Thiếu "${p.name}" cho "${serviceName}" (${reference}): cần ${mat.quantity}, trừ ${use}`, null, null, m);
    }
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
    if (p.value < 0) throw new BusinessRuleError('BR-06', 'Giá trị khuyến mãi không được âm');
    if (p.type === PromotionType.PERCENT && p.value > 100) throw new BusinessRuleError('BR-06', 'Khuyến mãi theo % không vượt quá 100');
    if (p.startDate && p.endDate && p.startDate > p.endDate) throw new BusinessRuleError('PROMO', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
    if (p.serviceCategory && !(await this.ds.manager.findOneBy(SalonService, { category: p.serviceCategory }))) {
      throw new BusinessRuleError('PROMO', `Nhóm dịch vụ "${p.serviceCategory}" không tồn tại`);
    }
    const saved = await repo.save(p);
    await this.audit.log(user, id ? 'PROMOTION_UPDATE' : 'PROMOTION_CREATE', 'Promotion', saved.id, `${id ? 'Sửa' : 'Tạo'} khuyến mãi "${saved.name}"`);
    return saved;
  }
}
