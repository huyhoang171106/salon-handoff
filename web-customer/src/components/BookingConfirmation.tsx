import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { APPOINTMENT_STATUS, date, shortDay, time, vnd } from '../lib/format';
import type { Appointment } from '../lib/types';
import StatusBadge from './StatusBadge';

interface Props {
  appt: Appointment;
  hotline?: string;
  isMember: boolean;
  onAgain: () => void;
}

/** Màn hình xác nhận sau khi gửi yêu cầu đặt lịch thành công. */
export default function BookingConfirmation({ appt, hotline, isMember, onAgain }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const stylists = [...new Set(appt.items.map((i) => i.leadStylist?.fullName).filter(Boolean))];

  return (
    <section className="sheet confirm stack gap-20" aria-labelledby="confirm-title">
      <div className="spread">
        <div className="label">Đã gửi yêu cầu đặt lịch</div>
        <StatusBadge status={appt.status} map={APPOINTMENT_STATUS} />
      </div>
      <h1 id="confirm-title" ref={headingRef} tabIndex={-1}>
        Cảm ơn bạn! Salon đã nhận lịch hẹn.
      </h1>
      <dl className="confirm__grid">
        <div>
          <dt className="label">Mã lịch hẹn</dt>
          <dd className="confirm__code">{appt.code}</dd>
        </div>
        <div>
          <dt className="label">Thời gian</dt>
          <dd>
            {shortDay(new Date(new Date(appt.startAt).getTime() + 7 * 3600000).toISOString().slice(0, 10))}/{date(appt.startAt).slice(6)} · {time(appt.startAt)} – {time(appt.endAt)}
          </dd>
        </div>
        <div>
          <dt className="label">Dịch vụ</dt>
          <dd>{appt.items.map((i) => i.service.name).join(', ')}</dd>
        </div>
        <div>
          <dt className="label">Stylist</dt>
          <dd>{stylists.join(', ') || 'Salon tự phân công'}</dd>
        </div>
      </dl>
      {appt.depositStatus === 'REQUIRED' && (
        <div className="alert warn" role="note">
          <strong className="text">Cần đặt cọc {vnd(appt.depositAmount)}.</strong> Lễ tân sẽ liên hệ gửi thông tin chuyển khoản; lịch được giữ
          sau khi nhận cọc.
        </div>
      )}
      <p className="muted">
        Lễ tân sẽ gọi xác nhận trong giờ làm việc. Cần đổi giờ gấp? Gọi hotline <strong className="text">{hotline ?? ''}</strong>.
      </p>
      <div className="row">
        {isMember ? (
          <Link to="/tai-khoan" className="btn btn-dark">
            Xem lịch hẹn của tôi
          </Link>
        ) : (
          <Link to="/dang-ky" className="btn btn-dark">
            Đăng ký thành viên để quản lý lịch
          </Link>
        )}
        <button type="button" className="btn btn-outline" onClick={onAgain}>
          Đặt thêm lịch khác
        </button>
        <Link to="/" className="btn btn-ghost">
          Về trang chủ
        </Link>
      </div>
    </section>
  );
}
