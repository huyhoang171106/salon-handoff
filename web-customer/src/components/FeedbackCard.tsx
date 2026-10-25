import { FormEvent, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { COMPLAINT_STATUS, date } from '../lib/format';
import type { Complaint, InvoiceSummary } from '../lib/types';
import StatusBadge from './StatusBadge';

interface Props {
  invoices: InvoiceSummary[];
  complaints: Complaint[];
  onSent: () => void;
}

/** Gửi phản hồi / khiếu nại và theo dõi trạng thái xử lý. */
export default function FeedbackCard({ invoices, complaints, onSent }: Props) {
  const [invoiceId, setInvoiceId] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!subject.trim() || !content.trim()) return setMsg({ tone: 'bad', text: 'Vui lòng nhập tiêu đề và nội dung phản hồi.' });
    setBusy(true);
    try {
      const c = await api<Complaint>('/complaints', {
        body: { subject: subject.trim(), content: content.trim(), invoiceId: invoiceId ? Number(invoiceId) : undefined },
      });
      setSubject('');
      setContent('');
      setInvoiceId('');
      setMsg({ tone: 'ok', text: `Đã gửi phản hồi ${c.code}. Salon sẽ liên hệ lại với bạn.` });
      onSent();
    } catch (err) {
      setMsg({ tone: 'bad', text: err instanceof ApiError ? err.message : 'Không gửi được phản hồi.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="phan-hoi" className="card stack gap-12" aria-labelledby="fb-title">
      <h2 id="fb-title" className="step-title">
        Gửi phản hồi
      </h2>
      <form className="stack gap-12" onSubmit={submit} noValidate>
        <label className="field">
          <span>Liên quan đến lần sử dụng</span>
          <select className="input" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
            <option value="">Không gắn với hóa đơn</option>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.paidAt ? date(i.paidAt).slice(0, 5) : ''} · {i.items[0]?.description ?? ''} · {i.code}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tiêu đề</span>
          <input className="input" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} placeholder="Ví dụ: Màu nhuộm chưa đúng mong muốn" />
        </label>
        <label className="field">
          <span>Nội dung</span>
          <textarea className="input" rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
        </label>
        {msg && (
          <div className={`alert ${msg.tone}`} role={msg.tone === 'bad' ? 'alert' : 'status'}>
            {msg.text}
          </div>
        )}
        <button type="submit" className="btn btn-dark" disabled={busy}>
          {busy ? 'Đang gửi…' : 'Gửi phản hồi'}
        </button>
      </form>
      {complaints.length > 0 && (
        <ul className="fb-list" aria-label="Phản hồi đã gửi">
          {complaints.map((c) => (
            <li key={c.id} className="fb-item">
              <div className="stack gap-2">
                <span>
                  Phản hồi {c.code} ({date(c.createdAt).slice(0, 5)})
                </span>
                <span className="small muted">{c.subject}</span>
                {c.resolution && <span className="small muted">Kết quả: {c.resolution}</span>}
              </div>
              <StatusBadge status={c.status} map={COMPLAINT_STATUS} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
