import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { homeOf } from '../lib/nav';

function ErrorView({ code, title, text }: { code: string; title: string; text: string }) {
  const { user } = useAuth();
  const home = user ? homeOf(user.role) : '/dang-nhap';
  return (
    <div className="page error-page">
      <div className="card stack error-card">
        <span className="eyebrow">Lỗi {code}</span>
        <h1 className="page-title">{title}</h1>
        <p className="muted" style={{ margin: 0 }}>{text}</p>
        <div><Link className="btn btn-gold" to={home}>Về trang chính của tôi</Link></div>
      </div>
    </div>
  );
}

export const Forbidden = () => <ErrorView code="403" title="Bạn không có quyền xem trang này" text="Trang này dành cho vai trò khác. Nếu cần quyền truy cập, hãy liên hệ chủ salon." />;
export const NotFound = () => <ErrorView code="404" title="Không tìm thấy trang" text="Đường dẫn không tồn tại hoặc đã được đổi." />;
