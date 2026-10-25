import { FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { date, todayVN, vnd } from '../../lib/format';
import { EXPENSE_CATEGORIES } from '../../lib/labels';
import { monthNow, useAction, useLoad } from '../../lib/util';
import type { Expense } from '../../lib/types';
import { Modal } from '../../components/Overlay';
import { Empty, ErrorAlert, Field, Loading, PageHead } from '../../components/ui';

function monthRange(m: string) {
  const [y, mm] = m.split('-').map(Number);
  const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` };
}

export function ExpensesPage() {
  const [month, setMonth] = useState(monthNow());
  const list = useLoad(() => api<Expense[]>('/expenses', { query: monthRange(month) }), [month]);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const items = list.data ?? [];
  const total = items.reduce((t, x) => t + x.amount, 0);
  const byCat = [...new Set(items.map((x) => x.category))].map((c) => ({ c, t: items.filter((x) => x.category === c).reduce((s, x) => s + x.amount, 0) }));

  return (
    <div className="page stack">
      <PageHead eyebrow={`Tổng chi tháng ${month.slice(5)}/${month.slice(0, 4)}`} title={vnd(total)} sub="Chi phí vận hành" actions={<button type="button" className="btn btn-gold" onClick={() => setEditing('new')}>+ Ghi khoản chi</button>} />
      <div className="spread">
        <label className="row" style={{ gap: 8 }}>
          <span className="small">Tháng</span>
          <input className="input date-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <div className="row small">
          {byCat.map((x) => <span key={x.c} className="chip">{x.c}: {vnd(x.t)}</span>)}
        </div>
      </div>
      <ErrorAlert error={list.error} />
      {list.loading && !list.data && <Loading />}
      {list.data && items.length === 0 && <Empty>Chưa có khoản chi nào trong tháng.</Empty>}
      {items.length > 0 && (
        <div className="card flush table-wrap">
          <table className="table">
            <thead><tr><th>Ngày</th><th>Nhóm</th><th>Nội dung</th><th>Người ghi</th><th className="num">Số tiền</th><th><span className="sr-only">Sửa</span></th></tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td className="small">{date(x.date)}</td>
                  <td><span className="badge neutral">{x.category}</span></td>
                  <td>{x.content}</td>
                  <td className="small">{x.recordedBy?.fullName ?? '—'}</td>
                  <td className="num">{vnd(x.amount)}</td>
                  <td><button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(x)}>Sửa</button></td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={4}><strong>Tổng cộng</strong></td>
                <td className="num"><strong>{vnd(total)}</strong></td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {editing && <ExpenseForm x={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); list.reload(); }} />}
    </div>
  );
}

function ExpenseForm({ x, onClose, onDone }: { x: Expense | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ date: x?.date ?? todayVN(), category: x?.category ?? EXPENSE_CATEGORIES[0], amount: x?.amount ?? 0, content: x?.content ?? '' });
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.content.trim()) return act.setError('Nhập nội dung khoản chi');
    if (await act.run(() => (x ? api(`/expenses/${x.id}`, { method: 'PATCH', body: f }) : api('/expenses', { body: f })))) onDone();
  }
  const cats = EXPENSE_CATEGORIES.includes(f.category) ? EXPENSE_CATEGORIES : [f.category, ...EXPENSE_CATEGORIES];
  return (
    <Modal title={x ? 'Sửa khoản chi' : 'Ghi khoản chi'} eyebrow={x ? 'Thay đổi được ghi nhật ký' : undefined} onClose={onClose} footer={<><button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button><button type="submit" form="ex-form" className="btn btn-gold" disabled={act.busy}>Lưu</button></>}>
      <form id="ex-form" className="stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Ngày"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Nhóm">
            <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Số tiền (₫)"><input className="input" type="number" min={0} step={1000} value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Nội dung"><input className="input" value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></Field>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}
