import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { APPOINTMENT_STATUS, date as fmtDate, time, todayVN, vnd } from '../../lib/format';
import { DEPOSIT_STATUS, SOURCE_LABEL } from '../../lib/labels';
import { nowMinutesVN, useAction, vnMinutes } from '../../lib/util';
import type { Appointment, Employee, Session } from '../../lib/types';
import { Drawer } from '../../components/Overlay';
import { ErrorAlert, OkAlert, StatusBadge } from '../../components/ui';
import { SlotPicker } from '../../components/SlotPicker';
import { StylistSelect } from './BookingModals';

interface NoShowResult {
  appointment: Appointment;
  releasedEmployeeIds: number[];
  customerNoShowCount: number;
  depositRequiredNextTime: boolean;
}

interface StylistOption {
  id: number;
  name: string;
  available: boolean;
  reason?: string;
  current: boolean;
}

const GRACE = 15;

/** Ngăn kéo chi tiết lịch hẹn + thao tác theo trạng thái. */
export function AppointmentDrawer({ appt, employees, onClose, onChanged }: { appt: Appointment; employees: Employee[]; onClose: () => void; onChanged: () => void }) {
  const act = useAction();
  const [panel, setPanel] = useState<'none' | 'reschedule' | 'cancel' | 'checkin'>('none');
  const [options, setOptions] = useState<StylistOption[] | null>(null);
  const [reason, setReason] = useState('');
  const [rDate, setRDate] = useState(appt.startAt ? new Date(new Date(appt.startAt).getTime() + 7 * 3600000).toISOString().slice(0, 10) : todayVN());
  const [rStylist, setRStylist] = useState<number | null>(null);
  const [rTime, setRTime] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  const s = appt.status;
  const open = ['BOOKED', 'CONFIRMED', 'LATE'].includes(s);
  const isToday = fmtDate(appt.startAt) === fmtDate(new Date());
  const lateBy = isToday ? nowMinutesVN() - vnMinutes(appt.startAt) : 0;
  const name = (id: number) => employees.find((e) => e.id === id)?.fullName ?? `#${id}`;
  const leads = [...new Set(appt.items.map((i) => i.leadStylist.fullName))].join(', ');
  const total = appt.items.reduce((t, i) => t + i.quotedPrice, 0);

  async function post(path: string, body: unknown, ok: string) {
    const r = await act.run(() => api(`/appointments/${appt.id}/${path}`, { body: body ?? {} }), ok);
    if (r) onChanged();
    return r;
  }

  async function noShow() {
    const r = await act.run(
      () => api<NoShowResult>(`/appointments/${appt.id}/no-show`, { method: 'POST' }),
      (x) =>
        `Đã giải phóng thợ: ${x.releasedEmployeeIds.map(name).join(', ')}. Khách đã vắng mặt ${x.customerNoShowCount} lần${x.depositRequiredNextTime ? ' — lần sau bắt buộc đặt cọc' : ''}.`,
    );
    if (r) onChanged();
  }

  async function checkIn(stylistId?: number) {
    const r = await act.run(() => api<Session>(`/appointments/${appt.id}/check-in`, { body: { stylistId } }), (x) => `Đã check-in, tạo phiên phục vụ ${x.code}.`);
    if (r) {
      setSession(r);
      setPanel('none');
      onChanged();
    }
  }

  /** Lịch salon đã tự đổi thợ: hỏi khách có muốn đổi stylist khác trước khi check-in. */
  async function startCheckIn() {
    if (!appt.stylistChangeNote) return checkIn();
    act.reset();
    setPanel('checkin');
    setOptions(null);
    const r = await act.run(() => api<StylistOption[]>(`/appointments/${appt.id}/stylist-options`));
    setOptions(r ?? []);
  }

  async function reschedule() {
    if (!rTime) return act.setError('Chọn giờ mới');
    const r = await post('reschedule', { date: rDate, time: rTime, stylistId: rStylist ?? undefined, reason: reason.trim() || undefined }, `Đã đổi sang ${rTime} ngày ${rDate.split('-').reverse().join('/')}`);
    if (r) {
      setPanel('none');
      setRTime(null);
    }
  }

  async function cancel() {
    if (!reason.trim()) return act.setError('Cần ghi lý do hủy lịch');
    const r = await post('cancel', { reason: reason.trim() }, 'Đã hủy lịch hẹn');
    if (r) setPanel('none');
  }

  return (
    <Drawer title={`${appt.customer.fullName} · ${appt.code}`} eyebrow="Chi tiết lịch hẹn" onClose={onClose}>
      <div className="stack">
        <div className="spread">
          <StatusBadge map={APPOINTMENT_STATUS} value={s} />
          {s === 'LATE' && lateBy > 0 && (
            <span className="small muted">
              Trễ {lateBy} phút · {lateBy < GRACE ? `ân hạn còn ${GRACE - lateBy} phút` : 'đã hết ân hạn'}
            </span>
          )}
          {appt.checkedInAt && <span className="small muted">Check-in {time(appt.checkedInAt)}</span>}
          {!appt.checkedInAt && appt.remindedAt && <span className="small muted">Đã nhắc khách {time(appt.remindedAt)} {fmtDate(appt.remindedAt)}</span>}
        </div>

        <div className="stack" style={{ gap: 4 }}>
          <strong>
            {time(appt.startAt)} – {time(appt.endAt)} · {fmtDate(appt.startAt)}
          </strong>
          <span className="muted small">
            Thợ chính: {leads} · {SOURCE_LABEL[appt.source]}
          </span>
          <span className="muted small">
            {appt.customer.phone} · {appt.customer.code}
            {appt.customer.isMember ? ' · Thành viên' : ''}
          </span>
        </div>

        {appt.stylistChangeNote && open && (
          <div className="alert warn" role="note">
            <span className="badge warn">Đổi thợ</span> {appt.stylistChangeNote} Hỏi khách có muốn đổi stylist khi check-in.
          </div>
        )}

        {appt.customer.noShowCount > 0 && (
          <div className="alert warn">
            <span className="badge bad">Cảnh báo</span> Khách đã vắng mặt {appt.customer.noShowCount} lần trước đây.
          </div>
        )}

        <div className="line-list">
          {appt.items.map((i) => (
            <div key={i.id} className="line">
              <div className="stack" style={{ gap: 2 }}>
                <span>{i.service.name}</span>
                <span className="muted small">
                  {time(i.startAt)}–{time(i.endAt)} · {i.leadStylist.fullName}
                  {i.assistant ? ` · thợ phụ ${i.assistant.fullName}` : ''}
                </span>
              </div>
              <span className="num">{vnd(i.quotedPrice)}</span>
            </div>
          ))}
          <div className="line total">
            <span>Tạm tính</span>
            <span className="num">{vnd(total)}</span>
          </div>
        </div>

        {appt.depositStatus !== 'NOT_REQUIRED' && (
          <div className="row">
            <StatusBadge map={DEPOSIT_STATUS} value={appt.depositStatus} />
            <span className="small">Tiền cọc {vnd(appt.depositAmount)}</span>
          </div>
        )}
        {appt.note && <p className="small" style={{ margin: 0 }}>Ghi chú: {appt.note}</p>}
        {appt.statusReason && <p className="small muted" style={{ margin: 0 }}>Lý do: {appt.statusReason}</p>}

        <ErrorAlert error={act.error} />
        <OkAlert message={act.message} />
        {session && (
          <Link className="btn btn-outline btn-sm" to="/phuc-vu">
            Mở phiên {session.code}
          </Link>
        )}

        {open && panel === 'none' && (
          <div className="action-grid">
            {s === 'BOOKED' && (
              <button type="button" className="btn btn-gold btn-sm" disabled={act.busy} onClick={() => post('confirm', null, 'Đã xác nhận lịch')}>
                Xác nhận
              </button>
            )}
            {appt.depositStatus === 'REQUIRED' && (
              <button type="button" className="btn btn-outline btn-sm" disabled={act.busy} onClick={() => post('deposit-paid', null, 'Đã ghi nhận tiền cọc')}>
                Đã nhận cọc
              </button>
            )}
            <button type="button" className={`btn btn-sm ${s === 'BOOKED' ? 'btn-outline' : 'btn-gold'}`} disabled={act.busy} onClick={startCheckIn}>
              Check-in
            </button>
            {s !== 'LATE' && new Date(appt.startAt).getTime() <= Date.now() && (
              <button type="button" className="btn btn-outline btn-sm" disabled={act.busy} onClick={() => post('late', null, 'Đã đánh dấu đến trễ')}>
                Đánh dấu trễ
              </button>
            )}
            <button type="button" className="btn btn-outline btn-sm" disabled={act.busy} onClick={noShow}>
              Vắng mặt
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { act.reset(); setPanel('reschedule'); }}>
              Đổi giờ
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => { act.reset(); setPanel('cancel'); }}>
              Hủy lịch
            </button>
          </div>
        )}

        {(s === 'CHECKED_IN' || s === 'IN_SERVICE') && !session && (
          <Link className="btn btn-outline btn-sm" to="/phuc-vu">
            Xem phiên phục vụ
          </Link>
        )}

        {panel === 'reschedule' && (
          <div className="subpanel stack">
            <h3 className="step-title">Đổi giờ hẹn</h3>
            <div className="form-grid">
              <label className="field">
                <span>Ngày mới</span>
                <input className="input" type="date" min={todayVN()} value={rDate} onChange={(e) => { setRDate(e.target.value); setRTime(null); }} />
              </label>
              <StylistSelect value={rStylist} onChange={(v) => { setRStylist(v); setRTime(null); }} />
            </div>
            <SlotPicker date={rDate} serviceIds={appt.items.map((i) => i.service.id)} stylistId={rStylist} value={rTime} onChange={setRTime} excludeAppointmentId={appt.id} />
            <label className="field">
              <span>Lý do (không bắt buộc)</span>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className="row">
              <button type="button" className="btn btn-gold btn-sm" disabled={act.busy || !rTime} onClick={reschedule}>
                Lưu giờ mới
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel('none')}>
                Quay lại
              </button>
            </div>
          </div>
        )}

        {panel === 'checkin' && (
          <div className="subpanel stack">
            <h3 className="step-title">Khách có muốn đổi stylist không?</h3>
            <p className="small" style={{ margin: 0 }}>
              Đang xếp: <strong>{leads}</strong> · {time(appt.startAt)}
            </p>
            {!options && <p className="muted small" style={{ margin: 0 }}>Đang kiểm tra stylist rảnh…</p>}
            <div className="action-grid">
              <button type="button" className="btn btn-gold btn-sm" disabled={act.busy} onClick={() => checkIn()}>
                Giữ {leads}, check-in
              </button>
              {options?.filter((o) => o.available && !o.current).map((o) => (
                <button key={o.id} type="button" className="btn btn-outline btn-sm" disabled={act.busy} onClick={() => checkIn(o.id)}>
                  Đổi sang {o.name}
                </button>
              ))}
            </div>
            {options && options.some((o) => !o.available) && (
              <ul className="muted small" style={{ margin: 0 }}>
                {options.filter((o) => !o.available).map((o) => (
                  <li key={o.id}>
                    {o.name}: {o.reason ?? 'không nhận được giờ này'}
                  </li>
                ))}
              </ul>
            )}
            <div className="row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel('none')}>
                Quay lại
              </button>
            </div>
          </div>
        )}

        {panel === 'cancel' && (
          <div className="subpanel stack">
            <h3 className="step-title">Hủy lịch hẹn</h3>
            <label className="field">
              <span>Lý do hủy (bắt buộc)</span>
              <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Khách gọi báo bận" />
            </label>
            <div className="row">
              <button type="button" className="btn btn-danger btn-sm" disabled={act.busy} onClick={cancel}>
                Xác nhận hủy
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel('none')}>
                Quay lại
              </button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
