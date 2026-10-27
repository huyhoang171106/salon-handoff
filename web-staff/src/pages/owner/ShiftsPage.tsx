import { FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { shortDay, todayVN } from '../../lib/format';
import { POSITION_LABEL } from '../../lib/labels';
import { addDays, mondayOf, useAction, useLoad } from '../../lib/util';
import { useEmployees } from '../../lib/data';
import type { Employee, LeaveRequest, Shift } from '../../lib/types';
import { Modal } from '../../components/Overlay';
import { ErrorAlert, Field, Loading, OkAlert, PageHead, Section } from '../../components/ui';

const WEEKDAYS = [
  { v: 1, l: 'T2' }, { v: 2, l: 'T3' }, { v: 3, l: 'T4' }, { v: 4, l: 'T5' }, { v: 5, l: 'T6' }, { v: 6, l: 'T7' }, { v: 0, l: 'CN' },
];

/** Yêu cầu nghỉ giữa ca đang chờ duyệt; duyệt thì áp dụng vào ca và xếp lại lịch khách. */
function LeaveRequests({ onDone }: { onDone: () => void }) {
  const list = useLoad(() => api<LeaveRequest[]>('/leave-requests', { query: { status: 'PENDING' } }));
  const act = useAction();
  const pending = list.data ?? [];
  if (pending.length === 0) return null;
  async function decide(r: LeaveRequest, verb: 'approve' | 'reject') {
    const note = verb === 'reject' ? window.prompt('Lý do từ chối (không bắt buộc)') ?? undefined : undefined;
    const res = await act.run(
      () => api<{ rearranged?: unknown[] }>(`/leave-requests/${r.id}/${verb}`, { body: { note: note?.trim() || undefined } }),
      (x) => (verb === 'approve' ? `Đã duyệt nghỉ. ${x.rearranged?.length ?? 0} lịch khách được xếp lại.` : 'Đã từ chối.'),
    );
    if (res) { list.reload(); onDone(); }
  }
  return (
    <Section title={`Yêu cầu nghỉ chờ duyệt (${pending.length})`}>
      <ErrorAlert error={act.error ?? list.error} />
      <OkAlert message={act.message} />
      <ul className="stack" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {pending.map((r) => (
          <li key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              <strong>{r.employee.fullName}</strong> · {shortDay(r.date)} {r.fromTime}–{r.toTime}
              {r.reason && <span className="muted"> — {r.reason}</span>}
            </span>
            <span className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-outline btn-sm" disabled={act.busy} onClick={() => decide(r, 'reject')}>Từ chối</button>
              <button type="button" className="btn btn-gold btn-sm" disabled={act.busy} onClick={() => decide(r, 'approve')}>Duyệt</button>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

type Edit = { emp: Employee; date: string; shift?: Shift };

export function ShiftsPage() {
  const [week, setWeek] = useState(mondayOf(todayVN()));
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const emps = useEmployees();
  const shifts = useLoad(() => api<Shift[]>('/shifts', { query: { from: days[0], to: days[6] } }), [week]);
  const [edit, setEdit] = useState<Edit | null>(null);
  const staff = (emps.data ?? []).filter((e) => e.position !== 'OWNER' && e.status !== 'INACTIVE');

  return (
    <div className="page stack">
      <PageHead
        eyebrow={`Tuần ${days[0].split('-').reverse().join('/')} – ${days[6].split('-').reverse().join('/')}`}
        title="Ca làm việc"
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setWeek(addDays(week, -7))}>‹ Tuần trước</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeek(mondayOf(todayVN()))}>Tuần này</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setWeek(addDays(week, 7))}>Tuần sau ›</button>
          </div>
        }
      />
      <LeaveRequests onDone={shifts.reload} />
      <ErrorAlert error={shifts.error ?? emps.error} />
      {(shifts.loading && !shifts.data) || (emps.loading && !emps.data) ? <Loading /> : null}
      <div className="card flush table-wrap">
        <table className="table shift-table">
          <thead>
            <tr>
              <th>Nhân viên</th>
              {days.map((d) => <th key={d} className={d === todayVN() ? 'is-today' : ''}>{shortDay(d)}</th>)}
            </tr>
          </thead>
          <tbody>
            {staff.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.fullName}
                  <div className="muted small">{POSITION_LABEL[e.position]}</div>
                </td>
                {days.map((d) => {
                  const s = (shifts.data ?? []).find((x) => x.employee.id === e.id && x.date === d);
                  return (
                    <td key={d}>
                      <button
                        type="button"
                        className={`shift-cell${s ? (s.status === 'ABSENT' ? ' absent' : ' on') : ''}`}
                        onClick={() => setEdit({ emp: e, date: d, shift: s })}
                        aria-label={`${e.fullName} ${shortDay(d)}: ${s ? (s.status === 'ABSENT' ? 'nghỉ đột xuất' : `${s.startTime}–${s.endTime}`) : 'chưa có ca, bấm để thêm'}`}
                      >
                        {s ? (s.status === 'ABSENT' ? 'Nghỉ' : `${s.startTime}–${s.endTime}`) : '+'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ margin: 0 }}>Bấm vào ô để thêm, sửa giờ hoặc báo nghỉ đột xuất. Lịch khách của ca nghỉ cần lễ tân sắp xếp lại.</p>
      <BulkForm staff={staff} onDone={() => shifts.reload()} />
      {edit && <ShiftDialog edit={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); shifts.reload(); }} />}
    </div>
  );
}

function ShiftDialog({ edit, onClose, onDone }: { edit: Edit; onClose: () => void; onDone: () => void }) {
  const s = edit.shift;
  const [start, setStart] = useState(s?.startTime ?? '08:00');
  const [end, setEnd] = useState(s?.endTime ?? '17:00');
  const [note, setNote] = useState(s?.note ?? '');
  const act = useAction();
  const save = async (status?: 'SCHEDULED' | 'ABSENT') => {
    const r = await act.run(() =>
      s
        ? api(`/shifts/${s.id}`, { method: 'PATCH', body: { startTime: start, endTime: end, note: note || undefined, status: status ?? s.status } })
        : api('/shifts', { body: { employeeId: edit.emp.id, date: edit.date, startTime: start, endTime: end, note: note || undefined } }),
    );
    if (r) onDone();
  };
  return (
    <Modal
      title={`${edit.emp.fullName} · ${shortDay(edit.date)}`}
      eyebrow={s ? (s.status === 'ABSENT' ? 'Đang báo nghỉ' : 'Sửa ca') : 'Thêm ca'}
      onClose={onClose}
      footer={
        <>
          {s && (
            <button type="button" className="btn btn-ghost" disabled={act.busy} onClick={async () => { if (await act.run(() => api(`/shifts/${s.id}`, { method: 'DELETE' }))) onDone(); }}>
              Xóa ca
            </button>
          )}
          {s && s.status === 'SCHEDULED' && <button type="button" className="btn btn-danger" disabled={act.busy} onClick={() => save('ABSENT')}>Báo nghỉ đột xuất</button>}
          {s && s.status === 'ABSENT' && <button type="button" className="btn btn-outline" disabled={act.busy} onClick={() => save('SCHEDULED')}>Đi làm lại</button>}
          <button type="button" className="btn btn-gold" disabled={act.busy} onClick={() => save()}>Lưu</button>
        </>
      }
    >
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="form-grid">
          <Field label="Bắt đầu"><input className="input" type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Kết thúc"><input className="input" type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Ghi chú"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}

function BulkForm({ staff, onDone }: { staff: Employee[]; onDone: () => void }) {
  const [ids, setIds] = useState<number[]>([]);
  const [from, setFrom] = useState(todayVN());
  const [to, setTo] = useState(addDays(todayVN(), 13));
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('17:00');
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ids.length) return act.setError('Chọn ít nhất một nhân viên');
    if (!weekdays.length) return act.setError('Chọn ít nhất một thứ trong tuần');
    const r = await act.run(
      () => api<{ created: number }>('/shifts/bulk', { body: { employeeIds: ids, from, to, weekdays, startTime: start, endTime: end } }),
      (x) => `Đã tạo ${x.created} ca (bỏ qua ngày đã có ca).`,
    );
    if (r) onDone();
  }
  return (
    <Section title="Tạo ca hàng loạt">
      <form className="stack" onSubmit={submit}>
        <fieldset className="plain-fieldset">
          <legend className="lbl">Nhân viên</legend>
          <div className="check-grid">
            {staff.map((s) => (
              <label key={s.id} className="check">
                <input type="checkbox" checked={ids.includes(s.id)} onChange={(e) => setIds(e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id))} />
                <span className="small">{s.fullName}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="plain-fieldset">
          <legend className="lbl">Các thứ trong tuần</legend>
          <div className="row" style={{ gap: 6 }}>
            {WEEKDAYS.map((w) => (
              <button key={w.v} type="button" className="pick pick-day" aria-pressed={weekdays.includes(w.v)} onClick={() => setWeekdays(weekdays.includes(w.v) ? weekdays.filter((x) => x !== w.v) : [...weekdays, w.v])}>
                {w.l}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="form-grid">
          <Field label="Từ ngày"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Đến ngày"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Giờ bắt đầu"><input className="input" type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Giờ kết thúc"><input className="input" type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <ErrorAlert error={act.error} />
        <OkAlert message={act.message} />
        <div><button type="submit" className="btn btn-gold btn-sm" disabled={act.busy}>Tạo ca</button></div>
      </form>
    </Section>
  );
}
