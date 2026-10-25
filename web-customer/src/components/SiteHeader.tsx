import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ThemeToggle } from '../lib/theme';
import AccountMenu from './AccountMenu';

interface Props {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const NAV = [
  { to: '/#dich-vu', label: 'Dịch vụ & bảng giá' },
  { to: '/#stylist', label: 'Stylist' },
  { to: '/#thanh-vien', label: 'Thành viên' },
  { to: '/#lien-he', label: 'Liên hệ' },
];

export default function SiteHeader({ theme, onToggleTheme }: Props) {
  const { user } = useAuth();
  const isCustomer = user?.role === 'CUSTOMER';
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to="/" className="brand">
          Atelier Luxury Haircare
        </Link>
        <nav aria-label="Điều hướng chính" className="site-nav">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="site-header__actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          {isCustomer ? (
            <AccountMenu />
          ) : (
            <NavLink to="/dang-nhap" className="btn btn-outline">
              Đăng nhập
            </NavLink>
          )}
          <Link to="/dat-lich" className="btn btn-gold">
            Đặt lịch
          </Link>
        </div>
      </div>
    </header>
  );
}
