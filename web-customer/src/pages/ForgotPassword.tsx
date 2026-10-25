import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useSalonData } from '../lib/salon-data';
import AuthShell from '../components/AuthShell';

const PHONE_RE = /^0\d{9,10}$/;

export default function ForgotPassword() {
  const { info } = useSalonData();
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ phone?: string; fullName?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs: typeof errors = {};
    if (!PHONE_RE.test(phone.replace(/\s/g, ''))) errs.phone = 'Số điện thoại 10–11 số, bắt đầu bằng 0.';
    if (!fullName.trim()) errs.fullName = 'Vui lòng nhập họ và tên đã đăng ký.';
    setErrors(errs);
    if (errs.phone || errs.fullName) return;
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; message: string }>('/auth/forgot-password', {
        body: { phone: phone.replace(/\s/g, ''), fullName: fullName.trim(), note: note.trim() || undefined },
      });
      setDone(r.message);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Không gửi được yêu cầu. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Hỗ trợ tài khoản"
      title="Quên mật khẩu"
      lead="Salon không gửi mật khẩu qua tin nhắn. Gửi yêu cầu, lễ tân sẽ gọi lại số điện thoại của bạn để xác minh và cấp mật khẩu tạm."
      perks={['Gửi yêu cầu với số điện thoại đã đăng ký.', 'Lễ tân gọi lại để xác minh danh tính.', 'Đăng nhập bằng mật khẩu tạm, rồi đặt mật khẩu mới.']}
    >
      {done ? (
        <div className="stack" role="status">
          <div className="label">Đã gửi yêu cầu</div>
          <h2 className="step-title">Salon sẽ liên hệ với bạn</h2>
          <div className="alert ok">{done}</div>
          <p className="muted">
            Cần hỗ trợ ngay? Gọi hotline <strong className="text">{info?.hotline ?? ''}</strong>
            {info ? ` (${info.openTime}–${info.closeTime} hằng ngày)` : ''}.
          </p>
          <Link to="/dang-nhap" className="btn btn-dark">
            Quay lại đăng nhập
          </Link>
        </div>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="fp-phone" className="lbl">
              Số điện thoại đã đăng ký
            </label>
            <input
              id="fp-phone"
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="09xx xxx xxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={errors.phone ? true : undefined}
              aria-describedby={errors.phone ? 'fp-phone-err' : undefined}
            />
            {errors.phone && (
              <span id="fp-phone-err" className="field-error">
                {errors.phone}
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="fp-name" className="lbl">
              Họ và tên
            </label>
            <input
              id="fp-name"
              className="input"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              aria-invalid={errors.fullName ? true : undefined}
              aria-describedby={errors.fullName ? 'fp-name-err' : undefined}
            />
            {errors.fullName && (
              <span id="fp-name-err" className="field-error">
                {errors.fullName}
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="fp-note" className="lbl">
              Ghi chú (không bắt buộc)
            </label>
            <textarea
              id="fp-note"
              className="input"
              rows={3}
              maxLength={500}
              placeholder="Ví dụ: gọi lại sau 17:00"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {formError && (
            <div className="alert bad" role="alert">
              {formError}
            </div>
          )}
          <button type="submit" className="btn btn-gold btn-lg" disabled={busy}>
            {busy ? 'Đang gửi…' : 'Gửi yêu cầu'}
          </button>
          <p className="muted">
            Nhớ ra mật khẩu? <Link to="/dang-nhap">Đăng nhập</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
