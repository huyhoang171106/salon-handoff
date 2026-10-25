import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { shortDay, todayVN } from '../lib/format';
import type { Availability } from '../lib/types';

interface Props {
  serviceIds: number[];
  stylistId: number | null;
  date: string;
  time: string | null;
  onDateChange: (d: string) => void;
  onTimeChange: (t: string | null) => void;
  onAvailability?: (a: Availability | null) => void;
  days?: number;
  /** Khi đổi giờ: bỏ qua lịch hẹn hiện tại để khung giờ của chính nó hiển thị là trống */
  excludeAppointmentId?: number;
  /** id tiền tố cho aria, tránh trùng khi có nhiều bộ chọn trên một trang */
  idPrefix?: string;
}

/** Dải 14 ngày + lưới khung giờ lấy từ GET /appointments/availability. */
export default function SlotPicker({ serviceIds, stylistId, date, time, onDateChange, onTimeChange, onAvailability, days = 14, excludeAppointmentId, idPrefix = 'slot' }: Props) {
  const [avail, setAvail] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = serviceIds.join(',');

  useEffect(() => {
    if (!serviceIds.length) {
      setAvail(null);
      onAvailability?.(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    api<Availability>('/appointments/availability', { query: { date, serviceIds: key, stylistId: stylistId ?? undefined, excludeAppointmentId } })
      .then((a) => {
        if (!alive) return;
        setAvail(a);
        onAvailability?.(a);
        // Bỏ chọn giờ nếu khung giờ không còn trống với lựa chọn mới
        if (time && !a.slots.some((s) => s.time === time && s.available)) onTimeChange(null);
      })
      .catch((e: ApiError) => {
        if (!alive) return;
        setAvail(null);
        onAvailability?.(null);
        setError(e.message);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, key, stylistId, excludeAppointmentId]);

  const stripRef = useRef<HTMLDivElement>(null);
  // Đưa ngày đang chọn vào tầm nhìn của dải ngày (không cuộn cả trang)
  useEffect(() => {
    const strip = stripRef.current;
    const el = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (strip && el) strip.scrollLeft = el.offsetLeft - strip.offsetLeft - 8;
  }, [date]);

  const dayList = Array.from({ length: days }, (_, i) => todayVN(i));
  const freeCount = avail?.slots.filter((s) => s.available).length ?? 0;

  return (
    <div className="stack">
      <div className="date-strip" ref={stripRef} role="group" aria-label="Chọn ngày">
        {dayList.map((d, i) => {
          const [dow, dm] = shortDay(d).split(' ');
          const on = d === date;
          return (
            <button
              key={d}
              type="button"
              className="date-pill"
              aria-pressed={on}
              aria-label={`${i === 0 ? 'Hôm nay, ' : ''}${shortDay(d)}`}
              onClick={() => {
                onDateChange(d);
                onTimeChange(null);
              }}
            >
              <span className="date-pill__dow">{i === 0 ? 'Hôm nay' : dow}</span>
              <span className="date-pill__num">{dm.slice(0, 2)}</span>
              <span className="date-pill__month">Th{Number(dm.slice(3))}</span>
            </button>
          );
        })}
      </div>

      {!serviceIds.length ? (
        <p className="muted">Chọn ít nhất một dịch vụ để xem khung giờ còn trống.</p>
      ) : error ? (
        <div className="alert bad" role="alert">
          {error}
        </div>
      ) : (
        <>
          <div className="slot-grid" role="group" aria-label={`Khung giờ ngày ${shortDay(date)}`} aria-busy={loading} id={`${idPrefix}-grid`}>
            {avail?.slots.map((s) => {
              const on = s.time === time;
              return (
                <button
                  key={s.time}
                  type="button"
                  className="slot"
                  aria-pressed={on}
                  disabled={!s.available}
                  title={s.available ? undefined : s.reason}
                  aria-label={s.available ? `${s.time} — còn trống` : `${s.time} — ${s.reason ?? 'không khả dụng'}`}
                  onClick={() => onTimeChange(on ? null : s.time)}
                >
                  {s.time}
                </button>
              );
            })}
          </div>
          {loading && !avail && <p className="muted small">Đang tải khung giờ…</p>}
          {avail && freeCount === 0 && (
            <div className="alert warn" role="status">
              Ngày này đã hết khung giờ phù hợp với dịch vụ đã chọn. Vui lòng chọn ngày khác hoặc stylist khác.
            </div>
          )}
          <div className="legend small muted" aria-hidden="true">
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--free" /> Còn trống
            </span>
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--on" /> Đang chọn
            </span>
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--off" /> Không khả dụng (rê chuột để xem lý do)
            </span>
          </div>
          <p className="small muted">Gạch ngang: đã qua giờ, ngoài giờ mở cửa, hết stylist phù hợp hoặc không còn thợ phụ hỗ trợ trong khung giờ này.</p>
        </>
      )}
    </div>
  );
}
