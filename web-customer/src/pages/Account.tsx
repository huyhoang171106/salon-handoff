import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSalonData } from '../lib/salon-data';
import type { Appointment, Complaint, CustomerDetail } from '../lib/types';
import { Flash, takeFlash } from '../lib/flash';
import WelcomeBanner from '../components/WelcomeBanner';
import AppointmentCard from '../components/AppointmentCard';
import HistoryTable from '../components/HistoryTable';
import ProfileCard from '../components/ProfileCard';
import FeedbackCard from '../components/FeedbackCard';

const INACTIVE = ['CANCELLED', 'NO_SHOW', 'COMPLETED'];

export default function Account() {
  const { user, loading: authLoading, logout } = useAuth();
  const { info } = useSalonData();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [appts, setAppts] = useState<Appointment[] | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const isCustomer = user?.role === 'CUSTOMER';
  const [flash, setFlashState] = useState<Flash | null>(null);

  // Thông báo một lần sau khi đăng ký / đổi mật khẩu
  useEffect(() => {
    const f = takeFlash();
    if (f) setFlashState(f);
  }, []);

  const loadAppts = useCallback(() => {
    api<Appointment[]>('/appointments/mine')
      .then(setAppts)
      .catch((e: ApiError) => setError(e.message));
  }, []);
  const loadDetail = useCallback(() => {
    api<CustomerDetail>('/customers/me')
      .then(setDetail)
      .catch((e: ApiError) => setError(e.message));
  }, []);
  const loadComplaints = useCallback(() => {
    api<Complaint[]>('/complaints/mine')
      .then(setComplaints)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isCustomer) return;
    loadAppts();
    loadDetail();
    loadComplaints();
  }, [isCustomer, loadAppts, loadDetail, loadComplaints]);

  if (authLoading) return <div className="container page muted">Đang tải…</div>;
  if (!isCustomer) return <Navigate to="/dang-nhap?next=/tai-khoan" replace />;

  const now = Date.now();
  const upcoming = (appts ?? [])
    .filter((a) => new Date(a.endAt).getTime() > now && !INACTIVE.includes(a.status))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const customer = detail?.customer;
  const lockH = info?.cancelLockHours ?? 2;
  const hotline = info?.hotline ?? '';

  return (
    <div className="container page stack gap-32">
      <nav aria-label="Mục tài khoản" className="sub-nav">
        <a href="#lich-hen">Lịch hẹn</a>
        <a href="#lich-su">Lịch sử</a>
        <a href="#ho-so">Hồ sơ</a>
        <a href="#phan-hoi">Phản hồi</a>
      </nav>

      <div className="spread align-end">
        <div className="stack gap-8">
          <div className="row gap-8">
            <span className="badge gold-soft">{customer?.isMember === false ? 'Khách hàng' : 'Thành viên'}</span>
            {customer && <span className="small-13 muted">Mã KH: {customer.code}</span>}
          </div>
          <h1>Xin chào, {customer?.fullName ?? user?.name}</h1>
        </div>
        <div className="row gap-12">
          {customer && !customer.firstVisitPromoUsed && (
            <div className="promo-note">
              <span className="dot dot--gold" aria-hidden="true" />
              <span>Ưu đãi lần đầu cho thành viên — tự áp dụng khi lập hóa đơn</span>
            </div>
          )}
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              navigate('/');
              // Đăng xuất sau khi rời trang cần đăng nhập, tránh bị chuyển sang /dang-nhap
              window.setTimeout(logout, 0);
            }}
          >
            Đăng xuất
          </button>
        </div>
      </div>

      {flash && <WelcomeBanner kind={flash} lockHours={info?.cancelLockHours ?? 2} onClose={() => setFlashState(null)} />}

      {error && (
        <div className="alert bad" role="alert">
          {error}
        </div>
      )}

      <section id="lich-hen" className="stack" aria-labelledby="upcoming-title">
        <div className="spread">
          <h2 id="upcoming-title">Lịch hẹn sắp tới</h2>
          <Link to="/dat-lich" className="btn btn-gold">
            Đặt lịch mới
          </Link>
        </div>
        {appts === null ? (
          <p className="muted">Đang tải lịch hẹn…</p>
        ) : upcoming.length === 0 ? (
          <div className="card stack gap-12">
            <p className="muted">Bạn chưa có lịch hẹn sắp tới.</p>
            <div>
              <Link to="/dat-lich" className="btn btn-dark">
                Đặt lịch ngay
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-24" style={{ ['--min' as string]: '320px' }}>
            {upcoming.map((a) => (
              <AppointmentCard key={a.id} appt={a} lockHours={lockH} hotline={hotline} onChanged={loadAppts} />
            ))}
          </div>
        )}
      </section>

      <div className="split">
        <HistoryTable invoices={detail?.invoices ?? null} />
        <div className="split__side stack gap-24">
          {customer && <ProfileCard customer={customer} onSaved={loadDetail} />}
          <FeedbackCard invoices={detail?.invoices ?? []} complaints={complaints} onSent={loadComplaints} />
        </div>
      </div>
    </div>
  );
}
