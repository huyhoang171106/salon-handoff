import { ChangeEvent, FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { vnd } from '../../lib/format';
import { COMMISSION_MODE, SERVICE_STATUS } from '../../lib/labels';
import { pct, useAction } from '../../lib/util';
import { useServices } from '../../lib/data';
import type { Service } from '../../lib/types';
import { Modal } from '../../components/Overlay';
import { ErrorAlert, Field, Loading, PageHead, StatusBadge } from '../../components/ui';

export function ServicesPage() {
  const services = useServices(true);
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  return (
    <div className="page stack">
      <PageHead title="Dịch vụ & giá" actions={<button type="button" className="btn btn-gold" onClick={() => setEditing('new')}>+ Thêm dịch vụ</button>} />
      <ErrorAlert error={services.error} />
      {services.loading && !services.data && <Loading />}
      {services.data && (
        <div className="card flush table-wrap">
          <table className="table">
            <thead>
              <tr><th>Mã</th><th>Dịch vụ</th><th>Nhóm</th><th className="num">Giá</th><th className="num">Thời lượng</th><th>Hoa hồng</th><th>Yêu cầu</th><th>Trạng thái</th><th><span className="sr-only">Sửa</span></th></tr>
            </thead>
            <tbody>
              {services.data.map((s) => (
                <tr key={s.id}>
                  <td className="small">{s.code}</td>
                  <td>{s.name}</td>
                  <td className="small">{s.category}</td>
                  <td className="num">{s.priceFrom ? 'Từ ' : ''}{vnd(s.basePrice)}</td>
                  <td className="num">{s.durationMinutes}′</td>
                  <td className="small">
                    Quỹ {pct(s.commissionRate)} · {s.commissionMode === 'PERCENT_SPLIT' ? `thợ chính ${pct(s.leadShare)}` : `thợ phụ ${vnd(s.assistantFixedFee)}`}
                  </td>
                  <td className="small">
                    {[s.needsAssistant && 'Cần thợ phụ', s.depositRequired && 'Đặt cọc'].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td><StatusBadge map={SERVICE_STATUS} value={s.status} /></td>
                  <td><button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(s)}>Sửa</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="alert warn" style={{ margin: 0 }}>Giá mới chỉ áp dụng cho hóa đơn mới. Hóa đơn đã lập giữ nguyên giá cũ; mọi thay đổi giá được ghi nhật ký.</p>
      {editing && <ServiceForm svc={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); services.reload(); }} />}
    </div>
  );
}

function ServiceForm({ svc, onClose, onDone }: { svc: Service | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    code: svc?.code ?? '',
    name: svc?.name ?? '',
    category: svc?.category ?? 'CẮT',
    audience: svc?.audience ?? 'ALL',
    basePrice: svc?.basePrice ?? 0,
    priceFrom: svc?.priceFrom ?? false,
    durationMinutes: svc?.durationMinutes ?? 30,
    status: svc?.status ?? 'ACTIVE',
    needsAssistant: svc?.needsAssistant ?? false,
    assistantMinutes: svc?.assistantMinutes ?? 0,
    commissionRate: svc?.commissionRate ?? 0.1,
    commissionMode: svc?.commissionMode ?? 'PERCENT_SPLIT',
    leadShare: svc?.leadShare ?? 0.7,
    assistantFixedFee: svc?.assistantFixedFee ?? 0,
    depositRequired: svc?.depositRequired ?? false,
    description: svc?.description ?? '',
  });
  const act = useAction();
  const num = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { code, ...rest } = f;
    const body = { ...rest, description: f.description || undefined };
    const r = await act.run(() => (svc ? api(`/services/${svc.id}`, { method: 'PATCH', body }) : api('/services', { body: { code, ...body } })));
    if (r) onDone();
  }

  return (
    <Modal
      title={svc ? `Sửa "${svc.name}"` : 'Thêm dịch vụ'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button>
          <button type="submit" form="svc-form" className="btn btn-gold" disabled={act.busy}>Lưu</button>
        </>
      }
    >
      <form id="svc-form" className="stack" onSubmit={submit}>
        <div className="form-grid">
          {!svc && <Field label="Mã dịch vụ"><input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>}
          <Field label="Tên dịch vụ"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Nhóm"><input className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
          <Field label="Đối tượng">
            <select className="input" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as Service['audience'] })}>
              <option value="ALL">Tất cả</option><option value="LONG">Tóc dài / nữ</option><option value="SHORT">Tóc ngắn / nam</option>
            </select>
          </Field>
          <Field label="Giá (₫)" hint={svc ? 'Giá mới chỉ áp dụng cho hóa đơn mới' : undefined}><input className="input" type="number" min={0} step={1000} value={f.basePrice} onChange={num('basePrice')} /></Field>
          <Field label="Thời lượng (phút)"><input className="input" type="number" min={5} step={5} value={f.durationMinutes} onChange={num('durationMinutes')} /></Field>
          <Field label="Trạng thái">
            <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Service['status'] })}>
              {Object.entries(SERVICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Quỹ hoa hồng (% giá)"><input className="input" type="number" min={0} max={100} step={0.5} value={Math.round(f.commissionRate * 1000) / 10} onChange={(e) => setF({ ...f, commissionRate: Number(e.target.value) / 100 })} /></Field>
          <Field label="Cách chia cho thợ phụ">
            <select className="input" value={f.commissionMode} onChange={(e) => setF({ ...f, commissionMode: e.target.value as Service['commissionMode'] })}>
              {Object.entries(COMMISSION_MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {f.commissionMode === 'PERCENT_SPLIT' ? (
            <Field label="Phần thợ chính trong quỹ (%)"><input className="input" type="number" min={0} max={100} step={5} value={Math.round(f.leadShare * 100)} onChange={(e) => setF({ ...f, leadShare: Number(e.target.value) / 100 })} /></Field>
          ) : (
            <Field label="Thù lao cố định mỗi thợ phụ (₫)"><input className="input" type="number" min={0} step={1000} value={f.assistantFixedFee} onChange={num('assistantFixedFee')} /></Field>
          )}
          {f.needsAssistant && <Field label="Số phút cần thợ phụ (0 = toàn bộ)"><input className="input" type="number" min={0} step={5} value={f.assistantMinutes} onChange={num('assistantMinutes')} /></Field>}
        </div>
        <div className="row">
          <label className="check"><input type="checkbox" checked={f.priceFrom} onChange={(e) => setF({ ...f, priceFrom: e.target.checked })} /><span>Giá hiển thị “Từ …”</span></label>
          <label className="check"><input type="checkbox" checked={f.needsAssistant} onChange={(e) => setF({ ...f, needsAssistant: e.target.checked })} /><span>Cần thợ phụ</span></label>
          <label className="check"><input type="checkbox" checked={f.depositRequired} onChange={(e) => setF({ ...f, depositRequired: e.target.checked })} /><span>Bắt buộc đặt cọc</span></label>
        </div>
        <Field label="Mô tả"><textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}
