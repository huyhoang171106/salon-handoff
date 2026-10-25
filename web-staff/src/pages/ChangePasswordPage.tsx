import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { homeOf } from '../lib/nav';
import { PASSWORD_HINT, passwordError } from '../lib/password';
import { errMsg } from '../lib/util';
import { ErrorAlert, PageHead } from '../components/ui';
import { PasswordInput } from '../components/PasswordInput';

export function ChangePasswordPage() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const forced = !!user?.mustChangePassword;
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!oldPw) return setError(forced ? 'Nhập mật khẩu tạm được cấp' : 'Nhập mật khẩu hiện tại');
    const pe = passwordError(newPw);
    if (pe) return setError(pe);
    if (newPw !== confirm) return setError('Mật khẩu nhập lại không khớp');
    if (newPw === oldPw) return setError('Mật khẩu mới phải khác mật khẩu cũ');
    setBusy(true);
    try {
      const u = await changePassword(oldPw, newPw);
      navigate(homeOf(u.role), { replace: true, state: { flash: 'Đã đổi mật khẩu' } });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack narrow-page">
      <PageHead eyebrow={forced ? 'Bắt buộc trước khi tiếp tục' : 'Bảo mật tài khoản'} title="Đổi mật khẩu" />
      {forced && (
        <div className="alert warn" role="alert">
          Tài khoản mới / mật khẩu tạm: bạn cần đặt mật khẩu riêng trước khi sử dụng hệ thống.
        </div>
      )}
      <form className="card stack" onSubmit={submit} noValidate>
        {user?.username && <p className="small muted" style={{ margin: 0 }}>Tên đăng nhập: <strong>{user.username}</strong></p>}
        <PasswordInput label={forced ? 'Mật khẩu tạm được cấp' : 'Mật khẩu hiện tại'} value={oldPw} onChange={setOldPw} autoComplete="current-password" />
        <PasswordInput label="Mật khẩu mới" value={newPw} onChange={setNewPw} autoComplete="new-password" hint={PASSWORD_HINT} />
        <PasswordInput label="Nhập lại mật khẩu mới" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <ErrorAlert error={error} />
        <div className="row">
          <button type="submit" className="btn btn-gold" disabled={busy}>{busy ? 'Đang lưu…' : 'Đổi mật khẩu'}</button>
          {!forced && <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Hủy</button>}
        </div>
      </form>
    </div>
  );
}
