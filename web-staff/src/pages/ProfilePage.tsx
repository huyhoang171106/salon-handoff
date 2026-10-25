import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { EMPLOYEE_STATUS, POSITION_LABEL } from '../lib/labels';
import { useAction, useLoad } from '../lib/util';
import type { Employee } from '../lib/types';
import { ErrorAlert, Field, Loading, OkAlert, PageHead, StatusBadge } from '../components/ui';

type Me = Employee & { username: string | null; lastLoginAt: string | null };

export function ProfilePage() {
  const me = useLoad(() => api<Me>('/employees/me'));
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const act = useAction();
  useEffect(() => {
    if (me.data) {
      setPhone(me.data.phone ?? '');
      setBio(me.data.bio ?? '');
    }
  }, [me.data]);
  if (me.loading && !me.data) return <div className="page"><Loading /></div>;
  if (!me.data) return <div className="page"><ErrorAlert error={me.error} /></div>;
  const e = me.data;

  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (phone && !/^0\d{9,10}$/.test(phone.trim())) return act.setError('Số điện thoại không hợp lệ');
    const r = await act.run(() => api<Me>('/employees/me', { method: 'PATCH', body: { phone: phone.trim(), bio } }), 'Đã lưu hồ sơ');
    if (r) me.setData(r);
  }

  return (
    <div className="page stack">
      <PageHead eyebrow={e.code} title="Hồ sơ của tôi" actions={<Link className="btn btn-outline" to="/doi-mat-khau">Đổi mật khẩu</Link>} />
      <div className="two-col">
        <form className="card stack" onSubmit={save}>
          <h2 className="section-title">{e.fullName}</h2>
          <div className="form-grid">
            <Field label="Số điện thoại"><input className="input" inputMode="tel" value={phone} onChange={(x) => setPhone(x.target.value)} /></Field>
          </div>
          <Field label="Giới thiệu (hiển thị trên website nếu bật hồ sơ công khai)">
            <textarea className="input" rows={4} value={bio} onChange={(x) => setBio(x.target.value)} />
          </Field>
          <ErrorAlert error={act.error} />
          <OkAlert message={act.message} />
          <div><button type="submit" className="btn btn-gold btn-sm" disabled={act.busy}>Lưu thay đổi</button></div>
        </form>
        <section className="card stack" aria-label="Thông tin do chủ salon quản lý">
          <h2 className="section-title">Thông tin tài khoản</h2>
          <dl className="info-list">
            <div><dt>Mã nhân viên</dt><dd>{e.code}</dd></div>
            <div><dt>Chức danh</dt><dd>{POSITION_LABEL[e.position]}</dd></div>
            <div><dt>Cấp bậc</dt><dd>{e.level ?? '—'}</dd></div>
            <div><dt>Trạng thái</dt><dd><StatusBadge map={EMPLOYEE_STATUS} value={e.status} /></dd></div>
            <div><dt>Tên đăng nhập</dt><dd>{e.username ?? '—'}</dd></div>
            <div><dt>Đăng nhập gần nhất</dt><dd>{e.lastLoginAt ? dateTime(e.lastLoginAt) : '—'}</dd></div>
          </dl>
          {(e.skills ?? []).length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <span className="eyebrow">Chuyên môn ({e.skills!.length})</span>
              <div className="row" style={{ gap: 6 }}>{e.skills!.map((s) => <span key={s.id} className="chip">{s.name}</span>)}</div>
            </div>
          )}
          <p className="muted small" style={{ margin: 0 }}>Chức danh, cấp bậc và chuyên môn do chủ salon cập nhật.</p>
        </section>
      </div>
    </div>
  );
}
