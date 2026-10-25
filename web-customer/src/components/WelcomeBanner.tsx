import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Flash } from '../lib/flash';

interface Props {
  kind: Flash;
  lockHours: number;
  onClose: () => void;
}

/** Banner một lần: chào mừng thành viên mới / xác nhận đã đổi mật khẩu. */
export default function WelcomeBanner({ kind, lockHours, onClose }: Props) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus(), []);

  if (kind === 'password-changed') {
    return (
      <section ref={ref} tabIndex={-1} className="welcome card spread" role="status" aria-label="Đã đổi mật khẩu">
        <div className="stack gap-4">
          <div className="label">Bảo mật tài khoản</div>
          <strong className="display-14">Đã đổi mật khẩu thành công.</strong>
          <span className="muted small-14">Lần sau hãy đăng nhập bằng mật khẩu mới.</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Đóng
        </button>
      </section>
    );
  }

  return (
    <section ref={ref} tabIndex={-1} className="welcome card stack gap-16" aria-labelledby="welcome-title">
      <div className="spread">
        <div className="stack gap-4">
          <div className="label">Chào mừng thành viên mới</div>
          <h2 id="welcome-title" className="step-title">
            Tài khoản của bạn đã sẵn sàng
          </h2>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Đóng lời chào">
          Đóng
        </button>
      </div>
      <ul className="welcome__perks">
        <li>
          <strong className="display-14">Ưu đãi lần đầu</strong>
          <span className="muted small-14">Tự áp dụng khi lễ tân lập hóa đơn cho lần sử dụng dịch vụ đầu tiên.</span>
        </li>
        <li>
          <strong className="display-14">Quản lý lịch hẹn</strong>
          <span className="muted small-14">Đổi hoặc hủy trực tuyến tới {lockHours} giờ trước giờ hẹn.</span>
        </li>
        <li>
          <strong className="display-14">Lịch sử tóc</strong>
          <span className="muted small-14">Hóa đơn và dịch vụ đã dùng được lưu tại trang này.</span>
        </li>
      </ul>
      <div className="row">
        <Link to="/dat-lich" className="btn btn-gold">
          Đặt lịch đầu tiên
        </Link>
      </div>
    </section>
  );
}
