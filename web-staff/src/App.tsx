import { ReactElement, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Role, useAuth } from './lib/auth';
import { useTheme } from './lib/theme';
import { homeOf } from './lib/nav';
import { StaffLayout } from './layout/StaffLayout';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ProfilePage } from './pages/ProfilePage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { Forbidden, NotFound } from './pages/ErrorPages';
import { ConsultationsPage } from './pages/ConsultationsPage';
import { Loading } from './components/ui';
import { TodayBoard } from './pages/reception/TodayBoard';
import { SessionsPage } from './pages/reception/SessionsPage';
import { InvoicesPage } from './pages/reception/InvoicesPage';
import { InvoiceDetail } from './pages/reception/InvoiceDetail';
import { CustomersPage } from './pages/reception/CustomersPage';
import { ComplaintsPage } from './pages/reception/ComplaintsPage';
import { InventoryPage } from './pages/reception/InventoryPage';
import { PasswordRequestsPage } from './pages/reception/PasswordRequestsPage';
import { Dashboard } from './pages/owner/Dashboard';
import { EmployeesPage } from './pages/owner/EmployeesPage';
import { NewEmployeePage } from './pages/owner/NewEmployeePage';
import { AccountsPage } from './pages/owner/AccountsPage';
import { ShiftsPage } from './pages/owner/ShiftsPage';
import { ServicesPage } from './pages/owner/ServicesPage';
import { CommissionsPage } from './pages/owner/CommissionsPage';
import { PromotionsPage } from './pages/owner/PromotionsPage';
import { EquipmentPage } from './pages/owner/EquipmentPage';
import { ExpensesPage } from './pages/owner/ExpensesPage';
import { AuditPage } from './pages/owner/AuditPage';
import { MyDay } from './pages/stylist/MyDay';
import { MyShifts } from './pages/stylist/MyShifts';
import { MyCommission } from './pages/stylist/MyCommission';

const ALL_STAFF: Role[] = ['OWNER', 'RECEPTIONIST', 'STYLIST', 'ASSISTANT'];
const DESK: Role[] = ['OWNER', 'RECEPTIONIST'];
const OWNER: Role[] = ['OWNER'];
const CRAFT: Role[] = ['STYLIST', 'ASSISTANT'];
const CONSULT: Role[] = ['OWNER', 'RECEPTIONIST', 'STYLIST'];

/** Bảo vệ route: chưa đăng nhập → /dang-nhap; sai vai trò → 403 Forbidden. */
function Guard({ roles, children }: { roles: Role[]; children: ReactElement }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/dang-nhap" replace />;
  if (!roles.includes(user.role)) return <Forbidden />;
  return children;
}

/** Chuyển hướng bắt buộc khi nhân viên cần đổi mật khẩu tạm. */
function ForcePasswordGuard() {
  const { user } = useAuth();
  const loc = useLocation();
  if (user && user.mustChangePassword && loc.pathname !== '/doi-mat-khau') {
    return <Navigate to="/doi-mat-khau" replace />;
  }
  return null;
}

