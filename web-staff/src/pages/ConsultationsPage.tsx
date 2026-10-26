import { FormEvent, useState } from 'react';
import { api } from '../lib/api';
import { dateTime, vnd } from '../lib/format';
import { CONSULT_RESULT } from '../lib/labels';
import { useAuth } from '../lib/auth';
import { useServices } from '../lib/data';
import { customerName, useAction, useLoad } from '../lib/util';
import type { Consultation } from '../lib/types';
import { Modal } from '../components/Overlay';
import { Contact, CustomerPicker } from '../components/CustomerPicker';
import { ServicePicker } from '../components/ServicePicker';
import { Empty, ErrorAlert, Field, Loading, PageHead, Segmented, StatusBadge } from '../components/ui';

type Result = Consultation['result'];

/** Phiên tư vấn trước khi chốt dịch vụ (mục 3.1.1, FR-26, BR-12). */
export function ConsultationsPage() {
  const { user } = useAuth();
  const list = useLoad(() => api<Consultation[]>('/consultations'));
  const [filter, setFilter] = useState<Result | 'ALL'>('ALL');
  const [open, setOpen] = useState(false);
  const canCreate = user?.role !== 'ASSISTANT';
  const items = (list.data ?? []).filter((c) => filter === 'ALL' || c.result === filter);

  return (
    <div className="page stack">
      <PageHead
        title="Tư vấn"
        sub="Nhu cầu của khách, dịch vụ đề xuất và kết quả tư vấn"
        actions={canCreate && <button type="button" className="btn btn-gold" onClick={() => setOpen(true)}>+ Ghi nhận tư vấn</button>}
      />
      <Segmented<Result | 'ALL'>
        label="Lọc theo kết quả"
        value={filter}
        onChange={setFilter}
        options={[{ value: 'ALL', label: 'Tất cả' }, ...(Object.keys(CONSULT_RESULT) as Result[]).map((k) => ({ value: k, label: CONSULT_RESULT[k].label }))]}
      />
      <ErrorAlert error={list.error} />
      {list.loading && !list.data && <Loading />}
      {list.data && items.length === 0 && <Empty>Chưa có phiên tư vấn nào.</Empty>}
      {items.length > 0 && <ConsultationTable items={items} showCustomer />}
      {open && <ConsultationForm onClose={() => setOpen(false)} onDone={() => { setOpen(false); list.reload(); }} />}
    </div>
  );
}

/** Bảng tư vấn — dùng ở trang Tư vấn và trong hồ sơ khách. */
export function ConsultationTable({ items, showCustomer }: { items: Consultation[]; showCustomer?: boolean }) {
  return (
    <div className="card flush table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Thời gian</th>
            {showCustomer && <th>Khách</th>}
            <th>Người tư vấn</th>
            <th>Nhu cầu / tình trạng tóc</th>
            <th>Dịch vụ đề xuất</th>
            <th>Kết quả</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td className="small">{dateTime(c.createdAt)}</td>
              {showCustomer && <td>{customerName(c.customer, 'Khách chưa có hồ sơ')}</td>}
              <td className="small">{c.consultant.fullName}</td>
              <td className="small">
                {c.needs}
                {c.hairCondition && <div className="muted">Tóc: {c.hairCondition}</div>}
                {c.budget != null && <div className="muted">Ngân sách: {vnd(c.budget)}</div>}
              </td>
              <td className="small" style={{ whiteSpace: 'pre-line' }}>{c.proposal}</td>
              <td><StatusBadge map={CONSULT_RESULT} value={c.result} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConsultationForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const services = useServices();
  const act = useAction();
  const [contact, setContact] = useState<Contact>({ fullName: '', phone: '' });
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [f, setF] = useState({ needs: '', hairCondition: '', budget: '', note: '', result: 'ACCEPTED' as Result });

  const picked = (services.data ?? []).filter((s) => serviceIds.includes(s.id));
  const estimate = picked.reduce((t, s) => t + s.basePrice, 0);
  const minutes = picked.reduce((t, s) => t + s.durationMinutes, 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!contact.id && (contact.fullName.trim() || contact.phone.trim())) return act.setError('Chọn khách từ kết quả tìm kiếm, hoặc để trống nếu khách chưa có hồ sơ');
    if (!f.needs.trim()) return act.setError('Nhập nhu cầu của khách');
    const lines = picked.map((s) => `${s.name} · ${s.priceFrom ? 'từ ' : ''}${vnd(s.basePrice)} · ${s.durationMinutes} phút`);
    if (picked.length > 1) lines.push(`Dự kiến: ${vnd(estimate)} · ${minutes} phút`);
    if (f.note.trim()) lines.push(f.note.trim());
    if (!lines.length) return act.setError('Chọn dịch vụ đề xuất hoặc ghi phương án tư vấn');
    const body = {
      customerId: contact.id,
      needs: f.needs.trim(),
      hairCondition: f.hairCondition.trim() || undefined,
      budget: f.budget ? Number(f.budget) : undefined,
      proposal: lines.join('\n'),
      result: f.result,
    };
    if (await act.run(() => api('/consultations', { body }))) onDone();
  }

  return (
    <Modal
      title="Ghi nhận tư vấn"
      wide
      eyebrow="Chỉ chốt dịch vụ khi khách đồng ý phương án và mức giá (BR-12)"
      onClose={onClose}
      footer={<><button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button><button type="submit" form="consult-form" className="btn btn-gold" disabled={act.busy}>Lưu</button></>}
    >
      <form id="consult-form" className="stack" onSubmit={submit}>
        <CustomerPicker value={contact} onChange={setContact} optional />
        <Field label="Nhu cầu / mong muốn của khách">
          <textarea className="input" rows={2} value={f.needs} onChange={(e) => setF({ ...f, needs: e.target.value })} />
        </Field>
        <div className="form-grid">
          <Field label="Tình trạng tóc (không bắt buộc)">
            <input className="input" value={f.hairCondition} onChange={(e) => setF({ ...f, hairCondition: e.target.value })} placeholder="VD: tóc khô, đã tẩy 2 lần" />
          </Field>
          <Field label="Ngân sách dự kiến (₫)">
            <input className="input" type="number" min={0} step={10000} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
          </Field>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="small">Dịch vụ đề xuất</span>
          {services.data ? <ServicePicker services={services.data} value={serviceIds} onChange={setServiceIds} /> : <Loading />}
          {picked.length > 0 && <p className="small muted" style={{ margin: 0 }}>Dự kiến {vnd(estimate)} · {minutes} phút</p>}
        </div>
        <Field label="Ghi chú phương án (không bắt buộc)">
          <textarea className="input" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <span className="small">Kết quả tư vấn</span>
        <Segmented<Result>
          label="Kết quả tư vấn"
          value={f.result}
          onChange={(result) => setF({ ...f, result })}
          options={(Object.keys(CONSULT_RESULT) as Result[]).map((k) => ({ value: k, label: CONSULT_RESULT[k].label }))}
        />
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}
