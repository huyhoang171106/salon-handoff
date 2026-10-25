import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import AuthShell from '../components/AuthShell';
import PasswordField from '../components/PasswordField';

/** Chỉ cho phép chuyển hướng nội bộ. */
export function safeNext(v: string | null) {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/tai-khoan';
}

export const FORCE_CHANGE_PATH = '/doi-mat-khau?bat-buoc=1';

export default function Login() {
  const { user, login, logout } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const nextParam = params.get('next');
  const next = safeNext(nextParam);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ phone?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  if (user?.role === 'CUSTOMER') return <Navigate to={user.mustChangePassword ? FORCE_CHANGE_PATH : next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!phone.trim()) errs.phone = 'Vui lòng nhập số điện thoại.';
    if (!password) errs.password = 'Vui lòng nhập mật khẩu.';
    setErrors(errs);
    if (errs.phone || errs.password) return;
    setBusy(true);
    try {
      const u = await login(phone.replace(/\s/g, ''), password);
      if (u.role !== 'CUSTOMER') {
        logout();
        setErrors({ form: 'Tài khoản nhân viên vui lòng đăng nhập tại cổng nhân viên.' });
        return;
      }
      navigate(u.mustChangePassword ? FORCE_CHANGE_PATH : next, { replace: true });
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : 'Không đăng nhập được. Vui lòng thử lại.' });
    } finally {
      setBusy(false);
    }
  }

  const qs = nextParam ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <AuthShell eyebrow="Thành viên Atelier" title="Đăng nhập" lead="Dùng số điện thoại đã đăng ký để xem và quản lý lịch hẹn, lịch sử dịch vụ.">
      <form className="stack" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="login-phone" className="lbl">
            Số điện thoại
          </label>
          <input
            id="login-phone"
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            placeholder="09xx xxx xxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? 'login-phone-err' : undefined}
          />
          {errors.phone && (
            <span id="login-phone-err" className="field-error">
              {errors.phone}
            </span>
          )}
        </div>
        <PasswordField label="Mật khẩu" value={password} onChange={setPassword} autoComplete="current-password" error={errors.password} />
        <div className="spread small-14">
          <span />
          <Link to="/quen-mat-khau">Quên mật khẩu?</Link>
        </div>
        {errors.form && (
          <div className="alert bad" role="alert">
            {errors.form}
          </div>
        )}
        <button type="submit" className="btn btn-gold btn-lg" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        <p className="muted">
          Chưa có tài khoản? <Link to={`/dang-ky${qs}`}>Đăng ký thành viên</Link>
        </p>
        <p className="small muted">
          Không cần tài khoản để đặt lịch — <Link to="/dat-lich">đặt lịch ngay</Link>.
        </p>
      </form>
    </AuthShell>
  );
}
