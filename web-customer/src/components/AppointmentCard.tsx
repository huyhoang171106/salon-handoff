import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { APPOINTMENT_STATUS, shortDay, time as fmtTime, vnd } from '../lib/format';
import type { Appointment } from '../lib/types';
import StatusBadge from './StatusBadge';
import SlotPicker from './SlotPicker';

interface Props {
  appt: Appointment;
  lockHours: number;
  hotline: string;
  onChanged: () => void;
}

/** "YYYY-MM-DD" theo giờ VN của một timestamp ISO. */
function ymdVN(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10);
}

export default function AppointmentCard({ appt, lockHours, hotline, onChanged }: Props) {
  const [mode, setMode] = useState<'view' | 'reschedule' | 'cancel'>('view');
  const [date, setDate] = useState(ymdVN(appt.startAt));
  const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoursLeft = (new Date(appt.startAt).getTime() - Date.now()) / 3600000;
  const locked = hoursLeft < lockHours;
  const services = appt.items.map((i) => i.service.name).join(' + ');
  const stylists = [...new Set(appt.items.map((i) => i.leadStylist?.fullName).filter(Boolean))].join(', ');
  const isToday = ymdVN(appt.startAt) === ymdVN(new Date().toISOString());
  // Giữ stylist khách đã chọn khi đổi giờ; lịch "tự phân công" thì để salon xếp lại
  const keepStylistId = appt.autoAssigned === false ? appt.items[0]?.leadStylist?.id ?? null : null;
  const titleId = `appt-${appt.id}-title`;

  async function run(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(`/appointments/${appt.id}/${path}`, { body });
      setMode('view');
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Thao tác không thành công.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card stack appt-card" aria-labelledby={titleId}>
      <div className="spread">
        {locked ? <span className="badge warn">Còn dưới {lockHours} giờ</span> : <span className="small muted">Mã lịch {appt.code}</span>}
        <StatusBadge status={appt.status} map={APPOINTMENT_STATUS} />
      </div>
      <div className="stack gap-4">
        <h3 id={titleId}>
          {isToday ? 'Hôm nay' : shortDay(ymdVN(appt.startAt))} · {fmtTime(appt.startAt)} – {fmtTime(appt.endAt)}
        </h3>
        <p className="muted">
          {services} · {stylists ? `Stylist ${stylists}` : 'Salon tự phân công'}
        </p>
        {appt.depositStatus === 'REQUIRED' && <p className="small warn-ink">Chờ đặt cọc {vnd(appt.depositAmount)}</p>}
        {appt.depositStatus === 'PAID' && <p className="small ok-ink">Đã nhận cọc {vnd(appt.depositAmount)}</p>}
      </div>

      {mode === 'view' && (
        <div className="row gap-8">
          <button type="button" className="btn btn-outline" disabled={locked} onClick={() => setMode('reschedule')}>
            Đổi giờ
          </button>
          <button type="button" className="btn btn-danger" disabled={locked} onClick={() => setMode('cancel')}>
            Hủy lịch
          </button>
        </div>
      )}

      {mode === 'cancel' && (
        <div className="confirm-box stack gap-12" role="group" aria-label="Xác nhận hủy lịch">
          <p>Bạn chắc chắn muốn hủy lịch {appt.code}?</p>
          <div className="row gap-8">
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => run('cancel', {})}>
              {busy ? 'Đang hủy…' : 'Xác nhận hủy'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode('view')}>
              Giữ lịch
            </button>
          </div>
        </div>
      )}

      {mode === 'reschedule' && (
        <div className="confirm-box stack gap-12" role="group" aria-label="Chọn giờ mới">
          <div className="display-14">Chọn ngày &amp; giờ mới</div>
          <SlotPicker
            serviceIds={appt.items.map((i) => i.service.id)}
            stylistId={keepStylistId}
            excludeAppointmentId={appt.id}
            date={date}
            time={time}
            onDateChange={setDate}
            onTimeChange={setTime}
            idPrefix={`rs-${appt.id}`}
          />
          <div className="row gap-8">
            <button
              type="button"
              className="btn btn-gold"
              disabled={!time || busy}
              onClick={() => time && run('reschedule', { date, time, stylistId: keepStylistId ?? undefined })}
            >
              {busy ? 'Đang đổi…' : time ? `Đổi sang ${shortDay(date)} · ${time}` : 'Chọn giờ mới'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode('view')}>
              Thôi
            </button>
          </div>
          <p className="small muted">Sau khi đổi giờ, lịch quay về trạng thái “Chờ xác nhận”.</p>
        </div>
      )}

      {error && (
        <div className="alert bad" role="alert">
          {error}
        </div>
      )}
      {locked && (
        <p role="note" className="small-14 muted">
          Đã khóa đổi/hủy trực tuyến vì còn dưới {lockHours} tiếng. Nếu có việc đột xuất, vui lòng gọi <strong className="text">{hotline}</strong>.
        </p>
      )}
    </article>
  );
}
