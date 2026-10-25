import { Link } from 'react-router-dom';
import { useSalonData } from '../lib/salon-data';

const SECTIONS = [
  { id: 'dat-lich', label: 'Đặt, đổi & hủy lịch' },
  { id: 'an-han', label: 'Thời gian ân hạn' },
  { id: 'dat-coc', label: 'Vắng mặt & đặt cọc' },
  { id: 'du-lieu', label: 'Dữ liệu salon thu thập' },
  { id: 'muc-dich', label: 'Mục đích sử dụng' },
  { id: 'ai-xem', label: 'Ai được xem dữ liệu' },
  { id: 'bao-mat', label: 'Bảo mật tài khoản' },
  { id: 'quyen', label: 'Quyền của bạn' },
];

/** Trang tĩnh: chính sách đặt lịch & bảo mật dữ liệu (số liệu lấy từ /salon-info). */
export default function Policy() {
  const { info } = useSalonData();
  const lockH = info?.cancelLockHours ?? 2;
  const grace = info?.graceMinutes ?? 15;
  const hotline = info?.hotline ?? 'hotline của salon';
  const name = info?.name ?? 'Atelier Luxury Haircare';

  return (
    <div className="container page stack gap-32">
      <header className="stack gap-8">
        <div className="label">Chính sách</div>
        <h1>Chính sách đặt lịch &amp; bảo mật dữ liệu</h1>
        <p className="muted lead">
          Áp dụng cho mọi lịch hẹn đặt trực tuyến, qua điện thoại hoặc tại quầy của {name}
          {info ? ` (${info.address})` : ''}.
        </p>
      </header>

      <div className="policy">
        <nav aria-label="Mục lục chính sách" className="policy__toc card tight">
          <div className="label">Mục lục</div>
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="policy__body card stack gap-28">
          <section id="dat-lich" className="stack gap-8">
            <h2 className="step-title">1. Đặt, đổi &amp; hủy lịch</h2>
            <ul className="policy__list">
              <li>Bạn có thể đặt lịch không cần tài khoản; lịch ở trạng thái “Chờ xác nhận” cho tới khi lễ tân xác nhận.</li>
              <li>
                Thành viên được tự đổi giờ hoặc hủy lịch trên trang Tài khoản tới <strong>{lockH} giờ</strong> trước giờ hẹn.
              </li>
              <li>
                Trong vòng {lockH} giờ trước giờ hẹn, việc đổi/hủy trực tuyến bị khóa — vui lòng gọi <strong>{hotline}</strong> để lễ tân hỗ trợ.
              </li>
              <li>
                Salon mở cửa {info ? `${info.openTime}–${info.closeTime}` : '08:00–20:00'} hằng ngày; khung giờ chỉ hiển thị khi còn đủ stylist có chuyên
                môn và thợ phụ hỗ trợ.
              </li>
            </ul>
          </section>

          <section id="an-han" className="stack gap-8">
            <h2 className="step-title">2. Thời gian ân hạn</h2>
            <p>
              Lịch được giữ thêm <strong>{grace} phút</strong> sau giờ hẹn. Quá {grace} phút mà bạn không đến và salon không liên lạc được, lịch được
              ghi nhận là <em>vắng mặt</em> và stylist được giải phóng cho khách khác.
            </p>
          </section>

          <section id="dat-coc" className="stack gap-8">
            <h2 className="step-title">3. Vắng mặt &amp; đặt cọc</h2>
            <ul className="policy__list">
              <li>Dịch vụ dài hoặc dùng hóa chất (nhuộm, tẩy, uốn, duỗi) cần đặt cọc trước.</li>
              <li>Lịch đặt trực tuyến sát giờ (dưới {lockH} giờ trước giờ hẹn) cần đặt cọc.</li>
              <li>Khách đã vắng mặt không báo trước từ 2 lần trở lên cần đặt cọc cho các lần đặt tiếp theo.</li>
              <li>Mức cọc khoảng 20% giá tạm tính (tối thiểu 100.000 ₫), được trừ vào hóa đơn khi bạn sử dụng dịch vụ. Lễ tân gửi thông tin chuyển khoản sau khi xác nhận lịch.</li>
              <li>Tiền cọc có thể không được hoàn lại nếu bạn vắng mặt mà không báo trước.</li>
            </ul>
          </section>

          <section id="du-lieu" className="stack gap-8">
            <h2 className="step-title">4. Dữ liệu salon thu thập</h2>
            <ul className="policy__list">
              <li>Họ tên và số điện thoại (bắt buộc để đặt lịch).</li>
              <li>Ngày sinh — chỉ khi bạn tự cung cấp.</li>
              <li>Lịch sử lịch hẹn, dịch vụ đã sử dụng và hóa đơn.</li>
              <li>Ghi chú tình trạng tóc, công thức màu do stylist ghi lại để phục vụ những lần sau.</li>
              <li>Phản hồi/khiếu nại bạn gửi cho salon.</li>
            </ul>
            <p className="small muted">Salon không thu thập số thẻ thanh toán, giấy tờ tùy thân hay vị trí của bạn.</p>
          </section>

          <section id="muc-dich" className="stack gap-8">
            <h2 className="step-title">5. Mục đích sử dụng</h2>
            <p>
              Dữ liệu chỉ dùng để xác nhận và nhắc lịch, phân công stylist phù hợp, tư vấn dịch vụ dựa trên lịch sử tóc, lập hóa đơn, áp dụng ưu đãi
              thành viên và xử lý phản hồi. Salon không bán hay chia sẻ dữ liệu cho bên thứ ba vì mục đích quảng cáo.
            </p>
          </section>

          <section id="ai-xem" className="stack gap-8">
            <h2 className="step-title">6. Ai được xem dữ liệu</h2>
            <ul className="policy__list">
              <li>Lễ tân và chủ salon: hồ sơ, lịch hẹn, hóa đơn để vận hành.</li>
              <li>Stylist và thợ phụ: thông tin cần thiết cho lịch được phân công và ghi chú tóc.</li>
              <li>Bạn: hồ sơ, lịch hẹn, lịch sử dịch vụ và phản hồi của chính mình trên trang Tài khoản.</li>
            </ul>
            <p className="small muted">Mỗi nhân viên dùng tài khoản riêng; thao tác quan trọng được ghi nhật ký.</p>
          </section>

          <section id="bao-mat" className="stack gap-8">
            <h2 className="step-title">7. Bảo mật tài khoản</h2>
            <p>
              Mật khẩu được mã hóa một chiều trước khi lưu — nhân viên salon không thể xem mật khẩu của bạn. Khi bạn quên mật khẩu, lễ tân gọi lại để xác
              minh rồi cấp mật khẩu tạm; bạn phải đặt mật khẩu mới ngay ở lần đăng nhập kế tiếp.
            </p>
          </section>

          <section id="quyen" className="stack gap-8">
            <h2 className="step-title">8. Quyền của bạn</h2>
            <ul className="policy__list">
              <li>Xem và sửa họ tên, ngày sinh trên trang Tài khoản bất cứ lúc nào.</li>
              <li>
                Yêu cầu chỉnh sửa số điện thoại, trích xuất hoặc xóa dữ liệu cá nhân bằng cách gọi <strong>{hotline}</strong>. Hóa đơn đã phát hành có
                thể được lưu theo thời hạn kế toán bắt buộc.
              </li>
              <li>Rút lại sự đồng ý xử lý dữ liệu; khi đó salon có thể không còn đặt lịch trực tuyến cho bạn được.</li>
            </ul>
            <p>Salon tuân thủ các quy định pháp luật hiện hành của Việt Nam về bảo vệ dữ liệu cá nhân.</p>
          </section>

          <div className="row">
            <Link to="/dat-lich" className="btn btn-gold">
              Đặt lịch
            </Link>
            <Link to="/" className="btn btn-ghost">
              Về trang chủ
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
