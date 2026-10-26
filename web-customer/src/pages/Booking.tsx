import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { shortDay, todayVN, vnd } from '../lib/format';
import { priceText, useSalonData } from '../lib/salon-data';
import type { Appointment, Availability, Service, Stylist } from '../lib/types';
import SlotPicker from '../components/SlotPicker';
import BookingConfirmation from '../components/BookingConfirmation';

const PHONE_RE = /^0\d{9,10}$/;

/** Stylist có đủ kỹ năng cho mọi dịch vụ đã chọn không (skill id = service id). */
function canDo(st: Stylist, ids: number[]) {
  const skills = new Set(st.skills.map((k) => k.id));
  return ids.every((id) => skills.has(id));
}

/** Lý do không chọn thêm được dịch vụ (đã chọn thì luôn bỏ chọn được), null = chọn được. */
function blockReason(svcId: number, picked: number[], stylist: Stylist | null, stylists: Stylist[]): string | null {
  if (picked.includes(svcId) || !stylists.length) return null;
  if (stylist && !canDo(stylist, [svcId])) return `${stylist.fullName} không làm dịch vụ này`;
  if (!stylists.some((st) => canDo(st, [...picked, svcId]))) return 'Chưa stylist nào làm kèm được với dịch vụ đã chọn';
  return null;
}

function minutesUntil(date: string, time: string) {
  return (new Date(`${date}T${time}:00+07:00`).getTime() - Date.now()) / 60000;
}

