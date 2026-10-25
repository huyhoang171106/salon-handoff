import { Link, useLocation } from 'react-router-dom';

export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <section className="container page notfound stack gap-20" aria-labelledby="nf-title">
      <div className="label">Lỗi 404</div>
      <h1 id="nf-title">Không tìm thấy trang này</h1>
      <p className="muted lead">
        Đường dẫn <code className="code">{pathname}</code> không tồn tại hoặc đã được đổi. Bạn có thể quay lại trang chủ hoặc đặt lịch ngay.
      </p>
      <div className="row">
        <Link to="/" className="btn btn-dark btn-lg">
          Về trang chủ
        </Link>
        <Link to="/dat-lich" className="btn btn-gold btn-lg">
          Đặt lịch
        </Link>
      </div>
    </section>
  );
}
