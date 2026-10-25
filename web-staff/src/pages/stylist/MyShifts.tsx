import { api } from '../../lib/api';
import { shortDay, todayVN } from '../../lib/format';
import { addDays, mondayOf, useLoad } from '../../lib/util';
import type { Shift } from '../../lib/types';
import { ErrorAlert, Loading, PageHead } from '../../components/ui';

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
          </li>
        );
      })}
    </ul>
  );
}

export function MyShifts() {
  const mon = mondayOf(todayVN());
  const shifts = useLoad(() => api<Shift[]>('/shifts/mine', { query: { from: mon, to: addDays(mon, 13) } }));
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
      <p className="muted small" style={{ margin: 0 }}>Muốn đổi ca hoặc nghỉ đột xuất? Báo chủ salon để cập nhật — lịch khách sẽ được lễ tân sắp xếp lại.</p>
    </div>
  );
}