export default function Booking() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const isCustomer = user?.role === 'CUSTOMER';
  const { info, services, stylists, loading, error: dataError } = useSalonData();

  const initialService = Number(params.get('service')) || null;
  const initialDate = params.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('date')!) ? params.get('date')! : todayVN(1);
  const [selected, setSelected] = useState<number[]>(initialService ? [initialService] : []);
  const [aud, setAud] = useState<'LONG' | 'SHORT' | null>(null);
  const [stylistId, setStylistId] = useState<number | null>(null);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState<string | null>(params.get('time'));
  const [avail, setAvail] = useState<Availability | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Appointment | null>(null);

  // Nhóm dịch vụ hiển thị: theo dịch vụ được chọn sẵn, mặc định tóc dài/nữ
  const preselected = services.find((s) => s.id === initialService);
  const audience = aud ?? (preselected?.audience === 'SHORT' ? 'SHORT' : 'LONG');
  const shown = services.filter((s) => s.audience === audience || s.audience === 'ALL');
  const picked = useMemo(() => selected.map((id) => services.find((s) => s.id === id)).filter(Boolean) as Service[], [selected, services]);
  const pickedIds = picked.map((s) => s.id);
  const stylist = stylists.find((s) => s.id === stylistId) ?? null;

  const duration = avail?.totalDuration ?? picked.reduce((a, s) => a + s.durationMinutes, 0);
  const total = avail?.totalPrice ?? picked.reduce((a, s) => a + s.basePrice, 0);
  const anyFrom = picked.some((s) => s.priceFrom);
  const lockH = info?.cancelLockHours ?? 2;
  const lastMinute = !!time && minutesUntil(date, time) < lockH * 60;
  const needDeposit = (avail?.depositRequired ?? picked.some((s) => s.depositRequired)) || lastMinute;

  function toggleService(id: number) {
    setError(null);
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    if (stylist && !canDo(stylist, next)) setStylistId(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pickedIds.length) return setError('Vui lòng chọn ít nhất một dịch vụ.');
    if (!time) return setError('Vui lòng chọn khung giờ còn trống.');
    if (!isCustomer) {
      if (!fullName.trim()) return setError('Vui lòng nhập họ và tên.');
      if (!PHONE_RE.test(phone.replace(/\s/g, ''))) return setError('Số điện thoại không hợp lệ (10–11 số, bắt đầu bằng 0).');
    }
    if (!consent) return setError('Vui lòng đồng ý để salon lưu thông tin phục vụ đặt lịch.');
    setSubmitting(true);
    try {
      const appt = await api<Appointment>('/appointments', {
        body: {
          date,
          time,
          serviceIds: pickedIds,
          stylistId: stylistId ?? undefined,
          note: note.trim() || undefined,
          customer: isCustomer ? undefined : { fullName: fullName.trim(), phone: phone.replace(/\s/g, '') },
        },
      });
      setDone(appt);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không gửi được yêu cầu. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setDone(null);
    setSelected([]);
    setTime(null);
    setNote('');
    setConsent(false);
  }

  if (done) {
    return (
      <div className="container page">
        <BookingConfirmation appt={done} hotline={info?.hotline} isMember={isCustomer} onAgain={reset} />
      </div>
    );
  }

  return (
    <div className="container page stack gap-24">
      <div className="spread align-end">
        <div className="stack gap-8">
          <div className="label">Đặt lịch · {isCustomer ? 'Thành viên' : 'Không cần tài khoản'}</div>
          <h1>Giữ một chỗ ngồi cho bạn</h1>
        </div>
        {!isCustomer && (
          <p className="muted">
            Đã là thành viên? <Link to="/dang-nhap?next=/dat-lich">Đăng nhập để đặt nhanh</Link>
          </p>
        )}
      </div>

      {dataError && <div className="alert bad">{dataError}</div>}

      <form className="booking" onSubmit={submit} noValidate>
        <div className="booking__main stack gap-24">
          <section className="card stack" aria-labelledby="b-step1">
            <div className="spread">
              <h2 id="b-step1" className="step-title">
                1. Chọn dịch vụ
              </h2>
              <div role="group" aria-label="Lọc theo kiểu tóc" className="segmented segmented--sm">
                <button type="button" aria-pressed={audience === 'LONG'} onClick={() => setAud('LONG')}>
                  Tóc dài / nữ
                </button>
                <button type="button" aria-pressed={audience === 'SHORT'} onClick={() => setAud('SHORT')}>
                  Tóc ngắn / nam
                </button>
              </div>
            </div>
            {loading && <p className="muted">Đang tải dịch vụ…</p>}
            <div className="grid gap-12" style={{ ['--min' as string]: '200px' }}>
              {shown.map((s) => {
                const blocked = blockReason(s.id, pickedIds, stylist, stylists);
                const able = stylists.filter((st) => canDo(st, [...new Set([...pickedIds, s.id])])).length;
                return (
                  <button key={s.id} type="button" className="pick pick--svc" aria-pressed={selected.includes(s.id)} disabled={!!blocked} onClick={() => toggleService(s.id)}>
                    <span className="pick__name">{s.name}</span>
                    <span className="small muted">
                      {priceText(s, vnd)} · {s.durationMinutes} phút
                    </span>
                    {blocked ? (
                      <span className="small">{blocked}</span>
                    ) : (
                      !stylist && stylists.length > 0 && <span className="small muted">{able} stylist làm được{pickedIds.length && !selected.includes(s.id) ? ' cùng các dịch vụ đã chọn' : ''}</span>
                    )}
                    {s.depositRequired && <span className="small pick__tag">Cần đặt cọc</span>}
                  </button>
                );
              })}
            </div>
            {stylist && (
              <p className="small muted">
                Đang hiện dịch vụ theo chuyên môn của <strong className="text">{stylist.fullName}</strong>.{' '}
                <button type="button" className="link-btn" onClick={() => setStylistId(null)}>
                  Bỏ chọn stylist
                </button>
              </p>
            )}
            <p className="small muted">Chưa chắc chọn gì? Chọn “Cắt tóc” và ghi chú mong muốn — stylist sẽ tư vấn và báo giá trước khi làm.</p>
          </section>

          <section className="card stack" aria-labelledby="b-step2">
            <h2 id="b-step2" className="step-title">
              2. Chọn stylist
            </h2>
            <div className="grid gap-12" style={{ ['--min' as string]: '150px' }}>
              <button type="button" className="pick" aria-pressed={stylistId === null} onClick={() => setStylistId(null)}>
                <span className="pick__name">Salon tự phân công</span>
                <span className="small muted">Nhanh nhất, theo chuyên môn</span>
              </button>
              {stylists.map((st) => {
                const ok = canDo(st, pickedIds);
                const missing = picked.filter((s) => !canDo(st, [s.id])).map((s) => s.name);
                const specialties = [...new Set(st.skills.map((k) => k.category))].join(' · ');
                return (
                  <button
                    key={st.id}
                    type="button"
                    className="pick"
                    aria-pressed={stylistId === st.id}
                    disabled={!ok}
                    onClick={() => setStylistId(st.id)}
                  >
                    <span className="pick__name">{st.fullName}</span>
                    <span className="small muted">{st.level ?? 'Stylist'}</span>
                    {ok ? (
                      specialties && <span className="small muted">Chuyên: {specialties}</span>
                    ) : (
                      <span className="small">Không làm: {missing.join(', ')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card stack" aria-labelledby="b-step3">
            <h2 id="b-step3" className="step-title">
              3. Chọn ngày &amp; giờ
            </h2>
            <SlotPicker
              serviceIds={pickedIds}
              stylistId={stylistId}
              date={date}
              time={time}
              onDateChange={setDate}
              onTimeChange={setTime}
              onAvailability={setAvail}
              idPrefix="booking"
            />
          </section>

          <section className="card stack" aria-labelledby="b-step4">
            <h2 id="b-step4" className="step-title">
              4. Thông tin liên hệ
            </h2>
            {isCustomer ? (
              <p className="muted">
                Bạn đang đặt lịch với tài khoản thành viên <strong className="text">{user?.name}</strong>.
              </p>
            ) : (
              <div className="grid" style={{ ['--min' as string]: '220px' }}>
                <label className="field">
                  <span>Họ và tên</span>
                  <input className="input" autoComplete="name" placeholder="Nguyễn Văn A" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </label>
                <label className="field">
                  <span>Số điện thoại</span>
                  <input
                    className="input"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="09xx xxx xxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </label>
              </div>
            )}
            <label className="field">
              <span>Mong muốn / tình trạng tóc (không bắt buộc)</span>
              <textarea
                className="input"
                rows={3}
                placeholder="Ví dụ: muốn nhuộm nâu lạnh, tóc đã tẩy 1 lần cách đây 3 tháng"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => {
                  setConsent(e.target.checked);
                  setError(null);
                }} required />
              <span className="muted">
                Tôi đồng ý để salon lưu số điện thoại và lịch sử dịch vụ nhằm phục vụ đặt lịch (xem{' '}
                <Link to="/chinh-sach" target="_blank" rel="noopener">
                  chính sách bảo mật
                </Link>
                ).
              </span>
            </label>
          </section>
        </div>

        <aside className="sheet booking__aside stack" aria-label="Tóm tắt lịch hẹn">
          <div className="label">Tóm tắt</div>
          <div className="stack gap-10">
            {picked.length ? (
              picked.map((s) => (
                <div key={s.id} className="sum-row">
                  <span>{s.name}</span>
                  <strong>{priceText(s, vnd)}</strong>
                </div>
              ))
            ) : (
              <div className="muted">Chưa chọn dịch vụ.</div>
            )}
          </div>
          <dl className="sum-meta">
            <div className="sum-row">
              <dt className="muted">Stylist</dt>
              <dd>{stylist?.fullName ?? 'Salon tự phân công'}</dd>
            </div>
            <div className="sum-row">
              <dt className="muted">Thời gian</dt>
              <dd>{time ? `${shortDay(date)} · ${time}` : `${shortDay(date)} · chưa chọn giờ`}</dd>
            </div>
            <div className="sum-row">
              <dt className="muted">Thời lượng dự kiến</dt>
              <dd>{duration} phút</dd>
            </div>
          </dl>
          <div className="sum-row sum-total">
            <span className="display-14">{anyFrom ? 'Tạm tính từ' : 'Tạm tính'}</span>
            <span className="sum-total__value">{vnd(total)}</span>
          </div>
          {picked.length > 0 && needDeposit && (
            <div role="note" className="alert warn row nowrap align-start">
              <span className="dot dot--warn" aria-hidden="true" />
              <span>
                <strong className="text">Cần đặt cọc:</strong>{' '}
                {lastMinute && !avail?.depositRequired
                  ? `lịch đặt sát giờ (dưới ${lockH} tiếng).`
                  : 'dịch vụ dài hoặc hóa chất.'}{' '}
                Lễ tân sẽ gửi thông tin chuyển khoản sau khi xác nhận.
              </span>
            </div>
          )}
          {error && (
            <div className="alert bad" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-gold btn-lg" disabled={submitting}>
            {submitting ? 'Đang gửi…' : 'Gửi yêu cầu đặt lịch'}
          </button>
          <p className="small muted">
            Lịch ở trạng thái “Chờ xác nhận” cho tới khi lễ tân xác nhận. Đổi/hủy trực tuyến được tới {lockH} tiếng trước giờ hẹn.
          </p>
        </aside>
      </form>
    </div>
  );
}
