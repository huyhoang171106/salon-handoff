import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { homeOf } from '../lib/nav';
import { ThemeToggle } from '../lib/theme';
import { errMsg } from '../lib/util';
import { ErrorAlert } from '../components/ui';

const ROLES = [
  { name: 'Chủ salon / Quản lý', tag: 'Toàn quyền', text: 'Doanh thu toàn salon, nhân viên & ca, giá dịch vụ, hoa hồng, kho, khuyến mãi, thiết bị, chi phí, báo cáo, nhật ký thao tác.' },
  { name: 'Lễ tân', tag: 'Điều phối', text: 'Lịch hôm nay theo stylist, đặt lịch, walk-in, check-in, no-show, lập hóa đơn & thanh toán, khiếu nại, nhập kho.' },
  { name: 'Stylist / Thợ phụ', tag: 'Cá nhân', text: 'Lịch & ca cá nhân, phiên phục vụ đang làm, ghi chú tóc/công thức màu của khách, hoa hồng của tôi.' },
];

export function LoginPage({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user && user.role !== 'CUSTOMER') {
    return <Navigate to={user.mustChangePassword ? '/doi-mat-khau' : homeOf(user.role)} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Nhập mã nhân viên và mật khẩu');
      return;
    }
    setBusy(true);
    try {
      const u = await login(username.trim(), password);
      if (u.role === 'CUSTOMER') {
        logout();
        setError('Tài khoản khách hàng không dùng được cổng nhân viên. Vui lòng đăng nhập trên trang dành cho khách.');
        return;
      }
      navigate(u.mustChangePassword ? '/doi-mat-khau' : homeOf(u.role), { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <header className="login-header">
        <div className="brand">Atelier · Cổng nhân viên</div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>
      <main className="login-main">
        <form className="sheet login-form stack" onSubmit={submit} aria-labelledby="login-title" noValidate>
          <div className="stack" style={{ gap: 6 }}>
            <h1 id="login-title">Đăng nhập</h1>
            <p className="muted" style={{ margin: 0 }}>
              Giao diện sau khi đăng nhập thay đổi theo vai trò của tài khoản.
            </p>
          </div>
          <label className="field">
            <span>Mã nhân viên hoặc tên đăng nhập</span>
            <input className="input" name="username" autoComplete="username" placeholder="ST-001" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <input className="input" name="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <ErrorAlert error={error} />
          <button type="submit" className="btn btn-gold" disabled={busy}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
          <p className="muted small" style={{ margin: 0 }}>
            Quên mật khẩu? <Link to="/quen-mat-khau">Xem hướng dẫn</Link> hoặc liên hệ chủ salon để được cấp lại.
          </p>
        </form>
        <section className="login-roles stack" aria-label="Vai trò trong hệ thống">
          <div className="eyebrow">Mỗi vai trò thấy một giao diện riêng</div>
          {ROLES.map((r) => (
            <div key={r.name} className="card tight stack" style={{ gap: 6 }}>
              <div className="spread">
                <strong className="display">{r.name}</strong>
                <span className="badge neutral">{r.tag}</span>
              </div>
              <span className="muted small">{r.text}</span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
