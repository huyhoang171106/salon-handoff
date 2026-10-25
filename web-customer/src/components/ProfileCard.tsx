import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { date, todayVN } from '../lib/format';
import type { Customer } from '../lib/types';

function maskPhone(p: string) {
  return p.length >= 7 ? `${p.slice(0, 2)}•• ••• ${p.slice(-3)}` : p;
}

/** Hồ sơ khách: xem và sửa họ tên, ngày sinh (PATCH /customers/me). */
export default function ProfileCard({ customer, onSaved }: { customer: Customer; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(customer.fullName);
  const [birthDate, setBirthDate] = useState(customer.birthDate ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return setMsg({ tone: 'bad', text: 'Họ tên không được để trống.' });
    setBusy(true);
    setMsg(null);
    try {
      await api('/customers/me', { method: 'PATCH', body: { fullName: fullName.trim(), birthDate: birthDate || undefined } });
      setEditing(false);
      setMsg({ tone: 'ok', text: 'Đã cập nhật hồ sơ.' });
      onSaved();
    } catch (err) {
      setMsg({ tone: 'bad', text: err instanceof ApiError ? err.message : 'Không lưu được hồ sơ.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="ho-so" className="card stack gap-12" aria-labelledby="profile-title">
      <h2 id="profile-title" className="step-title">
        Hồ sơ của tôi
      </h2>
      {editing ? (
        <form className="stack gap-12" onSubmit={save}>
          <label className="field">
            <span>Họ và tên</span>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </label>
          <label className="field">
            <span>Ngày sinh</span>
            <input className="input" type="date" max={todayVN()} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </label>
          <div className="row gap-8">
            <button type="submit" className="btn btn-dark btn-sm" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              Hủy
            </button>
          </div>
        </form>
      ) : (
        <dl className="sum-meta sum-meta--plain">
          <div className="sum-row">
            <dt className="muted">Số điện thoại</dt>
            <dd>{maskPhone(customer.phone)}</dd>
          </div>
          <div className="sum-row">
            <dt className="muted">Ngày sinh</dt>
            <dd>{customer.birthDate ? date(customer.birthDate) : 'Chưa cung cấp'}</dd>
          </div>
          <div className="sum-row">
            <dt className="muted">Lần ghé gần nhất</dt>
            <dd>{customer.lastVisitAt ? date(customer.lastVisitAt) : 'Chưa có'}</dd>
          </div>
          <div className="sum-row">
            <dt className="muted">Số lần ghé</dt>
            <dd>{customer.visitCount}</dd>
          </div>
        </dl>
      )}
      {msg && (
        <div className={`alert ${msg.tone}`} role={msg.tone === 'bad' ? 'alert' : 'status'}>
          {msg.text}
        </div>
      )}
      {!editing && (
        <div className="row gap-8">
          <button type="button" className="btn btn-ghost btn-sm btn-inline" onClick={() => setEditing(true)}>
            Cập nhật thông tin
          </button>
          <span className="muted" aria-hidden="true">
            {' '}
            ·{' '}
          </span>
          <Link to="/doi-mat-khau" className="profile-link">
            Đổi mật khẩu
          </Link>
        </div>
      )}
    </section>
  );
}
