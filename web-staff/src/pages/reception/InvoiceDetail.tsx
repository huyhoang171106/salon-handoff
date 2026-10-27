import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { dateTime, INVOICE_STATUS, time, vnd } from '../../lib/format';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS } from '../../lib/labels';
import { customerName, useAction, useLoad } from '../../lib/util';
import { useProducts } from '../../lib/data';
import type { Invoice, Payment } from '../../lib/types';
import { Modal } from '../../components/Overlay';
import { ErrorAlert, Loading, OkAlert, PageHead, Segmented, StatusBadge } from '../../components/ui';
import { assignmentText } from './SessionsPage';

/** Màn POS: dòng hóa đơn, thêm sản phẩm, thanh toán tiền mặt / chuyển khoản. */
export function InvoiceDetail() {
  const { id } = useParams();
  const inv = useLoad(() => api<Invoice>(`/invoices/${id}`), [id]);
  const products = useProducts('RETAIL');
  const act = useAction();
  const [productId, setProductId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [method, setMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [seen, setSeen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const invoice = inv.data;
  const paidAmount = (invoice?.payments ?? []).filter((p) => p.status === 'SUCCEEDED').reduce((t, p) => t + p.amount, 0);
  const remaining = Math.max(0, (invoice?.total ?? 0) - paidAmount);
  useEffect(() => setAmount(String(remaining)), [remaining]);

  if (inv.loading && !invoice) return <div className="page"><Loading /></div>;
  if (!invoice) return <div className="page"><ErrorAlert error={inv.error ?? 'Không tìm thấy hóa đơn'} /></div>;

  const editable = invoice.status === 'DRAFT' || invoice.status === 'PENDING';
  const pending = invoice.payments.filter((p) => p.status === 'PROCESSING' || p.status === 'INITIATED');
  const sessionItems = invoice.session?.items ?? [];
  const update = (r: Invoice | { invoice: Invoice } | undefined) => {
    if (!r) return;
    inv.setData('invoice' in r ? r.invoice : r);
  };

  async function addProduct(e: FormEvent) {
    e.preventDefault();
    if (!productId) return act.setError('Chọn sản phẩm');
    update(await act.run(() => api<Invoice>(`/invoices/${invoice!.id}/products`, { body: { productId, quantity: qty } }), 'Đã thêm sản phẩm'));
    setProductId(null);
    setQty(1);
  }

  async function pay(e: FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return act.setError('Số tiền phải lớn hơn 0');
    if (method === 'TRANSFER' && !reference.trim()) return act.setError('Nhập mã giao dịch chuyển khoản để chống ghi nhận trùng');
    const r = await act.run(
      () =>
        api<{ invoice: Invoice; payment: Payment; duplicate: boolean }>(`/invoices/${invoice!.id}/payments`, {
          body: { method, amount: amt, reference: method === 'TRANSFER' ? reference.trim() : undefined, confirmed: method === 'TRANSFER' ? seen : undefined },
        }),
      (x) =>
        x.duplicate
          ? 'Giao dịch này đã được ghi nhận trước đó — không cộng doanh thu lần hai.'
          : x.invoice.status === 'PAID'
            ? 'Đã thanh toán đủ. Hoa hồng đã được chốt.'
            : x.payment.status === 'PROCESSING'
              ? 'Đã ghi nhận chuyển khoản, chờ xác nhận tiền về.'
              : 'Đã ghi nhận thanh toán.',
    );
    update(r);
    if (r) {
      setReference('');
      setSeen(false);
    }
  }

  async function resolve(p: Payment, success: boolean) {
    update(await act.run(() => api<{ invoice: Invoice }>(`/payments/${p.id}/resolve`, { body: { success } }), success ? 'Đã xác nhận tiền về' : 'Đã đánh dấu giao dịch thất bại'));
  }

  return (
    <div className="page stack">
      <PageHead
        eyebrow={<Link to="/hoa-don">‹ Danh sách hóa đơn</Link>}
        title={`Hóa đơn ${invoice.code}`}
        actions={<StatusBadge map={INVOICE_STATUS} value={invoice.status} />}
      />
      <ErrorAlert error={act.error} />
      <OkAlert message={act.message} />

      <div className="two-col">
        <section className="card stack" aria-label="Chi tiết hóa đơn">
          <div className="spread">
            <div className="stack" style={{ gap: 2 }}>
              <div className="row" style={{ gap: 8 }}>
                <strong className="display big-name">{customerName(invoice.customer, invoice.session?.walkInName)}</strong>
                {invoice.customer?.isMember && <span className="badge gold">Thành viên</span>}
              </div>
              <span className="muted small">
                Lập {dateTime(invoice.createdAt)}
                {invoice.session ? ` · phiên ${invoice.session.code}` : ''}
                {invoice.paidAt ? ` · thanh toán ${time(invoice.paidAt)}` : ''}
              </span>
            </div>
          </div>

          <div className="line-list">
            {invoice.items.map((it) => {
              const si = it.type === 'SERVICE' ? sessionItems.find((x) => x.id === it.refId) : undefined;
              return (
                <div key={it.id} className="line">
                  <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                    <span>
                      {it.description}
                      {it.quantity > 1 ? ` × ${it.quantity}` : ''}
                    </span>
                    <span className="muted small">
                      {it.type === 'SERVICE' ? (si ? assignmentText(si) : 'Dịch vụ · giá đã chốt') : 'Sản phẩm bán lẻ'}
                      {it.discount > 0 ? ` · giảm ${vnd(it.discount)}` : ''}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <span className="num">{vnd(it.unitPrice * it.quantity)}</span>
                    {editable && it.type === 'PRODUCT' && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm icon-btn"
                        aria-label={`Bỏ ${it.description}`}
                        onClick={async () => update(await act.run(() => api<Invoice>(`/invoices/${invoice.id}/items/${it.id}/remove`, { method: 'POST' }), 'Đã bỏ sản phẩm'))}
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="line">
              <span>Tạm tính</span>
              <span className="num">{vnd(invoice.subtotal)}</span>
            </div>
            <div className="line">
              <span>{invoice.promotionName ? `Khuyến mãi: ${invoice.promotionName}` : 'Khuyến mãi'}</span>
              <span className="num">{invoice.discountTotal ? `−${vnd(invoice.discountTotal)}` : '—'}</span>
            </div>
            <div className="line total grand">
              <span>Tổng thanh toán</span>
              <span className="num">{vnd(invoice.total)}</span>
            </div>
            {paidAmount > 0 && (
              <div className="line small">
                <span>Đã thu</span>
                <span className="num">{vnd(paidAmount)}</span>
              </div>
            )}
          </div>

          {editable && (
            <form className="row add-product" onSubmit={addProduct} aria-label="Thêm sản phẩm bán lẻ">
              <label className="field grow">
                <span>Thêm sản phẩm bán lẻ</span>
                <select className="input" value={productId ?? ''} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Chọn sản phẩm —</option>
                  {(products.data ?? []).filter((p) => p.active).map((p) => (
                    <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                      {p.name} · {vnd(p.price)} · còn {p.stock}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field qty">
                <span>SL</span>
                <input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
              </label>
              <button type="submit" className="btn btn-outline" disabled={act.busy}>Thêm</button>
            </form>
          )}

          {invoice.payments.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <h3 className="step-title">Giao dịch</h3>
              {invoice.payments.map((p) => (
                <div key={p.id} className="line">
                  <div className="stack" style={{ gap: 2 }}>
                    <span>{PAYMENT_METHOD_LABEL[p.method]} · {vnd(p.amount)}</span>
                    <span className="muted small">{p.reference} · {time(p.createdAt)}</span>
                  </div>
                  <StatusBadge map={PAYMENT_STATUS} value={p.status} />
                </div>
              ))}
            </div>
          )}
          {invoice.cancelReason && <div className="alert bad">Lý do hủy: {invoice.cancelReason}</div>}
        </section>

        <aside className="card stack pay-panel" aria-label="Thanh toán">
          <h2 className="section-title">Thanh toán</h2>
          {invoice.status === 'PAID' && <div className="alert ok">Hóa đơn đã thanh toán đủ {vnd(invoice.total)}.</div>}
          {invoice.status === 'CANCELLED' && <div className="alert bad">Hóa đơn đã hủy.</div>}

          {pending.map((p) => (
            <div key={p.id} className="subpanel stack" style={{ gap: 8 }}>
              <div className="spread">
                <strong className="small">Chuyển khoản {vnd(p.amount)}</strong>
                <span className="badge warn">Chờ xác nhận</span>
              </div>
              <span className="muted small">Mã GD: {p.reference}</span>
              <div className="row">
                <button type="button" className="btn btn-gold btn-sm" disabled={act.busy} onClick={() => resolve(p, true)}>Xác nhận</button>
                <button type="button" className="btn btn-danger btn-sm" disabled={act.busy} onClick={() => resolve(p, false)}>Thất bại</button>
              </div>
            </div>
          ))}

          {editable && remaining > 0 && (
            <form className="stack" onSubmit={pay}>
              <Segmented<'CASH' | 'TRANSFER'>
                label="Phương thức thanh toán"
                value={method}
                onChange={setMethod}
                options={[{ value: 'CASH', label: 'Tiền mặt' }, { value: 'TRANSFER', label: 'Chuyển khoản' }]}
              />
              <label className="field">
                <span>Số tiền (₫)</span>
                <input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              {method === 'TRANSFER' && (
                <>
                  <label className="field">
                    <span>Mã giao dịch / nội dung chuyển khoản</span>
                    <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="VD: FT2610221234" />
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={seen} onChange={(e) => setSeen(e.target.checked)} />
                    <span>Đã thấy tiền về tài khoản salon</span>
                  </label>
                  <p className="muted small" style={{ margin: 0 }}>
                    Chỉ xác nhận khi đã thấy tiền về. Giao dịch trùng mã sẽ không cộng doanh thu lần hai.
                  </p>
                </>
              )}
              <button type="submit" className="btn btn-gold" disabled={act.busy}>
                {method === 'CASH' ? 'Xác nhận đã nhận tiền' : seen ? 'Ghi nhận chuyển khoản' : 'Ghi nhận, chờ tiền về'}
              </button>
            </form>
          )}
          {editable && (
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setCancelOpen(true)}>
              Hủy hóa đơn
            </button>
          )}
        </aside>
      </div>

      {cancelOpen && <CancelInvoice invoice={invoice} onClose={() => setCancelOpen(false)} onDone={(r) => { inv.setData(r); setCancelOpen(false); }} />}
    </div>
  );
}

function CancelInvoice({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: (i: Invoice) => void }) {
  const [reason, setReason] = useState('');
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return act.setError('Cần ghi lý do hủy');
    const r = await act.run(() => api<Invoice>(`/invoices/${invoice.id}/cancel`, { body: { reason: reason.trim() } }));
    if (r) onDone(r);
  }
  return (
    <Modal
      title={`Hủy hóa đơn ${invoice.code}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Giữ hóa đơn</button>
          <button type="submit" form="cancel-inv" className="btn btn-danger" disabled={act.busy}>Hủy hóa đơn</button>
        </>
      }
    >
      <form id="cancel-inv" className="stack" onSubmit={submit}>
        <label className="field">
          <span>Lý do hủy (bắt buộc, được ghi nhật ký)</span>
          <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}
