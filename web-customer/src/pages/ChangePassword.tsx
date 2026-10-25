import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { setFlash } from '../lib/flash';
import { validatePassword } from '../lib/password';
import { useSalonData } from '../lib/salon-data';
import AuthShell from '../components/AuthShell';
import PasswordField from '../components/PasswordField';

type Field = 'current' | 'next' | 'confirm';

export default function ChangePassword() {
  const { user, loading, changePassword, logout } = useAuth();
  const { info } = useSalonData();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="container page muted">Đang tải…</div>;
  if (user?.role !== 'CUSTOMER') return <Navigate to="/dang-nhap?next=/doi-mat-khau" replace />;
  const forced = !!user.mustChangePassword || params.get('bat-buoc') === '1';

  const set = (k: Field) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs: Partial<Record<Field, string>> = {};
    if (!form.current) errs.current = forced ? 'Vui lòng nhập mật khẩu tạm salon đã cấp.' : 'Vui lòng nhập mật khẩu hiện tại.';
    const pw = validatePassword(form.next);
    if (pw) errs.next = pw;
    else if (form.next === form.current) errs.next = 'Mật khẩu mới phải khác mật khẩu hiện tại.';
    if (!form.confirm) errs.confirm = 'Vui lòng nhập lại mật khẩu mới.';
    else if (form.confirm !== form.next) errs.confirm = 'Mật khẩu nhập lại không khớp.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await changePassword(form.current, form.next);
      setFlash('password-changed');
      navigate('/tai-khoan', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Không đổi được mật khẩu. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow={forced ? 'Bắt buộc đổi mật khẩu' : 'Bảo mật tài khoản'}
      title="Đổi mật khẩu"
      lead={
        forced
          ? 'Bạn đang dùng mật khẩu tạm do salon cấp. Vui lòng đặt mật khẩu mới của riêng bạn để tiếp tục sử dụng tài khoản.'
          : 'Đặt mật khẩu mới cho tài khoản thành viên. Bạn vẫn đăng nhập trên thiết bị này sau khi đổi.'
      }
      perks={
        forced
          ? ['Mật khẩu tạm chỉ dùng được một lần để đăng nhập.', 'Không chia sẻ mật khẩu với bất kỳ ai, kể cả nhân viên salon.']
          : ['Không dùng lại mật khẩu của tài khoản khác.', 'Salon không bao giờ hỏi mật khẩu của bạn qua điện thoại.']
      }
    >
      <form className="stack" onSubmit={submit} noValidate>
        {forced && (
          <div className="alert warn" role="note">
            <strong className="text">Tài khoản {user.username ?? user.name}:</strong> cần đổi mật khẩu trước khi xem lịch hẹn hoặc đặt lịch.
          </div>
        )}
        <PasswordField
          label={forced ? 'Mật khẩu tạm' : 'Mật khẩu hiện tại'}
          value={form.current}
          onChange={set('current')}
          autoComplete="current-password"
          error={errors.current}
        />
        <PasswordField label="Mật khẩu mới" value={form.next} onChange={set('next')} autoComplete="new-password" error={errors.next} showRules />
        <PasswordField label="Nhập lại mật khẩu mới" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" error={errors.confirm} />
        {formError && (
          <div className="alert bad" role="alert">
            {formError}
          </div>
        )}
        <button type="submit" className="btn btn-gold btn-lg" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
        </button>
        {forced ? (
          <p className="small muted">
            Không nhớ mật khẩu tạm? Gọi hotline <strong className="text">{info?.hotline ?? ''}</strong> hoặc{' '}
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-inline"
              onClick={() => {
                navigate('/dang-nhap');
                window.setTimeout(logout, 0);
              }}
            >
              đăng xuất
            </button>
            .
          </p>
        ) : (
          <p className="muted">
            <Link to="/tai-khoan">Quay lại tài khoản</Link>
          </p>
        )}
      </form>
    </AuthShell>
  );
}
