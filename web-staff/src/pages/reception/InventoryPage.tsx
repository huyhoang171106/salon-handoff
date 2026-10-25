import { FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { dateTime, vnd } from '../../lib/format';
import { TX_TYPE } from '../../lib/labels';
import { useAction, useLoad } from '../../lib/util';
import { useProducts } from '../../lib/data';
import type { InventoryTx } from '../../lib/types';
import { ErrorAlert, Field, Loading, OkAlert, PageHead, Section } from '../../components/ui';

interface Line {
  productId: number | '';
  quantity: number;
  unitCost: number;
}

export function InventoryPage() {
  const products = useProducts();
  const txs = useLoad(() => api<InventoryTx[]>('/inventory/transactions'));
  const list = products.data ?? [];
  const low = list.filter((p) => p.active && p.stock <= p.minStock);
  const refresh = () => {
    products.reload();
    txs.reload();
  };

  return (
    <div className="page stack">
      <PageHead eyebrow={`${list.length} mặt hàng · ${low.length} sắp hết`} title="Kho" sub="Sản phẩm bán lẻ và nguyên vật liệu dùng cho dịch vụ." />
      <ErrorAlert error={products.error} />
      {products.loading && !products.data && <Loading />}
      {list.length > 0 && (
        <div className="card flush table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th><th>Tên</th><th>Loại</th><th className="num">Giá bán</th><th className="num">Tồn</th><th className="num">Tối thiểu</th><th>Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td className="small">{p.sku}</td>
                  <td>{p.name}</td>
                  <td className="small">{p.kind === 'RETAIL' ? 'Bán lẻ' : 'Nguyên liệu'}</td>
                  <td className="num">{p.kind === 'RETAIL' ? vnd(p.price) : '—'}</td>
                  <td className="num">{p.stock} {p.unit}</td>
                  <td className="num">{p.minStock}</td>
                  <td>{!p.active ? <span className="badge neutral">Ngừng dùng</span> : p.stock <= p.minStock ? <span className="badge warn">Sắp hết</span> : <span className="badge ok">Đủ hàng</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="two-col even">
        <ReceiptForm products={list} onDone={refresh} />
        <MovementForm products={list} onDone={refresh} />
      </div>
      <Section title="Biến động kho gần đây">
        {txs.loading && !txs.data ? (
          <Loading />
        ) : (txs.data ?? []).length === 0 ? (
          <p className="muted small">Chưa có biến động kho.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Thời gian</th><th>Sản phẩm</th><th>Loại</th><th className="num">SL</th><th className="num">Tồn sau</th><th>Ghi chú</th></tr>
              </thead>
              <tbody>
                {(txs.data ?? []).slice(0, 30).map((t) => (
                  <tr key={t.id}>
                    <td className="small">{dateTime(t.createdAt)}</td>
                    <td>{t.product.name}</td>
                    <td className="small">{TX_TYPE[t.type] ?? t.type}</td>
                    <td className="num">{t.quantity > 0 ? `+${t.quantity}` : t.quantity}</td>
                    <td className="num">{t.stockAfter}</td>
                    <td className="small muted">{t.note ?? t.reference ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function ReceiptForm({ products, onDone }: { products: { id: number; name: string; unit: string }[]; onDone: () => void }) {
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: 1, unitCost: 0 }]);
  const [note, setNote] = useState('');
  const act = useAction();
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  async function submit(e: FormEvent) {
    e.preventDefault();
    const valid = lines.filter((l) => l.productId && l.quantity > 0);
    if (!valid.length) return act.setError('Thêm ít nhất một dòng hợp lệ');
    const r = await act.run(() => api('/inventory/receipts', { body: { lines: valid, note: note.trim() || undefined } }), `Đã nhập kho ${valid.length} dòng`);
    if (r) {
      setLines([{ productId: '', quantity: 1, unitCost: 0 }]);
      setNote('');
      onDone();
    }
  }
  return (
    <Section title="Phiếu nhập kho">
      <form className="stack" onSubmit={submit}>
        {lines.map((l, i) => (
          <div key={i} className="receipt-line">
            <Field label={`Sản phẩm dòng ${i + 1}`}>
              <select className="input" value={l.productId} onChange={(e) => set(i, { productId: e.target.value ? Number(e.target.value) : '' })}>
                <option value="">— Chọn —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Số lượng"><input className="input" type="number" min={1} value={l.quantity} onChange={(e) => set(i, { quantity: Number(e.target.value) })} /></Field>
            <Field label="Đơn giá nhập (₫)"><input className="input" type="number" min={0} step={1000} value={l.unitCost} onChange={(e) => set(i, { unitCost: Number(e.target.value) })} /></Field>
            {lines.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label={`Xóa dòng ${i + 1}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                <span aria-hidden="true">✕</span>
              </button>
            )}
          </div>
        ))}
        <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', quantity: 1, unitCost: 0 }])}>+ Thêm dòng</button></div>
        <Field label="Ghi chú"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Nhập từ nhà cung cấp A" /></Field>
        <ErrorAlert error={act.error} />
        <OkAlert message={act.message} />
        <div><button type="submit" className="btn btn-gold btn-sm" disabled={act.busy}>Lưu phiếu nhập</button></div>
      </form>
    </Section>
  );
}

function MovementForm({ products, onDone }: { products: { id: number; name: string }[]; onDone: () => void }) {
  const [productId, setProductId] = useState<number | ''>('');
  const [type, setType] = useState<'USAGE' | 'DAMAGE' | 'ADJUSTMENT'>('USAGE');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!productId) return act.setError('Chọn sản phẩm');
    if (!quantity) return act.setError('Số lượng phải khác 0');
    if (!note.trim()) return act.setError('Cần ghi chú lý do');
    const q = type === 'ADJUSTMENT' ? quantity : -Math.abs(quantity);
    const r = await act.run(() => api('/inventory/movements', { body: { productId, type, quantity: q, note: note.trim() } }), 'Đã ghi nhận biến động kho');
    if (r) {
      setNote('');
      setQuantity(1);
      onDone();
    }
  }
  return (
    <Section title="Xuất dùng / hư hỏng / điều chỉnh">
      <form className="stack" onSubmit={submit}>
        <Field label="Sản phẩm">
          <select className="input" value={productId} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Chọn —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Loại">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="USAGE">Dùng cho dịch vụ (trừ kho)</option>
              <option value="DAMAGE">Hư hỏng (trừ kho)</option>
              <option value="ADJUSTMENT">Điều chỉnh kiểm kê (+/−)</option>
            </select>
          </Field>
          <Field label="Số lượng" hint={type === 'ADJUSTMENT' ? 'Số âm để giảm, số dương để tăng' : 'Sẽ trừ khỏi tồn kho'}>
            <input className="input" type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Ghi chú (bắt buộc)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorAlert error={act.error} />
        <OkAlert message={act.message} />
        <div><button type="submit" className="btn btn-gold btn-sm" disabled={act.busy}>Ghi nhận</button></div>
      </form>
    </Section>
  );
}
