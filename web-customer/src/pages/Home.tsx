import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { todayVN, vnd } from '../lib/format';
import { priceText, useSalonData } from '../lib/salon-data';
import type { Audience, Availability, Service, Stylist } from '../lib/types';

const CATEGORY_LABEL: Record<string, string> = {
  'CẮT': 'Cắt',
  'GỘI SẤY': 'Gội sấy',
  'MÀU': 'Màu',
  'HÓA CHẤT': 'Hóa chất',
  'TẠO KIỂU': 'Tạo kiểu',
  'HAIR SPA': 'Hair spa',
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Thẻ "Khung giờ còn trống hôm nay" — dùng dịch vụ cắt rẻ nhất làm mốc. */
function TodaySlots({ services }: { services: Service[] }) {
  const [avail, setAvail] = useState<Availability | null>(null);
  const [failed, setFailed] = useState(false);
  const cut = useMemo(
    () => services.filter((s) => s.category === 'CẮT').sort((a, b) => a.basePrice - b.basePrice)[0] ?? services[0],
    [services],
  );
  const today = todayVN();

  useEffect(() => {
    if (!cut) return;
    api<Availability>('/appointments/availability', { query: { date: today, serviceIds: cut.id } })
      .then(setAvail)
      .catch(() => setFailed(true));
  }, [cut, today]);

  const free = avail?.slots.filter((s) => s.available).slice(0, 6) ?? [];
  const loading = !avail && !failed;

  return (
    <aside aria-labelledby="today-title" className="sheet stack hero__aside">
      <div className="spread">
        <h2 id="today-title" className="card-title">
          Khung giờ còn trống hôm nay
        </h2>
        {!loading && <span className={`badge ${free.length ? 'ok' : 'neutral'}`}>{free.length ? 'Còn chỗ' : 'Hết chỗ'}</span>}
      </div>
      {loading ? (
        <p className="muted">Đang kiểm tra lịch…</p>
      ) : free.length ? (
        <ul className="today-slots" aria-label={cut ? `Khung giờ trống cho dịch vụ ${cut.name}` : undefined}>
          {free.map((s) => (
            <li key={s.time}>
              <Link className="today-slot" to={`/dat-lich?service=${cut.id}&date=${today}&time=${s.time}`}>
                {s.time}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          Hôm nay đã kín lịch hoặc đã hết giờ nhận khách. <Link to="/dat-lich">Xem các ngày tiếp theo</Link>
        </p>
      )}
      <p className="small muted">
        Khung giờ chỉ hiển thị khi còn đủ stylist có chuyên môn và thợ phụ hỗ trợ. Lễ tân xác nhận lịch sau khi bạn gửi yêu cầu.
      </p>
    </aside>
  );
}

function ServiceCard({ s }: { s: Service }) {
  return (
    <article className="svc-card">
      <div className="label">{s.category}</div>
      <h3>{s.name}</h3>
      <div className="svc-card__foot">
        <span className="price">{priceText(s, vnd)}</span>
        <span className="pill">{s.durationMinutes} phút</span>
      </div>
      <Link className="svc-card__book" to={`/dat-lich?service=${s.id}`} aria-label={`Đặt lịch ${s.name}`}>
        Đặt dịch vụ này
      </Link>
    </article>
  );
}

function StylistCard({ st }: { st: Stylist }) {
  const cats = [...new Set(st.skills.map((k) => k.category))];
  return (
    <article className="card stack gap-14">
      <div className="row gap-14 nowrap">
        <div className="avatar" aria-hidden="true">
          {initials(st.fullName)}
        </div>
        <div className="stack gap-2">
          <h3 className="card-title">{st.fullName}</h3>
          {st.level && <div className="label">{st.level}</div>}
        </div>
      </div>
      <ul className="chips" aria-label="Chuyên môn">
        {cats.map((c) => (
          <li key={c} className="chip">
            {CATEGORY_LABEL[c] ?? c}
          </li>
        ))}
      </ul>
      {st.bio && <p className="muted small-14">{st.bio}</p>}
    </article>
  );
}

export default function Home() {
  const { info, services, stylists, loading, error } = useSalonData();
  const [aud, setAud] = useState<Exclude<Audience, 'ALL'>>('LONG');
  const shown = services.filter((s) => s.audience === aud || s.audience === 'ALL');
  const lockH = info?.cancelLockHours ?? 2;
  const grace = info?.graceMinutes ?? 15;

  return (
    <>
      <section className="container hero">
        <div className="hero__copy stack gap-20">
          <div className="label">
            Salon unisex · Mở cửa {info ? `${info.openTime}–${info.closeTime}` : '08:00–20:00'}
          </div>
          <h1 className="hero-title">Kiểu tóc được may đo theo bạn, không theo khuôn mẫu.</h1>
          <p className="lead muted">
            Cắt, nhuộm, uốn, duỗi và phục hồi tóc cho mọi khách hàng. Chọn dịch vụ, chọn stylist và khung giờ còn trống — đặt lịch
            không cần tài khoản.
          </p>
          <div className="row">
            <Link to="/dat-lich" className="btn btn-gold btn-lg">
              Đặt lịch ngay
            </Link>
            <a href="#dich-vu" className="btn btn-dark btn-lg">
              Xem bảng giá
            </a>
          </div>
        </div>
        {services.length > 0 ? <TodaySlots services={services} /> : <div className="sheet hero__aside muted">{loading ? 'Đang tải…' : error}</div>}
      </section>

      <section id="dich-vu" className="band-card">
        <div className="container section stack gap-28">
          <div className="spread align-end">
            <div className="stack gap-8">
              <div className="label">Dịch vụ &amp; bảng giá tham khảo</div>
              <h2 className="section-title">Chọn theo nhu cầu tóc của bạn</h2>
            </div>
            <div role="group" aria-label="Bảng giá theo kiểu tóc" className="segmented">
              <button type="button" aria-pressed={aud === 'LONG'} onClick={() => setAud('LONG')}>
                Tóc dài / nữ
              </button>
              <button type="button" aria-pressed={aud === 'SHORT'} onClick={() => setAud('SHORT')}>
                Tóc ngắn / nam
              </button>
            </div>
          </div>
          {error && <div className="alert bad">{error}</div>}
          <div className="grid gap-24" style={{ ['--min' as string]: '240px' }}>
            {shown.map((s) => (
              <ServiceCard key={s.id} s={s} />
            ))}
          </div>
          <p className="small muted">
            Giá tham khảo; giá cuối cùng được stylist tư vấn và bạn xác nhận trước khi thực hiện. Dịch vụ phát sinh trong lúc làm luôn cần
            bạn đồng ý.
          </p>
        </div>
      </section>

      <section id="stylist" className="container section stack gap-28">
        <div className="stack gap-8">
          <div className="label">Đội ngũ</div>
          <h2 className="section-title">Stylist theo chuyên môn</h2>
        </div>
        <div className="grid gap-24">
          {stylists.map((st) => (
            <StylistCard key={st.id} st={st} />
          ))}
        </div>
      </section>

      <section id="thanh-vien" className="band-inverse">
        <div className="container section member">
          <div className="member__copy stack">
            <div className="label">Thành viên Atelier</div>
            <h2 className="section-title">Đăng ký bằng số điện thoại, salon nhớ mái tóc của bạn.</h2>
            <div className="grid" style={{ ['--min' as string]: '200px' }}>
              <div className="stack gap-4">
                <strong className="display-14">Lịch sử dịch vụ</strong>
                <span className="band-inverse__soft">Xem lại các lần làm tóc và hóa đơn.</span>
              </div>
              <div className="stack gap-4">
                <strong className="display-14">Ưu đãi thành viên</strong>
                <span className="band-inverse__soft">Ưu đãi lần đầu sau khi đăng ký, tự áp dụng khi lập hóa đơn.</span>
              </div>
              <div className="stack gap-4">
                <strong className="display-14">Quản lý lịch hẹn</strong>
                <span className="band-inverse__soft">Đổi hoặc hủy lịch trực tuyến trước giờ hẹn {lockH} tiếng.</span>
              </div>
            </div>
          </div>
          <div className="member__cta stack gap-12">
            <Link to="/dang-ky" className="btn btn-gold btn-lg">
              Đăng ký thành viên
            </Link>
            <Link to="/dang-nhap" className="btn btn-outline btn-lg band-inverse__outline">
              Tôi đã có tài khoản
            </Link>
          </div>
        </div>
      </section>

      <section className="container section stack gap-28" aria-labelledby="policy-title">
        <div className="stack gap-8">
          <div className="label">Chính sách đặt lịch</div>
          <h2 id="policy-title" className="section-title">
            Để giờ hẹn của bạn luôn được giữ
          </h2>
        </div>
        <div className="grid gap-24" style={{ ['--min' as string]: '300px' }}>
          <div className="card stack gap-8">
            <div className="policy-figure">{lockH} giờ</div>
            <h3 className="card-title">Đổi / hủy trực tuyến</h3>
            <p className="muted small-14">
              Trong vòng {lockH} tiếng trước giờ hẹn, vui lòng gọi hotline{info ? ` ${info.hotline}` : ''} để lễ tân hỗ trợ.
            </p>
          </div>
          <div className="card stack gap-8">
            <div className="policy-figure">{grace} phút</div>
            <h3 className="card-title">Thời gian ân hạn</h3>
            <p className="muted small-14">Quá {grace} phút không đến và không liên lạc được, lịch được ghi nhận là vắng mặt.</p>
          </div>
          <div className="card stack gap-8">
            <div className="policy-figure">Đặt cọc</div>
            <h3 className="card-title">Dịch vụ lớn</h3>
            <p className="muted small-14">
              Áp dụng cho dịch vụ dài (nhuộm, uốn, duỗi, tẩy), đặt sát giờ hẹn hoặc khách đã vắng mặt nhiều lần.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
