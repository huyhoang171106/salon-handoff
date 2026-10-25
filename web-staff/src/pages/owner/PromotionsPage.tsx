import { FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { date, vnd } from '../../lib/format';
import { useAction, useLoad } from '../../lib/util';
import type { Promotion } from '../../lib/types';
import { Modal } from '../../components/Overlay';
import { ErrorAlert, Field, Loading, PageHead } from '../../components/ui';

export function PromotionsPage() {
  const list = useLoad(() => api<Promotion[]>('/promotions'));
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null);
  return (
    <div className="page stack">
      <PageHead title="Khuyến mãi" sub="Hóa đơn tự áp dụng khuyến mãi tốt nhất mà khách đủ điều kiện." actions={<button type="button" className="btn btn-gold" onClick={() => setEditing('new')}>+ Thêm khuyến mãi</button>} />
      <ErrorAlert error={list.error} />
      {list.loading && !list.data && <Loading />}
      {list.data && (
        <div className="card flush table-wrap">
          <table className="table">
            <thead><tr><th>Tên</th><th>Mức giảm</th><th>Điều kiện</th><th>Thời gian</th><th>Trạng thái</th><th><span className="sr-only">Sửa</span></th></tr></thead>
            <tbody>
              {list.data.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="num">{p.type === 'PERCENT' ? `${p.value}%` : vnd(p.value)}</td>
                  <td className="small">{[p.memberOnly && 'Thành viên', p.firstVisitOnly && 'Lần đầu', p.serviceCategory && `Nhóm ${p.serviceCategory}`].filter(Boolean).join(' · ') || 'Mọi khách'}</td>
                  <td className="small">{p.startDate ? date(p.startDate) : '…'} – {p.endDate ? date(p.endDate) : '…'}</td>
                  <td>{p.active ? <span className="badge ok">Đang chạy</span> : <span className="badge neutral">Tắt</span>}</td>
                  <td><button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(p)}>Sửa</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <PromoForm p={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); list.reload(); }} />}
    </div>
  );
}

function PromoForm({ p, onClose, onDone }: { p: Promotion | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    name: p?.name ?? '',
    type: p?.type ?? 'PERCENT',
    value: p?.value ?? 10,
    memberOnly: p?.memberOnly ?? true,
    firstVisitOnly: p?.firstVisitOnly ?? false,
    serviceCategory: p?.serviceCategory ?? '',
    startDate: p?.startDate ?? '',
    endDate: p?.endDate ?? '',
    active: p?.active ?? true,
  });
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return act.setError('Nhập tên khuyến mãi');
    const body = { ...f, serviceCategory: f.serviceCategory || null, startDate: f.startDate || null, endDate: f.endDate || null };
    const r = await act.run(() => (p ? api(`/promotions/${p.id}`, { method: 'PATCH', body }) : api('/promotions', { body })));
    if (r) onDone();
  }
  return (
    <Modal title={p ? `Sửa "${p.name}"` : 'Thêm khuyến mãi'} onClose={onClose} footer={<><button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button><button type="submit" form="promo-form" className="btn btn-gold" disabled={act.busy}>Lưu</button></>}>
      <form id="promo-form" className="stack" onSubmit={submit}>
        <Field label="Tên"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="form-grid">
          <Field label="Loại">
            <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Promotion['type'] })}>
              <option value="PERCENT">Giảm theo %</option><option value="AMOUNT">Giảm số tiền</option>
            </select>
          </Field>
          <Field label={f.type === 'PERCENT' ? 'Mức giảm (%)' : 'Mức giảm (₫)'}><input className="input" type="number" min={0} value={f.value} onChange={(e) => setF({ ...f, value: Number(e.target.value) })} /></Field>
          <Field label="Từ ngày"><input className="input" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
          <Field label="Đến ngày"><input className="input" type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
          <Field label="Chỉ nhóm dịch vụ (để trống = tất cả)"><input className="input" value={f.serviceCategory} onChange={(e) => setF({ ...f, serviceCategory: e.target.value })} /></Field>
        </div>
        <div className="row">
          <label className="check"><input type="checkbox" checked={f.memberOnly} onChange={(e) => setF({ ...f, memberOnly: e.target.checked })} /><span>Chỉ thành viên</span></label>
          <label className="check"><input type="checkbox" checked={f.firstVisitOnly} onChange={(e) => setF({ ...f, firstVisitOnly: e.target.checked })} /><span>Chỉ lần đầu</span></label>
          <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /><span>Đang chạy</span></label>
        </div>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}
