import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { APPOINTMENT_STATUS, date, shortDay, time, todayVN, vnd } from '../../lib/format';
import { SESSION_STATUS } from '../../lib/labels';
import { customerName, useAction, useLoad } from '../../lib/util';
import type { Appointment, Customer, Service, Session, Shift } from '../../lib/types';
import { Modal } from '../../components/Overlay';
import { Empty, ErrorAlert, Field, Loading, OkAlert, PageHead, StatusBadge } from '../../components/ui';

interface StylistInfo {
  id: number;
  skills: { id: number }[];
}

export function MyDay() {
  const { user } = useAuth();
  const me = user!.employeeId!;
  const isStylist = user!.role === 'STYLIST';
  const today = todayVN();
  const appts = useLoad(() => api<Appointment[]>('/appointments/my-day', { query: { date: today } }));
  const sessions = useLoad(() => api<Session[]>('/sessions/mine'));
  const shift = useLoad(() => api<Shift[]>('/shifts/mine', { query: { from: today, to: today } }));
  const act = useAction();
  const [focus, setFocus] = useState<number | null>(null);
  const [propose, setPropose] = useState<Session | null>(null);

  const mySessions = sessions.data ?? [];
  const current = mySessions.find((s) => s.id === focus) ?? mySessions.find((s) => s.status === 'IN_SERVICE') ?? mySessions.find((s) => s.status === 'OPEN') ?? mySessions[0];
  const todayShift = shift.data?.[0];
  const visible = (appts.data ?? []).filter((a) => a.status !== 'CANCELLED');
  const reloadAll = () => {
    sessions.reload();
    appts.reload();
  };

  async function sessionAction(s: Session, path: 'start' | 'complete') {
    const r = await act.run(
      () => api<Session>(`/sessions/${s.id}/${path}`, { method: 'POST' }),
      path === 'start' ? `Đã bắt đầu phục vụ ${customerName(s.customer, s.walkInName)}.` : 'Đã gửi sang quầy. Hoa hồng được chốt khi hóa đơn thanh toán thành công.',
    );
    if (r) reloadAll();
  }

  return (
    <div className="page stack">
      <PageHead
        eyebrow={`${shortDay(today)} · ${todayShift ? (todayShift.status === 'ABSENT' ? 'Nghỉ hôm nay' : `Ca ${todayShift.startTime} – ${todayShift.endTime}`) : 'Không có ca hôm nay'}`}
        title={`Chào ${user!.name}, hôm nay bạn có ${visible.length} khách`}
      />
      <ErrorAlert error={act.error ?? appts.error ?? sessions.error} />
      <OkAlert message={act.message} />

      <div className="two-col">
        <section className="card stack" aria-label="Lịch hôm nay">
          <h2 className="section-title">Lịch hôm nay</h2>
          {appts.loading && !appts.data && <Loading />}
          {appts.data && visible.length === 0 && <p className="muted small">Hôm nay chưa có lịch hẹn nào của bạn.</p>}
          <ol className="lane">
            {visible.map((a) => {
              const mine = a.items.filter((i) => i.leadStylist.id === me || i.assistant?.id === me);
              const asLead = mine.some((i) => i.leadStylist.id === me);
              const start = asLead ? mine[0].startAt : mine[0]?.assistantStartAt ?? a.startAt;
              const end = asLead ? mine[mine.length - 1].endAt : mine[mine.length - 1]?.assistantEndAt ?? a.endAt;
              const st = APPOINTMENT_STATUS[a.status];
              return (
                <li key={a.id} className={`lane-item${a.status === 'CHECKED_IN' || a.status === 'IN_SERVICE' ? ' current' : ''}`}>
                  <div className="lane-time">
                    <strong>{time(start)}</strong>
                    <span className="muted small">{time(end)}</span>
                  </div>
                  <div className="stack" style={{ gap: 2 }}>
                    <strong>{a.customer.fullName}</strong>
                    <span className="small muted">
                      {mine.map((i) => i.service.name).join(' + ')}
                      {asLead ? '' : ` · hỗ trợ ${mine[0]?.leadStylist.fullName ?? ''}`}
                    </span>
                    <span className="row small" style={{ gap: 6 }}>
                      <span className={`badge ${st.tone}`}>{st.label}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="stack">
          {sessions.loading && !sessions.data && <Loading />}
          {sessions.data && mySessions.length === 0 && <Empty>Chưa có phiên phục vụ nào. Khi lễ tân check-in khách của bạn, phiên sẽ hiện ở đây.</Empty>}
          {mySessions.map((s) => {
            const items = s.items.filter((i) => i.status !== 'REMOVED');
            const editable = s.status === 'OPEN' || s.status === 'IN_SERVICE';
            return (
              <section key={s.id} className={`card stack session-card${current?.id === s.id ? ' is-current' : ''}`} aria-label={`Phiên ${s.code}`}>
                <div className="spread">
                  <span className="eyebrow">Phiên phục vụ {s.code}</span>
                  <StatusBadge map={SESSION_STATUS} value={s.status} />
                </div>
                <div className="stack" style={{ gap: 2 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <strong className="display big-name">{customerName(s.customer, s.walkInName)}</strong>
                    {s.customer?.isMember && <span className="badge gold">Thành viên</span>}
                  </div>
                  <span className="muted small">{s.appointment ? `Lịch ${time(s.appointment.startAt)} – ${time(s.appointment.endAt)}` : 'Khách walk-in'}</span>
                </div>
                <div className="line-list">
                  {items.map((i) => (
                    <div key={i.id} className="line">
                      <div className="stack" style={{ gap: 2 }}>
                        <span>{i.service.name}</span>
                        <span className="muted small">
                          {i.assignments
                            .map((a) => `${a.role === 'LEAD_STYLIST' ? 'Thợ chính' : 'Thợ phụ'}: ${a.employee.fullName}${a.employee.id === me ? ' (tôi)' : ''}`)
                            .join(' · ')}
                        </span>
                        {i.status === 'PROPOSED' && <span className="small tone-warn">Đề xuất · chờ khách xác nhận giá {vnd(i.agreedPrice)} tại quầy</span>}
                      </div>
                      <span className="small muted num">{i.service.durationMinutes} phút</span>
                    </div>
                  ))}
                </div>
                <div className="row">
                  {s.status === 'OPEN' && (
                    <button type="button" className="btn btn-gold btn-sm" disabled={act.busy} onClick={() => sessionAction(s, 'start')}>
                      Bắt đầu phục vụ
                    </button>
                  )}
                  {s.status === 'IN_SERVICE' && (
                    <button type="button" className="btn btn-gold btn-sm" disabled={act.busy} onClick={() => sessionAction(s, 'complete')}>
                      Hoàn tất & chuyển lễ tân lập hóa đơn
                    </button>
                  )}
                  {editable && isStylist && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setPropose(s)}>
                      Đề xuất thêm dịch vụ
                    </button>
                  )}
                  {s.customer && current?.id !== s.id && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFocus(s.id)}>
                      Xem hồ sơ tóc
                    </button>
                  )}
                </div>
                {s.status === 'AWAITING_PAYMENT' && <p className="small muted" role="status" style={{ margin: 0 }}>Đã gửi sang quầy. Hoa hồng được chốt khi hóa đơn thanh toán thành công.</p>}
              </section>
            );
          })}
        </div>
      </div>

      {current?.customer && <HairNotes key={current.customer.id} customerId={current.customer.id} canEdit={isStylist} />}
      {propose && <ProposeDialog session={propose} me={me} onClose={() => setPropose(null)} onDone={() => { setPropose(null); reloadAll(); act.setMessage('Đã gửi đề xuất. Lễ tân sẽ ghi nhận khách đồng ý giá tại quầy.'); }} />}
    </div>
  );
}

function HairNotes({ customerId, canEdit }: { customerId: number; canEdit: boolean }) {
  const d = useLoad(() => api<{ customer: Customer; invoices: { id: number; code: string; paidAt: string; items: { description: string }[]; stylists: string[] }[] }>(`/customers/${customerId}`), [customerId]);
  const [notes, setNotes] = useState('');
  const act = useAction();
  useEffect(() => setNotes(d.data?.customer.hairNotes ?? ''), [d.data]);
  if (!d.data) return d.loading ? <Loading /> : <ErrorAlert error={d.error} />;
  const c = d.data.customer;
  async function save(e: FormEvent) {
    e.preventDefault();
    if (await act.run(() => api(`/customers/${customerId}`, { method: 'PATCH', body: { hairNotes: notes } }), 'Đã lưu ghi chú tóc')) d.reload();
  }
  return (
    <section className="card stack" aria-label="Ghi chú tóc của khách">
      <div className="spread">
        <h2 className="section-title">Hồ sơ tóc · {c.fullName}</h2>
        <span className="badge neutral">Chỉ nội bộ</span>
      </div>
      {c.noShowCount > 0 && <span className="small tone-warn">Khách đã vắng mặt {c.noShowCount} lần</span>}
      <form className="stack" onSubmit={save}>
        <Field label="Ghi chú tóc / công thức màu">
          <textarea className="input" rows={4} value={notes} readOnly={!canEdit} onChange={(e) => setNotes(e.target.value)} placeholder={canEdit ? 'VD: Chân tóc 6.1 + 7.0 (1:1) · oxy 6% · 35 phút' : 'Chưa có ghi chú'} />
        </Field>
        <ErrorAlert error={act.error} />
        <OkAlert message={act.message} />
        {canEdit && (
          <div>
            <button type="submit" className="btn btn-outline btn-sm" disabled={act.busy}>Ghi công thức hôm nay</button>
          </div>
        )}
      </form>
      {d.data.invoices.length > 0 && (
        <details>
          <summary className="small">Lịch sử dịch vụ ({d.data.invoices.length} lần)</summary>
          <ul className="plain-list stack" style={{ gap: 6, marginTop: 8 }}>
            {d.data.invoices.slice(0, 5).map((i) => (
              <li key={i.id} className="small">
                {i.paidAt ? date(i.paidAt) : ''} · {i.items.map((x) => x.description).join(', ')} · {i.stylists.join(', ')}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ProposeDialog({ session, me, onClose, onDone }: { session: Session; me: number; onClose: () => void; onDone: () => void }) {
  const services = useLoad(() => Promise.all([api<Service[]>('/services'), api<StylistInfo[]>('/stylists')]));
  const [serviceId, setServiceId] = useState<number | ''>('');
  const [price, setPrice] = useState('');
  const act = useAction();
  const [all, stylists] = services.data ?? [[], []];
  const mySkills = new Set((stylists.find((s) => s.id === me)?.skills ?? []).map((s) => s.id));
  const options = all.filter((s) => s.status === 'ACTIVE' && (mySkills.size === 0 || mySkills.has(s.id)));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!serviceId) return act.setError('Chọn dịch vụ');
    if (await act.run(() => api(`/sessions/${session.id}/items`, { body: { serviceId, agreedPrice: price ? Number(price) : undefined } }))) onDone();
  }
  return (
    <Modal
      title="Đề xuất thêm dịch vụ"
      eyebrow={`Phiên ${session.code} · ${customerName(session.customer, session.walkInName)}`}
      onClose={onClose}
      footer={<><button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button><button type="submit" form="propose" className="btn btn-gold" disabled={act.busy}>Gửi đề xuất</button></>}
    >
      <form id="propose" className="stack" onSubmit={submit}>
        {services.loading && <Loading />}
        <Field label="Dịch vụ (theo chuyên môn của bạn)">
          <select className="input" value={serviceId} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : ''; setServiceId(id); setPrice(String(all.find((s) => s.id === id)?.basePrice ?? '')); }}>
            <option value="">— Chọn dịch vụ —</option>
            {options.map((s) => <option key={s.id} value={s.id}>{s.name} · {vnd(s.basePrice)} · {s.durationMinutes} phút</option>)}
          </select>
        </Field>
        <Field label="Giá báo khách (₫)" hint="Khách xác nhận giá tại quầy trước khi hoàn tất.">
          <input className="input" type="number" min={0} step={1000} value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}
