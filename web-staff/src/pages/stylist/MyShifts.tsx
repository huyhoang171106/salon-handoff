import { FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { shortDay, todayVN } from '../../lib/format';
import { addDays, mondayOf, useAction, useLoad } from '../../lib/util';
import type { LeaveRequest, Shift } from '../../lib/types';
import { LEAVE_STATUS } from '../../lib/labels';
import { ErrorAlert, Loading, OkAlert, PageHead, StatusBadge } from '../../components/ui';

/** Thợ xin nghỉ giữa ca: gửi yêu cầu, chủ salon duyệt thì mới áp dụng và xếp lại lịch khách. */
function LeaveForm({ shifts, onDone }: { shifts: Shift[]; onDone: () => void }) {
  const open = shifts.filter((s) => s.status === 'SCHEDULED' && !s.leaveStart && s.date >= todayVN());
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const act = useAction();
  const shift = open.find((s) => s.date === date) ?? open[0];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!shift || !from || !to) return act.setError('Chọn ngày và khoảng giờ nghỉ');
    const r = await act.run(
      () => api<LeaveRequest>('/shifts/mine/leave', { body: { date: shift.date, from, to, reason: reason.trim() || undefined } }),
      'Đã gửi yêu cầu nghỉ, chờ chủ salon duyệt.',
    );
    if (r) {
      setFrom('');
      setTo('');
      setReason('');
      onDone();
    }
  }

  return (
    <section className="card stack">
      <h2 className="section-title">Xin nghỉ giữa ca</h2>
      {open.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>Không còn ca nào có thể xin nghỉ.</p>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <div className="form-grid">
            <label className="field">
              <span>Ngày</span>
              <select className="input" value={shift?.date ?? ''} onChange={(e) => setDate(e.target.value)}>
                {open.map((s) => (
                  <option key={s.id} value={s.date}>
                    {shortDay(s.date)} · ca {s.startTime}–{s.endTime}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Nghỉ từ</span>
              <input className="input" type="time" step={900} min={shift?.startTime} max={shift?.endTime} value={from} onChange={(e) => setFrom(e.target.value)} required />
            </label>
            <label className="field">
              <span>Đến</span>
              <input className="input" type="time" step={900} min={shift?.startTime} max={shift?.endTime} value={to} onChange={(e) => setTo(e.target.value)} required />
            </label>
            <label className="field">
              <span>Lý do (không bắt buộc)</span>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: việc gia đình" />
            </label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Nghỉ từ đầu đến cuối ca = nghỉ cả ngày. Khi chủ salon duyệt, lịch khách trong khoảng nghỉ sẽ được chuyển cho stylist khác cùng giờ, hoặc dời sang giờ trống gần nhất; lễ tân sẽ hỏi lại khách khi họ tới.
          </p>
          <ErrorAlert error={act.error} />
          <OkAlert message={act.message} />
          <div className="row">
            <button type="submit" className="btn btn-gold btn-sm" disabled={act.busy}>
              Gửi xin nghỉ
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function WeekStrip({ start, shifts }: { start: string; shifts: Shift[] }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = todayVN();
  return (
    <ul className="week-strip">
      {days.map((d) => {
        const s = shifts.find((x) => x.date === d);
        const cls = s ? (s.status === 'ABSENT' ? 'absent' : 'on') : 'off';
        return (
          <li key={d} className={`week-day ${cls}${d === today ? ' today' : ''}`} aria-current={d === today ? 'date' : undefined}>
            <span className="small">{shortDay(d)}</span>
            <strong className="small">{s ? (s.status === 'ABSENT' ? 'Nghỉ đột xuất' : `${s.startTime}–${s.endTime}`) : 'Nghỉ'}</strong>
            {s?.leaveStart && <span className="small">Nghỉ {s.leaveStart}–{s.leaveEnd}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function MyShifts() {
  const mon = mondayOf(todayVN());
  const shifts = useLoad(() => api<Shift[]>('/shifts/mine', { query: { from: mon, to: addDays(mon, 13) } }));
  const leaves = useLoad(() => api<LeaveRequest[]>('/leave-requests/mine'));
  const list = shifts.data ?? [];
  const hours = list.filter((s) => s.status === 'SCHEDULED').reduce((t, s) => t + (Number(s.endTime.slice(0, 2)) * 60 + Number(s.endTime.slice(3)) - Number(s.startTime.slice(0, 2)) * 60 - Number(s.startTime.slice(3))) / 60, 0);
  return (
    <div className="page stack">
      <PageHead eyebrow={`${list.filter((s) => s.status === 'SCHEDULED').length} ca · ${hours} giờ trong 2 tuần`} title="Ca làm việc" />
      <ErrorAlert error={shifts.error} />
      {shifts.loading && !shifts.data && <Loading />}
      <section className="card stack">
        <h2 className="section-title">Tuần này</h2>
        <WeekStrip start={mon} shifts={list} />
      </section>
      <section className="card stack">
        <h2 className="section-title">Tuần sau</h2>
        <WeekStrip start={addDays(mon, 7)} shifts={list} />
      </section>
      <LeaveForm shifts={list} onDone={() => { shifts.reload(); leaves.reload(); }} />
      {(leaves.data ?? []).length > 0 && (
        <section className="card stack">
          <h2 className="section-title">Yêu cầu nghỉ của tôi</h2>
          <ul className="small" style={{ margin: 0 }}>
            {(leaves.data ?? []).slice(0, 10).map((r) => (
              <li key={r.id}>
                {shortDay(r.date)} {r.fromTime}–{r.toTime} <StatusBadge map={LEAVE_STATUS} value={r.status} />
                {r.handledNote && <span className="muted"> — {r.handledNote}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted small" style={{ margin: 0 }}>Muốn đổi giờ ca? Báo chủ salon để cập nhật.</p>
    </div>
  );
}
