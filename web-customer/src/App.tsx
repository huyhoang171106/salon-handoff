import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { useTheme } from './lib/theme';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';
import Home from './pages/Home';
import Booking from './pages/Booking';
import Login from './pages/Login';
import Register from './pages/Register';
import Account from './pages/Account';
import ForgotPassword from './pages/ForgotPassword';
import ChangePassword from './pages/ChangePassword';
import Policy from './pages/Policy';
import NotFound from './pages/NotFound';
import Notifier from './components/Notifier';
import { FORCE_CHANGE_PATH } from './pages/Login';

/** Cuộn tới #anchor khi đổi trang, hoặc lên đầu trang. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 60);
      return () => window.clearTimeout(t);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

/** Khách đang dùng mật khẩu tạm: mọi trang đều chuyển về trang đổi mật khẩu. */
function ForcePasswordGuard() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (user?.role === 'CUSTOMER' && user.mustChangePassword && pathname !== '/doi-mat-khau') {
    return <Navigate to={FORCE_CHANGE_PATH} replace />;
  }
  return null;
}

export default function App() {
  const { theme, toggle } = useTheme('light');
  return (
    <div className="app">
      <a className="skip-link" href="#noi-dung">
        Bỏ qua tới nội dung chính
      </a>
      <ScrollManager />
      <ForcePasswordGuard />
      <SiteHeader theme={theme} onToggleTheme={toggle} />
      <main id="noi-dung">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dat-lich" element={<Booking />} />
          <Route path="/dang-nhap" element={<Login />} />
          <Route path="/dang-ky" element={<Register />} />
          <Route path="/tai-khoan" element={<Account />} />
          <Route path="/quen-mat-khau" element={<ForgotPassword />} />
          <Route path="/doi-mat-khau" element={<ChangePassword />} />
          <Route path="/chinh-sach" element={<Policy />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <SiteFooter />
      <Notifier />
    </div>
  );
}
