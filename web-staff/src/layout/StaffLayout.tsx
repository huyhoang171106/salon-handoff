import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { NAV } from '../lib/nav';
import { ROLE_LABEL } from '../lib/labels';
import { ThemeToggle } from '../lib/theme';

interface Props {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

/** Khung chính: thanh điều hướng bên trái (xếp lên trên khi màn hình hẹp) + vùng nội dung. */
export function StaffLayout({ theme, onToggleTheme }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const items = user.mustChangePassword
    ? [{ to: '/doi-mat-khau', label: 'Đổi mật khẩu', roles: [user.role] }]
    : NAV.filter((n) => n.roles.includes(user.role));
  const craft = user.role === 'STYLIST' || user.role === 'ASSISTANT';

  return (
    <div className="shell">
      <a className="skip-link" href="#noi-dung">
        Bỏ qua menu
      </a>
      <nav className="rail" aria-label={`Menu ${ROLE_LABEL[user.role].toLowerCase()}`}>
        <div className="rail-brand">
          <div className="brand">Atelier</div>
          <NavLink to="/ho-so" className="small" style={{ color: 'inherit', textDecoration: 'none' }} title="Hồ sơ của tôi">
            <span className="muted">{user.name} · {ROLE_LABEL[user.role]}</span>
          </NavLink>
        </div>
        <div className="rail-menu">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} className="rail-link">
              {n.label}
            </NavLink>
          ))}
        </div>
        {user.mustChangePassword && <p className="muted small rail-note" style={{ color: 'var(--gold)' }}>Bạn cần đổi mật khẩu trước khi thao tác các trang khác.</p>}
        {!user.mustChangePassword && craft && <p className="muted small rail-note">Bạn chỉ thấy lịch, khách và hoa hồng của chính mình.</p>}
        <div className="rail-foot">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              logout();
              navigate('/dang-nhap', { replace: true });
            }}
          >
            Đăng xuất
          </button>
        </div>
      </nav>
      <main id="noi-dung" className="content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
