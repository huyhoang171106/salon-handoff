import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { todayVN } from '../lib/format';
import { setFlash } from '../lib/flash';
import { PASSWORD_HINT, validatePassword } from '../lib/password';
import AuthShell from '../components/AuthShell';
import PasswordField from '../components/PasswordField';

const PHONE_RE = /^0\d{9,10}$/;
type Field = 'fullName' | 'phone' | 'password' | 'confirm' | 'consent';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', phone: '', password: '', confirm: '', birthDate: '' });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<{ text: string; conflict?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  if (user?.role === 'CUSTOMER') return <Navigate to="/tai-khoan" replace />;

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k as Field]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function validate() {
    const e: Partial<Record<Field, string>> = {};
    if (!form.fullName.trim()) e.fullName = 'Vui lòng nhập họ và tên.';
    if (!PHONE_RE.test(form.phone.replace(/\s/g, ''))) e.phone = 'Số điện thoại 10–11 số, bắt đầu bằng 0.';
    const pw = validatePassword(form.password);
    if (pw) e.password = pw;
    if (!form.confirm) e.confirm = 'Vui lòng nhập lại mật khẩu.';
    else if (form.confirm !== form.password) e.confirm = 'Mật khẩu nhập lại không khớp.';
    if (!consent) e.consent = 'Vui lòng đồng ý với chính sách để đăng ký.';
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setBusy(true);
    try {
      await register({
        fullName: form.fullName.trim(),
        phone: form.phone.replace(/\s/g, ''),
        password: form.password,
        birthDate: form.birthDate || undefined,
      });
      setFlash('welcome');
      navigate('/tai-khoan', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setFormError({ text: err.message, conflict: true });
      else setFormError({ text: err instanceof ApiError ? err.message : 'Không đăng ký được. Vui lòng thử lại.' });
    } finally {
      setBusy(false);
    }
  }

  const err = (k: Field) =>
    errors[k] ? (
      <span id={`reg-${k}-err`} className="field-error">
        {errors[k]}
      </span>
    ) : null;
  const aria = (k: Field) => ({ 'aria-invalid': errors[k] ? true : undefined, 'aria-describedby': errors[k] ? `reg-${k}-err` : undefined });

  return (
    <AuthShell
      eyebrow="Thành viên Atelier"
      title="Đăng ký thành viên"
      lead="Đăng ký bằng số điện thoại — nếu bạn từng đặt lịch với số này, lịch sử sẽ được gắn vào tài khoản."
    >
      <form className="stack" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="reg-fullName" className="lbl">
            Họ và tên
          </label>
          <input id="reg-fullName" className="input" autoComplete="name" value={form.fullName} onChange={(e) => set('fullName')(e.target.value)} {...aria('fullName')} />
          {err('fullName')}
        </div>
        <div className="field">
          <label htmlFor="reg-phone" className="lbl">
            Số điện thoại (dùng để đăng nhập)
          </label>
          <input
            id="reg-phone"
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="09xx xxx xxx"
            value={form.phone}
            onChange={(e) => set('phone')(e.target.value)}
            {...aria('phone')}
          />
          {err('phone')}
        </div>
        <PasswordField label="Mật khẩu" value={form.password} onChange={set('password')} autoComplete="new-password" error={errors.password} showRules />
        <PasswordField label="Nhập lại mật khẩu" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" error={errors.confirm} />
        <div className="field">
          <label htmlFor="reg-birth" className="lbl">
            Ngày sinh (không bắt buộc)
          </label>
          <input id="reg-birth" className="input" type="date" max={todayVN()} value={form.birthDate} onChange={(e) => set('birthDate')(e.target.value)} />
        </div>
        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setErrors((x) => ({ ...x, consent: undefined }));
              }}
              {...aria('consent')}
            />
            <span className="muted">
              Tôi đã đọc và đồng ý với{' '}
              <Link to="/chinh-sach" target="_blank" rel="noopener">
                chính sách đặt lịch &amp; bảo mật dữ liệu
              </Link>
              .
            </span>
          </label>
          {err('consent')}
        </div>
        {formError && (
          <div className="alert bad" role="alert">
            {formError.conflict ? (
              <>
                Số điện thoại này đã có tài khoản. Bạn có thể <Link to={`/dang-nhap`}>đăng nhập</Link> hoặc{' '}
                <Link to="/quen-mat-khau">lấy lại mật khẩu</Link>.
              </>
            ) : (
              formError.text
            )}
          </div>
        )}
        <button type="submit" className="btn btn-gold btn-lg" disabled={busy}>
          {busy ? 'Đang tạo tài khoản…' : 'Đăng ký'}
        </button>
        <p className="muted">
          Đã có tài khoản? <Link to="/dang-nhap">Đăng nhập</Link>
        </p>
        <p className="sr-only">{PASSWORD_HINT}</p>
      </form>
    </AuthShell>
  );
}
