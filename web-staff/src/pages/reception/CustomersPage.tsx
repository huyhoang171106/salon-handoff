import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { APPOINTMENT_STATUS, date, dateTime, vnd } from '../../lib/format';
import { useAction, useLoad } from '../../lib/util';
import type { Appointment, Consultation, Customer } from '../../lib/types';
import { ConsultationTable } from '../ConsultationsPage';
import { Modal } from '../../components/Overlay';
import { Empty, ErrorAlert, Field, Loading, OkAlert, PageHead, StatusBadge } from '../../components/ui';

interface Detail {
  customer: Customer;
  appointments: Appointment[];
  invoices: { id: number; code: string; paidAt: string; total: number; items: { description: string; unitPrice: number; quantity: number }[]; stylists: string[] }[];
}

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [selected, setSelected] = useState<number | null>(params.get('id') ? Number(params.get('id')) : null);
  const [creating, setCreating] = useState(false);
  const term = params.get('q') ?? '';
  const list = useLoad(() => api<Customer[]>('/customers', { query: { q: term || undefined } }), [term]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== term) setParams(q ? { q } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [q, term, setParams]);

  const customers = (list.data ?? []).filter((c) => c.phone !== '0000000000');

  return (
    <div className="page stack">
      <PageHead
        title="Khách hàng"
        sub="Hồ sơ, ghi chú tóc / công thức màu (chỉ nội bộ), lịch sử đặt lịch và hóa đơn."
        actions={
          <button type="button" className="btn btn-gold" onClick={() => setCreating(true)}>
            + Thêm khách
          </button>
        }
      />
      <div className="master-detail">
        <section className="card stack" aria-label="Danh sách khách">
          <label className="field">
            <span>Tìm theo tên, SĐT hoặc mã khách</span>
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="VD: 0988 hoặc Lan" />
          </label>
          <ErrorAlert error={list.error} />
          {list.loading && !list.data && <Loading />}
          {list.data && customers.length === 0 && <Empty>Không tìm thấy khách phù hợp.</Empty>}
          <ul className="select-list">
            {customers.map((c) => (
              <li key={c.id}>
                <button type="button" className="select-item" aria-current={selected === c.id} onClick={() => setSelected(c.id)}>
                  <span className="row" style={{ gap: 8 }}>
                    <strong>{c.fullName}</strong>
                    {c.isMember && <span className="badge gold">Thành viên</span>}
                    {c.noShowCount > 0 && <span className="badge bad">Vắng {c.noShowCount}</span>}
                  </span>
                  <span className="muted small">
                    {c.phone} · {c.code}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {selected ? <CustomerDetail key={selected} id={selected} onSaved={() => list.reload()} /> : <Empty>Chọn một khách để xem hồ sơ.</Empty>}
      </div>
      {creating && (
        <CreateCustomer
          onClose={() => setCreating(false)}
          onDone={(c) => {
            setCreating(false);
            list.reload();
            setSelected(c.id);
          }}
        />
      )}
    </div>
  );
}

function CustomerDetail({ id, onSaved }: { id: number; onSaved: () => void }) {
  const d = useLoad(() => api<Detail>(`/customers/${id}`), [id]);
  const consults = useLoad(() => api<Consultation[]>('/consultations', { query: { customerId: id } }), [id]);
  const [notes, setNotes] = useState('');
  const [form, setForm] = useState({ fullName: '', phone: '', birthDate: '' });
  const act = useAction();
  useEffect(() => {
    if (d.data) {
      setNotes(d.data.customer.hairNotes ?? '');
      setForm({ fullName: d.data.customer.fullName, phone: d.data.customer.phone, birthDate: d.data.customer.birthDate ?? '' });
    }
  }, [d.data]);
  if (d.loading && !d.data) return <Loading />;
  if (!d.data) return <ErrorAlert error={d.error} />;
  const c = d.data.customer;

  async function save(e: FormEvent) {
    e.preventDefault();
    const r = await act.run(
      () => api<Customer>(`/customers/${id}`, { method: 'PATCH', body: { fullName: form.fullName, phone: form.phone, birthDate: form.birthDate || undefined, hairNotes: notes } }),
      'Đã lưu hồ sơ khách',
    );
    if (r) {
      d.reload();
      onSaved();
    }
  }

  return (
    <section className="stack" aria-label={`Hồ sơ ${c.fullName}`}>
      <div className="card stack">
        <div className="spread">
          <div className="stack" style={{ gap: 2 }}>
            <span className="eyebrow">{c.code}</span>
            <h2 className="section-title">{c.fullName}</h2>
          </div>
          <div className="row">
            {c.isMember && <span className="badge gold">Thành viên</span>}
            {c.noShowCount > 0 ? <span className="badge bad">Vắng mặt {c.noShowCount} lần</span> : <span className="badge ok">Chưa vắng lần nào</span>}
          </div>
        </div>
        <div className="row small muted">
          <span>{c.visitCount} lượt đến</span>
          {c.lastVisitAt && <span>· lần cuối {date(c.lastVisitAt)}</span>}
        </div>
        {c.noShowCount >= 2 && <div className="alert warn">Khách đã vắng mặt nhiều lần — lịch mới cần đặt cọc.</div>}
        <form className="stack" onSubmit={save}>
          <div className="form-grid">
            <Field label="Họ tên">
              <input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </Field>
            <Field label="Số điện thoại">
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Ngày sinh">
              <input className="input" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
            </Field>
          </div>
          <Field label="Ghi chú tóc / công thức màu (chỉ nội bộ)">
            <textarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="VD: Chân tóc 6.1 + 7.0 (1:1), oxy 6%, 35 phút" />
          </Field>
          <ErrorAlert error={act.error} />
          <OkAlert message={act.message} />
          <div>
            <button type="submit" className="btn btn-gold btn-sm" disabled={act.busy}>
              Lưu hồ sơ
            </button>
          </div>
        </form>
      </div>

      <div className="card stack">
        <h3 className="step-title">Lịch hẹn ({d.data.appointments.length})</h3>
        {d.data.appointments.length === 0 ? (
          <p className="muted small">Chưa có lịch hẹn.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Mã</th><th>Thời gian</th><th>Dịch vụ</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {d.data.appointments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.code}</td>
                    <td>{dateTime(a.startAt)}</td>
                    <td className="small">{a.items.map((i) => `${i.service.name} (${i.leadStylist.fullName})`).join(', ')}</td>
                    <td><StatusBadge map={APPOINTMENT_STATUS} value={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="stack">
        <h3 className="step-title">Lịch sử tư vấn ({consults.data?.length ?? 0})</h3>
        {consults.data?.length ? <ConsultationTable items={consults.data} /> : <p className="muted small">Chưa có phiên tư vấn.</p>}
      </div>

      <div className="card stack">
        <h3 className="step-title">Hóa đơn đã thanh toán ({d.data.invoices.length})</h3>
        {d.data.invoices.length === 0 ? (
          <p className="muted small">Chưa có hóa đơn.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Mã</th><th>Ngày</th><th>Nội dung</th><th>Thợ</th><th className="num">Tổng</th></tr>
              </thead>
              <tbody>
                {d.data.invoices.map((i) => (
                  <tr key={i.id}>
                    <td>{i.code}</td>
                    <td>{i.paidAt ? date(i.paidAt) : '—'}</td>
                    <td className="small">{i.items.map((x) => x.description).join(', ')}</td>
                    <td className="small">{i.stylists.join(', ')}</td>
                    <td className="num">{vnd(i.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function CreateCustomer({ onClose, onDone }: { onClose: () => void; onDone: (c: Customer) => void }) {
  const [form, setForm] = useState({ fullName: '', phone: '', birthDate: '', hairNotes: '' });
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await act.run(() =>
      api<Customer>('/customers', { body: { fullName: form.fullName.trim(), phone: form.phone.trim(), birthDate: form.birthDate || undefined, hairNotes: form.hairNotes || undefined } }),
    );
    if (r) onDone(r);
  }
  return (
    <Modal
      title="Thêm khách hàng"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button>
          <button type="submit" form="new-cus" className="btn btn-gold" disabled={act.busy}>Lưu</button>
        </>
      }
    >
      <form id="new-cus" className="stack" onSubmit={submit}>
        <Field label="Họ tên"><input className="input" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
        <Field label="Số điện thoại"><input className="input" required inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Ngày sinh (không bắt buộc)"><input className="input" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></Field>
        <Field label="Ghi chú tóc"><textarea className="input" rows={2} value={form.hairNotes} onChange={(e) => setForm({ ...form, hairNotes: e.target.value })} /></Field>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}
