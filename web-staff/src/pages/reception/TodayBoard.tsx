import { CSSProperties, FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { APPOINTMENT_STATUS, shortDay, time, todayVN } from '../../lib/format';
import { addDays, hhmm, nowMinutesVN, useLoad, vnMinutes } from '../../lib/util';
import type { Appointment, Employee, Shift } from '../../lib/types';
import { ErrorAlert, Loading, OkAlert, PageHead } from '../../components/ui';
import { AppointmentDrawer } from './AppointmentDrawer';
import { BookingModal, WalkInModal } from './BookingModals';

const OPEN = 8 * 60;
const CLOSE = 20 * 60;
const STEP = 15; // mỗi hàng lưới = 15 phút
const ROWS = (CLOSE - OPEN) / STEP;
const ROW_H = 26;
const HEAD_H = 56;

const SHORT: Record<string, string> = {
  BOOKED: 'Chờ duyệt',
  CONFIRMED: 'Xác nhận',
  LATE: 'Trễ',
  CHECKED_IN: 'Check-in',
  IN_SERVICE: 'Đang làm',
  COMPLETED: 'Xong',
  CANCELLED: 'Hủy',
  NO_SHOW: 'Vắng',
};

const LEGEND = [
  { s: 'COMPLETED', t: 'Hoàn thành' },
  { s: 'IN_SERVICE', t: 'Đang phục vụ / check-in' },
  { s: 'CONFIRMED', t: 'Đã xác nhận' },
  { s: 'BOOKED', t: 'Chờ xác nhận' },
  { s: 'LATE', t: 'Đến trễ' },
  { s: 'NO_SHOW', t: 'Vắng mặt' },
];

interface Block {
  key: string;
  appt: Appointment;
  stylistId: number;
  start: number;
  end: number;
  services: string;
  assistants: string[];
  lane: number;
  lanes: number;
}

const rowOf = (min: number) => Math.max(0, Math.min(ROWS, Math.round((min - OPEN) / STEP))) + 2;

function buildBlocks(appts: Appointment[]): Block[] {
  const blocks: Block[] = [];
  for (const a of appts) {
    if (a.status === 'CANCELLED') continue;
    const byLead = new Map<number, Appointment['items']>();
    a.items.forEach((i) => byLead.set(i.leadStylist.id, [...(byLead.get(i.leadStylist.id) ?? []), i]));
    byLead.forEach((items, sid) =>
      blocks.push({
        key: `${a.id}-${sid}`,
        appt: a,
        stylistId: sid,
        start: Math.min(...items.map((i) => vnMinutes(i.startAt))),
        end: Math.max(...items.map((i) => vnMinutes(i.endAt))),
        services: items.map((i) => i.service.name).join(' + '),
        assistants: [...new Set(items.filter((i) => i.assistant).map((i) => i.assistant!.fullName))],
        lane: 0,
        lanes: 1,
      }),
    );
  }
  // Chia làn khi các khối trong cùng cột chồng nhau (vd lịch vắng mặt và lịch mới cùng giờ)
  const byCol = new Map<number, Block[]>();
  blocks.forEach((b) => byCol.set(b.stylistId, [...(byCol.get(b.stylistId) ?? []), b]));
  byCol.forEach((list) => {
    list.sort((x, y) => x.start - y.start);
    let group: Block[] = [];
    let groupEnd = -1;
    const flush = () => {
      const laneEnds: number[] = [];
      group.forEach((b) => {
        let l = laneEnds.findIndex((e) => e <= b.start);
        if (l < 0) l = laneEnds.length;
        laneEnds[l] = b.end;
        b.lane = l;
      });
      group.forEach((b) => (b.lanes = laneEnds.length));
    };
    list.forEach((b) => {
      if (b.start >= groupEnd && group.length) {
        flush();
        group = [];
      }
      group.push(b);
      groupEnd = Math.max(groupEnd, b.end);
    });
    if (group.length) flush();
  });
  return blocks;
}

export function TodayBoard() {
  const navigate = useNavigate();
  const [day, setDay] = useState(todayVN());
  const [selected, setSelected] = useState<number | null>(null);
  const [modal, setModal] = useState<'none' | 'booking' | 'walkin'>('none');
  const [flash, setFlash] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [now, setNow] = useState(nowMinutesVN());

  const board = useLoad(
    () =>
      Promise.all([
        api<Appointment[]>('/appointments', { query: { date: day } }),
        api<Shift[]>('/shifts', { query: { from: day, to: day } }),
        api<Employee[]>('/employees'),
      ]),
    [day],
  );
  const { reload } = board;

  useEffect(() => {
    const t = setInterval(() => {
      setNow(nowMinutesVN());
      reload();
    }, 60000);
    return () => clearInterval(t);
  }, [reload]);

  const [appts, shifts, employees] = board.data ?? [[], [], []];
  const isToday = day === todayVN();

  const columns = useMemo(() => {
    const ids = new Set<number>();
    shifts.filter((s) => s.employee.position === 'STYLIST').forEach((s) => ids.add(s.employee.id));
    appts.forEach((a) => a.items.forEach((i) => ids.add(i.leadStylist.id)));
    return [...ids]
      .map((id) => ({ emp: employees.find((e) => e.id === id) ?? shifts.find((s) => s.employee.id === id)?.employee, shift: shifts.find((s) => s.employee.id === id) }))
      .filter((c): c is { emp: Employee; shift: Shift | undefined } => !!c.emp)
      .sort((a, b) => a.emp.id - b.emp.id);
  }, [shifts, appts, employees]);

  const blocks = useMemo(() => buildBlocks(appts), [appts]);
  const cancelled = appts.filter((a) => a.status === 'CANCELLED');
  const assistantsOnShift = shifts.filter((s) => s.employee.position === 'ASSISTANT');
  const selectedAppt = appts.find((a) => a.id === selected) ?? null;

  const active = (a: Appointment) => a.status === 'IN_SERVICE' || a.status === 'CHECKED_IN';
  function stylistState(emp: Employee, shift?: Shift): { t: string; tone: string } {
    if (!shift) return { t: 'Không có ca', tone: 'muted' };
    if (shift.status === 'ABSENT') return { t: 'Nghỉ', tone: 'muted' };
    if (!isToday) return { t: `Ca ${shift.startTime}–${shift.endTime}`, tone: 'muted' };
    if (blocks.some((b) => b.stylistId === emp.id && active(b.appt))) return { t: 'Đang phục vụ', tone: 'info' };
    if (blocks.some((b) => b.stylistId === emp.id && b.appt.status === 'LATE')) return { t: 'Chờ khách trễ', tone: 'warn' };
    if (now < Number(shift.startTime.slice(0, 2)) * 60 || now >= Number(shift.endTime.slice(0, 2)) * 60) return { t: `Ca ${shift.startTime}–${shift.endTime}`, tone: 'muted' };
    return { t: 'Sẵn sàng', tone: 'ok' };
  }

  function assistantState(s: Shift): { t: string; tone: string } {
    if (s.status === 'ABSENT') return { t: 'nghỉ hôm nay', tone: 'neutral' };
    const items = appts
      .filter((a) => !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(a.status))
      .flatMap((a) => a.items.filter((i) => i.assistant?.id === s.employee.id && i.assistantStartAt).map((i) => ({ a, i })));
    if (isToday) {
      const cur = items.find(({ a, i }) => active(a) && vnMinutes(i.assistantStartAt!) <= now && now < vnMinutes(i.assistantEndAt!));
      if (cur) return { t: `đang hỗ trợ ${cur.a.customer.fullName} (tới ${time(cur.i.assistantEndAt!)})`, tone: 'info' };
      const next = items.filter(({ i }) => vnMinutes(i.assistantStartAt!) > now).sort((x, y) => vnMinutes(x.i.assistantStartAt!) - vnMinutes(y.i.assistantStartAt!))[0];
      if (next) return { t: `sẵn sàng · lượt kế tiếp ${time(next.i.assistantStartAt!)} (${next.a.customer.fullName})`, tone: 'ok' };
      return { t: 'sẵn sàng', tone: 'ok' };
    }
    return { t: `ca ${s.startTime}–${s.endTime} · ${items.length} lượt hỗ trợ`, tone: 'neutral' };
  }

  const counts = {
    total: appts.filter((a) => a.status !== 'CANCELLED').length,
    pending: appts.filter((a) => a.status === 'BOOKED').length,
    serving: appts.filter(active).length,
    late: appts.filter((a) => a.status === 'LATE').length,
  };

  function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim()) navigate(`/khach-hang?q=${encodeURIComponent(q.trim())}`);
  }

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `56px repeat(${Math.max(columns.length, 1)}, minmax(150px, 1fr))`,
    gridTemplateRows: `${HEAD_H}px repeat(${ROWS}, ${ROW_H}px)`,
    minWidth: 56 + Math.max(columns.length, 1) * 150,
  };

  return (
    <div className="page stack">
      <PageHead
        eyebrow={`${shortDay(day)}${isToday ? ` · Bây giờ ${hhmm(now)}` : ''}`}
        title={isToday ? 'Lịch hôm nay theo stylist' : `Lịch ngày ${day.split('-').reverse().join('/')}`}
        actions={
          <>
            <form className="row" onSubmit={search} role="search" style={{ gap: 8 }}>
              <label htmlFor="board-search" className="sr-only">
                Tìm khách theo tên hoặc số điện thoại
              </label>
              <input id="board-search" className="input search-input" type="search" placeholder="Tìm khách / SĐT" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
            <button type="button" className="btn btn-outline" onClick={() => setModal('walkin')}>
              + Khách walk-in
            </button>
            <button type="button" className="btn btn-gold" onClick={() => setModal('booking')}>
              + Đặt lịch
            </button>
          </>
        }
      />

      <div className="spread">
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setDay(addDays(day, -1))} aria-label="Ngày trước">
            ‹ Trước
          </button>
          <label className="sr-only" htmlFor="board-date">
            Chọn ngày
          </label>
          <input id="board-date" className="input date-input" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setDay(addDays(day, 1))} aria-label="Ngày sau">
            Sau ›
          </button>
          {!isToday && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDay(todayVN())}>
              Hôm nay
            </button>
          )}
        </div>
        <div className="row small muted" aria-live="polite">
          <span>{counts.total} lịch</span>
          <span>· {counts.pending} chờ xác nhận</span>
          <span>· {counts.serving} đang phục vụ</span>
          {counts.late > 0 && <span className="badge warn">{counts.late} đến trễ</span>}
        </div>
      </div>

      <div className="legend" aria-label="Chú thích màu">
        {LEGEND.map((l) => (
          <span key={l.s} className="legend-item">
            <span className={`dot st-dot-${l.s}`} aria-hidden="true" />
            {l.t}
          </span>
        ))}
      </div>

      <OkAlert message={flash} />
      <ErrorAlert error={board.error} />
      {board.loading && !board.data && <Loading />}

      {board.data && (
        <div className="timetable-box" role="region" aria-label="Bảng lịch theo stylist" tabIndex={0}>
          {columns.length === 0 ? (
            <div className="empty">Không có stylist nào có ca trong ngày này.</div>
          ) : (
            <div className="timetable" style={gridStyle}>
              <div className="tt-corner" style={{ gridColumn: 1, gridRow: 1 }} />
              {columns.map((c, idx) => {
                const st = stylistState(c.emp, c.shift);
                return (
                  <div key={c.emp.id} className="tt-head" style={{ gridColumn: idx + 2, gridRow: 1 }}>
                    <span className="tt-name">{c.emp.fullName}</span>
                    <span className={`small tone-${st.tone}`}>{st.t}</span>
                  </div>
                );
              })}
              {Array.from({ length: ROWS / 2 }, (_, r) => (
                <div key={`t${r}`} className="tt-time" style={{ gridColumn: 1, gridRow: `${r * 2 + 2} / span 2` }}>
                  {hhmm(OPEN + r * 30)}
                </div>
              ))}
              {columns.map((c, idx) =>
                Array.from({ length: ROWS / 2 }, (_, r) => <div key={`c${c.emp.id}-${r}`} className="tt-cell" style={{ gridColumn: idx + 2, gridRow: `${r * 2 + 2} / span 2` }} />),
              )}
              {columns.map((c, idx) => {
                if (!c.shift || c.shift.status === 'ABSENT') {
                  return (
                    <div key={`off${c.emp.id}`} className="tt-off" style={{ gridColumn: idx + 2, gridRow: `2 / ${ROWS + 2}` }}>
                      {c.shift ? 'Nghỉ — không nhận lịch' : 'Không có ca'}
                    </div>
                  );
                }
                const s = Number(c.shift.startTime.slice(0, 2)) * 60 + Number(c.shift.startTime.slice(3));
                const e = Number(c.shift.endTime.slice(0, 2)) * 60 + Number(c.shift.endTime.slice(3));
                return [
                  s > OPEN && <div key={`pre${c.emp.id}`} className="tt-offshift" style={{ gridColumn: idx + 2, gridRow: `2 / ${rowOf(s)}` }} aria-hidden="true" />,
                  e < CLOSE && <div key={`post${c.emp.id}`} className="tt-offshift" style={{ gridColumn: idx + 2, gridRow: `${rowOf(e)} / ${ROWS + 2}` }} aria-hidden="true" />,
                ];
              })}
              {blocks.map((b) => {
                const col = columns.findIndex((c) => c.emp.id === b.stylistId) + 2;
                const r1 = rowOf(b.start);
                const r2 = Math.max(rowOf(b.end), r1 + 1);
                return (
                  <button
                    key={b.key}
                    type="button"
                    className={`tt-block st-${b.appt.status}`}
                    style={{ gridColumn: col, gridRow: `${r1} / ${r2}`, ['--lane' as string]: b.lane, ['--lanes' as string]: b.lanes }}
                    onClick={() => setSelected(b.appt.id)}
                    aria-label={`${b.appt.customer.fullName}, ${time(b.appt.startAt)} đến ${time(b.appt.endAt)}, ${b.services}, ${APPOINTMENT_STATUS[b.appt.status].label}`}
                  >
                    <span className="tt-block-top">
                      <span className="tt-client">{b.appt.source === 'WALK_IN' ? 'Walk-in: ' : ''}{b.appt.customer.fullName}</span>
                      <span className="tt-status">{SHORT[b.appt.status]}{b.appt.stylistChangeNote ? ' · Đổi thợ' : ''}</span>
                    </span>
                    <span className="tt-svc">
                      {hhmm(b.start)} · {b.services}
                      {b.assistants.length ? ` · thợ phụ ${b.assistants.join(', ')}` : ''}
                    </span>
                  </button>
                );
              })}
              {isToday && now >= OPEN && now <= CLOSE && (
                <div className="tt-now" style={{ top: HEAD_H + ((now - OPEN) / STEP) * ROW_H }} aria-hidden="true">
                  <span>{hhmm(now)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {assistantsOnShift.length > 0 && (
        <section className="card tight assistant-strip" aria-label="Thợ phụ">
          <span className="eyebrow">Thợ phụ</span>
          {assistantsOnShift.map((s) => {
            const st = assistantState(s);
            return (
              <span key={s.id} className="row" style={{ gap: 8 }}>
                <span className={`badge ${st.tone}`}>{st.tone === 'info' ? 'Đang làm' : st.tone === 'ok' ? 'Rảnh' : s.status === 'ABSENT' ? 'Nghỉ' : 'Có ca'}</span>
                <span>
                  {s.employee.fullName} — {st.t}
                </span>
              </span>
            );
          })}
        </section>
      )}

      {cancelled.length > 0 && (
        <details className="card tight">
          <summary className="small">Lịch đã hủy trong ngày ({cancelled.length})</summary>
          <ul className="plain-list">
            {cancelled.map((a) => (
              <li key={a.id}>
                <button type="button" className="link-btn" onClick={() => setSelected(a.id)}>
                  {time(a.startAt)} · {a.customer.fullName} · {a.code}
                </button>
                <span className="muted small"> — {a.statusReason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {selectedAppt && <AppointmentDrawer key={selectedAppt.id} appt={selectedAppt} employees={employees} onClose={() => setSelected(null)} onChanged={reload} />}
      {modal === 'booking' && (
        <BookingModal
          defaultDate={day}
          onClose={() => setModal('none')}
          onDone={(a) => {
            setModal('none');
            setFlash(`Đã đặt lịch ${a.code} cho ${a.customer.fullName} lúc ${time(a.startAt)}.`);
            const d = new Date(new Date(a.startAt).getTime() + 7 * 3600000).toISOString().slice(0, 10);
            if (d !== day) setDay(d);
            else reload();
            setSelected(a.id);
          }}
        />
      )}
      {modal === 'walkin' && (
        <WalkInModal
          onClose={() => setModal('none')}
          onDone={(s) => {
            setModal('none');
            setFlash(`Đã tiếp nhận walk-in, tạo phiên ${s.code}.`);
            if (day !== todayVN()) setDay(todayVN());
            else reload();
          }}
        />
      )}
    </div>
  );
}
