import { FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { date, todayVN, vnd } from '../../lib/format';
import { EQUIPMENT_KIND, EQUIPMENT_STATUS } from '../../lib/labels';
import { useAction, useLoad } from '../../lib/util';
import type { Equipment } from '../../lib/types';
import { Modal } from '../../components/Overlay';
import { ErrorAlert, Field, Kpi, Loading, PageHead, StatusBadge } from '../../components/ui';

export function EquipmentPage() {
  const list = useLoad(() => api<Equipment[]>('/equipment'));
  const [editing, setEditing] = useState<Equipment | 'new' | null>(null);
  const [maint, setMaint] = useState<Equipment | null>(null);
  const done = () => {
    setEditing(null);
    setMaint(null);
    list.reload();
  };
  return (
    <div className="page stack">
      <PageHead title="Thiết bị & tài nguyên" sub="Thiết bị đang bảo trì / hỏng không được tính khi xếp lịch cho dịch vụ cần đến nó (BR-14). Chi phí bảo trì tự ghi vào chi phí vận hành." actions={<button type="button" className="btn btn-gold" onClick={() => setEditing('new')}>+ Thêm thiết bị</button>} />
      <ErrorAlert error={list.error} />
      {list.loading && !list.data && <Loading />}
      {list.data && (
        <div className="kpi-grid">
          {Object.entries(EQUIPMENT_KIND).map(([k, label]) => {
            const all = list.data!.filter((e) => e.kind === k && e.status !== 'RETIRED');
            if (!all.length) return null;
            const ok = all.filter((e) => e.status === 'IN_USE').length;
            return <Kpi key={k} label={label} value={`${ok}/${all.length}`} sub={ok < all.length ? `${all.length - ok} hỏng / bảo trì` : 'Dùng được tất cả'} tone={ok < all.length ? 'bad' : undefined} />;
          })}
        </div>
      )}
      {list.data && (
        <div className="card flush table-wrap">
          <table className="table">
            <thead><tr><th>Mã</th><th>Tên</th><th>Loại</th><th>Vị trí</th><th>Ngày mua</th><th className="num">Giá trị</th><th>Bảo trì gần nhất</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
            <tbody>
              {list.data.map((e) => {
                const last = [...(e.maintenance ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0];
                return (
                  <tr key={e.id}>
                    <td className="small">{e.code}</td>
                    <td>{e.name}</td>
                    <td className="small">{EQUIPMENT_KIND[e.kind] ?? e.kind}</td>
                    <td className="small">{e.location ?? '—'}</td>
                    <td className="small">{e.purchaseDate ? date(e.purchaseDate) : '—'}</td>
                    <td className="num">{vnd(e.cost)}</td>
                    <td className="small">{last ? `${date(last.date)} · ${last.description}` : '—'}</td>
                    <td><StatusBadge map={EQUIPMENT_STATUS} value={e.status} /></td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(e)}>Sửa</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMaint(e)}>Ghi bảo trì</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <EquipForm eq={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={done} />}
      {maint && <MaintForm eq={maint} onClose={() => setMaint(null)} onDone={done} />}
    </div>
  );
}

function EquipForm({ eq, onClose, onDone }: { eq: Equipment | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ code: eq?.code ?? '', name: eq?.name ?? '', kind: eq?.kind ?? 'KHAC', location: eq?.location ?? '', purchaseDate: eq?.purchaseDate ?? '', cost: eq?.cost ?? 0, status: eq?.status ?? 'IN_USE' });
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { ...f, location: f.location || undefined, purchaseDate: f.purchaseDate || undefined };
    if (await act.run(() => (eq ? api(`/equipment/${eq.id}`, { method: 'PATCH', body }) : api('/equipment', { body })))) onDone();
  }
  return (
    <Modal title={eq ? `Sửa ${eq.code}` : 'Thêm thiết bị'} onClose={onClose} footer={<><button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button><button type="submit" form="eq-form" className="btn btn-gold" disabled={act.busy}>Lưu</button></>}>
      <form id="eq-form" className="stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Mã"><input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          <Field label="Tên"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Loại">
            <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {Object.entries(EQUIPMENT_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Vị trí"><input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          <Field label="Ngày mua"><input className="input" type="date" value={f.purchaseDate} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} /></Field>
          <Field label="Giá trị (₫)"><input className="input" type="number" min={0} step={1000} value={f.cost} onChange={(e) => setF({ ...f, cost: Number(e.target.value) })} /></Field>
          <Field label="Trạng thái">
            <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Equipment['status'] })}>
              {Object.entries(EQUIPMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}

function MaintForm({ eq, onClose, onDone }: { eq: Equipment; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ date: todayVN(), description: '', cost: 0, newStatus: '' });
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.description.trim()) return act.setError('Nhập nội dung bảo trì');
    if (await act.run(() => api(`/equipment/${eq.id}/maintenance`, { body: { ...f, newStatus: f.newStatus || undefined } }))) onDone();
  }
  return (
    <Modal title={`Ghi bảo trì ${eq.code} · ${eq.name}`} onClose={onClose} footer={<><button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button><button type="submit" form="mt-form" className="btn btn-gold" disabled={act.busy}>Lưu</button></>}>
      <form id="mt-form" className="stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Ngày"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Chi phí (₫)"><input className="input" type="number" min={0} step={1000} value={f.cost} onChange={(e) => setF({ ...f, cost: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Nội dung"><textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Trạng thái sau bảo trì">
          <select className="input" value={f.newStatus} onChange={(e) => setF({ ...f, newStatus: e.target.value })}>
            <option value="">Giữ nguyên ({EQUIPMENT_STATUS[eq.status].label})</option>
            {Object.entries(EQUIPMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        {eq.maintenance?.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">Lịch sử bảo trì</span>
            {[...eq.maintenance].sort((a, b) => b.date.localeCompare(a.date)).map((m) => (
              <span key={m.id} className="small">{date(m.date)} · {m.description} · {vnd(m.cost)}</span>
            ))}
          </div>
        )}
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}
