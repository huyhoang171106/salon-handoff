import { Link } from 'react-router-dom';
import { useSalonData } from '../lib/salon-data';

export default function SiteFooter() {
  const { info } = useSalonData();
  return (
    <footer id="lien-he" className="site-footer">
      <div className="container footer-grid">
        <div className="stack gap-8">
          <div className="brand">{info?.name ?? 'Atelier Luxury Haircare'}</div>
          <div className="muted">{info?.address ?? '—'}</div>
        </div>
        <div className="stack gap-8">
          <div className="label">Giờ mở cửa</div>
          <div>{info ? `Thứ 2 – Chủ nhật · ${info.openTime} – ${info.closeTime}` : '—'}</div>
        </div>
        <div className="stack gap-8">
          <div className="label">Hotline</div>
          <div>{info?.hotline ?? '—'}</div>
        </div>

        <div className="stack gap-8">
          <div className="label">Thông tin</div>
          <Link to="/chinh-sach">Chính sách đặt lịch &amp; bảo mật</Link>
          <a href={import.meta.env.VITE_STAFF_URL ?? 'http://localhost:5174/'}>Cổng nhân viên</a>
        </div>
      </div>
    </footer>
  );
}
