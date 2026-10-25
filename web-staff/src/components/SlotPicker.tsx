import { api } from '../lib/api';
import { useLoad } from '../lib/util';
import { vnd } from '../lib/format';
import type { Availability } from '../lib/types';
import { ErrorAlert, Loading } from './ui';

interface Props {
  date: string;
  serviceIds: number[];
  stylistId: number | null;
  value: string | null;
  onChange: (time: string) => void;
  excludeAppointmentId?: number;
}

/** Chọn khung giờ trống từ GET /appointments/availability. */
export function SlotPicker({ date, serviceIds, stylistId, value, onChange, excludeAppointmentId }: Props) {
  const ready = !!date && serviceIds.length > 0;
  const { data, error, loading } = useLoad<Availability | null>(
    () => (ready ? api<Availability>('/appointments/availability', { query: { date, serviceIds: serviceIds.join(','), stylistId: stylistId ?? undefined, excludeAppointmentId } }) : Promise.resolve(null)),
    [date, serviceIds.join(','), stylistId, ready, excludeAppointmentId],
  );
  if (!ready) return <p className="muted small">Chọn dịch vụ và ngày để xem giờ trống.</p>;
  if (loading && !data) return <Loading label="Đang tìm giờ trống…" />;
  if (error) return <ErrorAlert error={error} />;
  if (!data) return null;
  const free = data.slots.filter((s) => s.available);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row small muted">
        <span>Tổng thời gian {data.totalDuration} phút</span>
        <span aria-hidden="true">·</span>
        <span>Tạm tính {vnd(data.totalPrice)}</span>
        {data.depositRequired && <span className="badge warn">Cần đặt cọc</span>}
      </div>
      {free.length === 0 && <div className="alert warn">Không còn giờ trống trong ngày này. Thử ngày khác hoặc đổi stylist.</div>}
      <div className="slot-grid" role="group" aria-label="Khung giờ">
        {data.slots.map((s) => (
          <button
            key={s.time}
            type="button"
            className="pick slot"
            aria-pressed={value === s.time}
            disabled={!s.available}
            title={s.available ? `Chọn ${s.time}` : s.reason}
            onClick={() => onChange(s.time)}
          >
            {s.time}
          </button>
        ))}
      </div>
    </div>
  );
}
