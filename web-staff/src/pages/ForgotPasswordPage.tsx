import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLoad } from '../lib/util';
import { ThemeToggle } from '../lib/theme';
import { ErrorAlert } from '../components/ui';

interface SalonInfo { name: string; hotline: string; address: string }

/** Nhân viên quên mật khẩu: không tự cấp lại, liên hệ chủ salon. */
export function ForgotPasswordPage({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  const info = useLoad(() => api<SalonInfo>('/salon-info'));
  return (
    <div className="login-page">
      <header className="login-header">
        <div className="brand">Atelier · Cổng nhân viên</div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>
      <main className="login-main single">
        <section className="sheet login-form stack" aria-labelledby="fp-title">
          <span className="eyebrow">Quên mật khẩu</span>
          <h1 id="fp-title">Liên hệ chủ salon để được cấp lại mật khẩu tạm</h1>
          <p className="muted" style={{ margin: 0 }}>
            Vì lý do bảo mật, tài khoản nhân viên không tự đặt lại mật khẩu qua mạng. Chủ salon sẽ xác minh và cấp mật khẩu tạm; bạn đổi mật khẩu mới ngay ở lần đăng nhập đầu.
          </p>
          <ErrorAlert error={info.error} />
          <dl className="cred-box">
            <div><dt>Salon</dt><dd>{info.data?.name ?? '…'}</dd></div>
            <div><dt>Hotline</dt><dd>{info.data?.hotline ?? '…'}</dd></div>
            <div><dt>Địa chỉ</dt><dd>{info.data?.address ?? '…'}</dd></div>
          </dl>
          <p className="small muted" style={{ margin: 0 }}>Khách hàng quên mật khẩu vui lòng dùng chức năng trên trang dành cho khách.</p>
          <div><Link className="btn btn-outline" to="/dang-nhap">‹ Quay lại đăng nhập</Link></div>
        </section>
      </main>
    </div>
  );
}
