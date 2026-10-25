import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { COMPLAINT_STATUS, dateTime } from '../../lib/format';
import { useAction, useLoad } from '../../lib/util';
import { useEmployees } from '../../lib/data';
import type { Complaint } from '../../lib/types';
import { Modal } from '../../components/Overlay';
import { Contact, CustomerPicker } from '../../components/CustomerPicker';
import { Empty, ErrorAlert, Field, Loading, OkAlert, PageHead, Segmented, StatusBadge } from '../../components/ui';

const FLOW: Record<string, string[]> = {
  RECEIVED: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['WAITING_CUSTOMER', 'RESOLVED'],
  WAITING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

type Filter = '' | Complaint['status'];

export function ComplaintsPage() {
  const [status, setStatus] = useState<Filter>('');
  const list = useLoad(() => api<Complaint[]>('/complaints', { query: { status: status || undefined } }), [status]);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const items = list.data ?? [];
  const current = items.find((c) => c.id === selected) ?? null;

  return (
    <div className="page stack">
      <PageHead
        title="Khiếu nại & phản hồi"
        sub="Lịch sử xử lý được lưu đầy đủ, không xóa."
        actions={<button type="button" className="btn btn-gold" onClick={() => setCreating(true)}>+ Tiếp nhận khiếu nại</button>}
      />
      <Segmented<Filter>
        label="Lọc theo trạng thái"
        value={status}
        onChange={setStatus}
        options={[{ value: '', label: 'Tất cả' }, ...Object.entries(COMPLAINT_STATUS).map(([k, v]) => ({ value: k as Filter, label: v.label }))]}
      />
      <ErrorAlert error={list.error} />
      {list.loading && !list.data && <Loading />}
      <div className="master-detail">
        <section className="card stack" aria-label="Danh sách khiếu nại">
          {list.data && items.length === 0 && <Empty>Không có khiếu nại.</Empty>}
          <ul className="select-list">
            {items.map((c) => (
              <li key={c.id}>
                <button type="button" className="select-item" aria-current={selected === c.id} onClick={() => setSelected(c.id)}>
                  <span className="spread" style={{ flexWrap: 'nowrap' }}>
                    <strong className="ellipsis">{c.code} · {c.subject}</strong>
                    <StatusBadge map={COMPLAINT_STATUS} value={c.status} />
                  </span>
                  <span className="muted small">
                    {c.customer?.fullName ?? 'Khách không xác định'} · {dateTime(c.createdAt)}
                    {c.assignee ? ` · xử lý: ${c.assignee.fullName}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {current ? <ComplaintDetail key={current.id} c={current} onChanged={() => list.reload()} /> : <Empty>Chọn một khiếu nại để xem và cập nhật.</Empty>}
      </div>
      {creating && <CreateComplaint onClose={() => setCreating(false)} onDone={(c) => { setCreating(false); list.reload(); setSelected(c.id); }} />}
    </div>
  );
}

function ComplaintDetail({ c, onChanged }: { c: Complaint; onChanged: () => void }) {
  const emps = useEmployees();
  const [status, setStatus] = useState('');
  const [assigneeId, setAssigneeId] = useState<number | ''>(c.assignee?.id ?? '');
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState(c.resolution ?? '');
  const act = useAction();
  useEffect(() => setResolution(c.resolution ?? ''), [c.resolution]);
  const next = FLOW[c.status] ?? [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    if (status) body.status = status;
    if (assigneeId && assigneeId !== c.assignee?.id) body.assigneeId = assigneeId;
    if (note.trim()) body.note = note.trim();
    if (resolution.trim() && resolution !== c.resolution) body.resolution = resolution.trim();
    if (!Object.keys(body).length) return act.setError('Chưa có thay đổi nào');
    const r = await act.run(() => api(`/complaints/${c.id}`, { method: 'PATCH', body }), 'Đã cập nhật khiếu nại');
    if (r) {
      setStatus('');
      setNote('');
      onChanged();
    }
  }

  return (
    <section className="card stack" aria-label={`Khiếu nại ${c.code}`}>
      <div className="spread">
        <span className="eyebrow">{c.code}</span>
        <StatusBadge map={COMPLAINT_STATUS} value={c.status} />
      </div>
      <h2 className="section-title">{c.subject}</h2>
      <p style={{ margin: 0 }}>{c.content}</p>
      <div className="small muted">
        Khách: {c.customer ? `${c.customer.fullName} · ${c.customer.phone}` : '—'}
        {c.invoice ? ` · Hóa đơn ${c.invoice.code}` : ''} · Tiếp nhận: {c.receivedBy?.fullName ?? '—'}
      </div>
      {c.resolution && <div className="alert ok">Kết quả: {c.resolution}</div>}

      {c.status !== 'CLOSED' && (
        <form className="stack subpanel" onSubmit={submit}>
          <div className="form-grid">
            <Field label="Chuyển trạng thái">
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Giữ nguyên ({COMPLAINT_STATUS[c.status].label})</option>
                {next.map((s) => (
                  <option key={s} value={s}>{COMPLAINT_STATUS[s].label}</option>
                ))}
              </select>
            </Field>
            <Field label="Người xử lý">
              <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— Chưa phân công —</option>
                {(emps.data ?? []).filter((e) => e.status === 'ACTIVE').map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Ghi chú xử lý">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Field label={`Kết quả giải quyết${status === 'RESOLVED' ? ' (bắt buộc)' : ''}`}>
            <textarea className="input" rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </Field>
          <ErrorAlert error={act.error} />
          <OkAlert message={act.message} />
          <div><button type="submit" className="btn btn-gold btn-sm" disabled={act.busy}>Cập nhật</button></div>
        </form>
      )}

      <h3 className="step-title">Lịch sử xử lý</h3>
      <ol className="timeline">
        {[...c.history].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((h) => (
          <li key={h.id}>
            <div className="row" style={{ gap: 8 }}>
              <StatusBadge map={COMPLAINT_STATUS} value={h.status} />
              <span className="small muted">{dateTime(h.createdAt)} · {h.actorName}</span>
            </div>
            {h.note && <div className="small">{h.note}</div>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function CreateComplaint({ onClose, onDone }: { onClose: () => void; onDone: (c: Complaint) => void }) {
  const [contact, setContact] = useState<Contact>({ fullName: '', phone: '' });
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !content.trim()) return act.setError('Nhập tiêu đề và nội dung');
    const r = await act.run(() => api<Complaint>('/complaints', { body: { subject: subject.trim(), content: content.trim(), customerId: contact.id } }));
    if (r) onDone(r);
  }
  return (
    <Modal
      title="Tiếp nhận khiếu nại"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button>
          <button type="submit" form="new-cp" className="btn btn-gold" disabled={act.busy}>Lưu</button>
        </>
      }
    >
      <form id="new-cp" className="stack" onSubmit={submit}>
        <CustomerPicker value={contact} onChange={setContact} optional />
        <p className="muted small" style={{ margin: 0 }}>{contact.id ? `Gắn với hồ sơ: ${contact.fullName}` : 'Chọn khách cũ từ kết quả tìm kiếm để gắn khiếu nại vào hồ sơ.'}</p>
        <Field label="Tiêu đề"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Nội dung"><textarea className="input" rows={3} value={content} onChange={(e) => setContent(e.target.value)} /></Field>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}