const ROUTES: { path: string; roles: Role[]; el: ReactElement; title: string }[] = [
  { path: '/lich-hom-nay', roles: DESK, el: <TodayBoard />, title: 'Lịch hôm nay' },
  { path: '/phuc-vu', roles: DESK, el: <SessionsPage />, title: 'Đang phục vụ' },
  { path: '/hoa-don', roles: DESK, el: <InvoicesPage />, title: 'Hóa đơn' },
  { path: '/hoa-don/:id', roles: DESK, el: <InvoiceDetail />, title: 'Hóa đơn' },
  { path: '/khach-hang', roles: DESK, el: <CustomersPage />, title: 'Khách hàng' },
  { path: '/tu-van', roles: CONSULT, el: <ConsultationsPage />, title: 'Tư vấn' },
  { path: '/khieu-nai', roles: DESK, el: <ComplaintsPage />, title: 'Khiếu nại' },
  { path: '/kho', roles: DESK, el: <InventoryPage />, title: 'Kho' },
  { path: '/yeu-cau-mat-khau', roles: DESK, el: <PasswordRequestsPage />, title: 'Yêu cầu mật khẩu' },
  { path: '/tong-quan', roles: OWNER, el: <Dashboard />, title: 'Tổng quan' },
  { path: '/nhan-vien', roles: OWNER, el: <EmployeesPage />, title: 'Nhân viên' },
  { path: '/nhan-vien/tao-moi', roles: OWNER, el: <NewEmployeePage />, title: 'Thêm nhân viên' },
  { path: '/tai-khoan', roles: OWNER, el: <AccountsPage />, title: 'Tài khoản nhân viên' },
  { path: '/ca-lam', roles: OWNER, el: <ShiftsPage />, title: 'Ca làm việc' },
  { path: '/dich-vu', roles: OWNER, el: <ServicesPage />, title: 'Dịch vụ & giá' },
  { path: '/hoa-hong', roles: OWNER, el: <CommissionsPage />, title: 'Hoa hồng' },
  { path: '/khuyen-mai', roles: OWNER, el: <PromotionsPage />, title: 'Khuyến mãi' },
  { path: '/thiet-bi', roles: OWNER, el: <EquipmentPage />, title: 'Thiết bị' },
  { path: '/chi-phi', roles: OWNER, el: <ExpensesPage />, title: 'Chi phí vận hành' },
  { path: '/nhat-ky', roles: OWNER, el: <AuditPage />, title: 'Nhật ký thao tác' },
  { path: '/ngay-cua-toi', roles: CRAFT, el: <MyDay />, title: 'Ngày của tôi' },
  { path: '/ca-cua-toi', roles: CRAFT, el: <MyShifts />, title: 'Ca làm việc' },
  { path: '/hoa-hong-cua-toi', roles: CRAFT, el: <MyCommission />, title: 'Hoa hồng của tôi' },
  { path: '/ho-so', roles: ALL_STAFF, el: <ProfilePage />, title: 'Hồ sơ của tôi' },
  { path: '/doi-mat-khau', roles: ALL_STAFF, el: <ChangePasswordPage />, title: 'Đổi mật khẩu' },
];

function TitleSync() {
  const loc = useLocation();
  useEffect(() => {
    if (loc.pathname === '/dang-nhap') {
      document.title = 'Đăng nhập · Atelier nhân viên';
      return;
    }
    if (loc.pathname === '/quen-mat-khau') {
      document.title = 'Quên mật khẩu · Atelier nhân viên';
      return;
    }
    const r = ROUTES.find((x) => (x.path.includes(':') ? loc.pathname.startsWith(x.path.split('/:')[0] + '/') : x.path === loc.pathname));
    document.title = `${r?.title ?? 'Không tìm thấy trang'} · Atelier nhân viên`;
  }, [loc.pathname]);
  return null;
}

export function App() {
  const { user, loading, logout } = useAuth();
  const { theme, toggle } = useTheme('dark');

  useEffect(() => {
    if (user?.role === 'CUSTOMER') logout();
  }, [user, logout]);

  if (loading) {
    return (
      <div className="center-screen">
        <Loading label="Đang kiểm tra phiên đăng nhập…" />
      </div>
    );
  }

  return (
    <>
      <TitleSync />
      <ForcePasswordGuard />
      <Routes>
        <Route path="/dang-nhap" element={<LoginPage theme={theme} onToggleTheme={toggle} />} />
        <Route path="/quen-mat-khau" element={<ForgotPasswordPage theme={theme} onToggleTheme={toggle} />} />
        <Route element={user ? <StaffLayout theme={theme} onToggleTheme={toggle} /> : <Navigate to="/dang-nhap" replace />}>
          {ROUTES.map((r) => (
            <Route key={r.path} path={r.path} element={<Guard roles={r.roles}>{r.el}</Guard>} />
          ))}
          <Route path="/403" element={<Forbidden />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
