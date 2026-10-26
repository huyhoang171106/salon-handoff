import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { time, vnd } from '../../lib/format';
import { ASSIGN_ROLE, ITEM_STATUS, SESSION_STATUS } from '../../lib/labels';
import { customerName, useAction, useLoad } from '../../lib/util';
import { useEmployees, useServices } from '../../lib/data';
import type { Employee, Invoice, Service, Session, SessionItem } from '../../lib/types';
import { Modal } from '../../components/Overlay';
import { Empty, ErrorAlert, Loading, OkAlert, PageHead, StatusBadge } from '../../components/ui';

type Dialog =
  | { kind: 'confirm'; item: SessionItem }
  | { kind: 'remove'; item: SessionItem }
  | { kind: 'assign'; item: SessionItem }
  | { kind: 'add'; session: Session }
  | { kind: 'cancel'; session: Session }
  | null;

export function assignmentText(i: SessionItem): string {
  const lead = i.assignments.filter((a) => a.role === 'LEAD_STYLIST').map((a) => a.employee.fullName);
  const asst = i.assignments.filter((a) => a.role === 'ASSISTANT').map((a) => a.employee.fullName);
  return [lead.length ? `Thợ chính: ${lead.join(', ')}` : 'Chưa có thợ chính', asst.length ? `Thợ phụ: ${asst.join(', ')}` : ''].filter(Boolean).join(' · ');
}

/** Phiên phục vụ đang mở (lễ tân điều phối). */
export function SessionsPage() {
  const navigate = useNavigate();
  const sessions = useLoad(() => api<Session[]>('/sessions'));
  const freeChairs = useLoad(() => api<string[]>('/sessions/chairs/free'));
  const emps = useEmployees();
  const services = useServices();
  const act = useAction();
  const [dialog, setDialog] = useState<Dialog>(null);

  async function sessionAction(s: Session, path: 'start' | 'complete') {
    const r = await act.run(() => api<Session>(`/sessions/${s.id}/${path}`, { method: 'POST' }), path === 'start' ? `Phiên ${s.code} bắt đầu phục vụ` : `Phiên ${s.code} đã hoàn tất, chờ thanh toán`);
    if (r) sessions.reload();
  }

  async function setChair(s: Session, chair: string) {
    const r = await act.run(() => api<Session>(`/sessions/${s.id}/chair`, { method: 'PATCH', body: { chair: chair || null } }), `Phiên ${s.code}: ${chair ? 'xếp ghế ' + chair : 'đã gỡ ghế'}`);
    if (r) {
      sessions.reload();
      freeChairs.reload();
    }
  }

  async function invoice(s: Session) {
    const r = await act.run(() => api<Invoice>(`/sessions/${s.id}/invoice`, { method: 'POST' }));
    if (r) navigate(`/hoa-don/${r.id}`);
  }

  const list = sessions.data ?? [];
  const proposed = list.reduce((n, s) => n + s.items.filter((i) => i.status === 'PROPOSED').length, 0);

  return (
    <div className="page stack">
      <PageHead
        eyebrow={`${list.length} phiên đang mở${proposed ? ` · ${proposed} đề xuất chờ khách` : ''}`}
        title="Phiên phục vụ"
        sub="Dịch vụ phát sinh do stylist đề xuất cần lễ tân ghi nhận khách đồng ý giá trước khi hoàn tất."
        actions={
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { sessions.reload(); freeChairs.reload(); }}>
            Làm mới
          </button>
        }
      />
      <ErrorAlert error={sessions.error ?? act.error} />
      <OkAlert message={act.message} />
      {sessions.loading && !sessions.data && <Loading />}
      {sessions.data && list.length === 0 && <Empty>Chưa có phiên phục vụ nào đang mở. Check-in lịch hẹn hoặc tiếp nhận walk-in để tạo phiên.</Empty>}

      <div className="grid" style={{ ['--min' as string]: '360px' }}>
        {list.map((s) => {
          const editable = s.status === 'OPEN' || s.status === 'IN_SERVICE';
          const items = s.items.filter((i) => i.status !== 'REMOVED');
          const removed = s.items.filter((i) => i.status === 'REMOVED');
          const total = items.reduce((t, i) => t + i.agreedPrice, 0);
          return (
            <article key={s.id} className="card stack session-card" aria-label={`Phiên ${s.code}`}>
              <div className="spread">
                <span className="eyebrow">Phiên {s.code}</span>
                <StatusBadge map={SESSION_STATUS} value={s.status} />
              </div>
              <div className="stack" style={{ gap: 2 }}>
                <div className="row" style={{ gap: 8 }}>
                  <strong className="display big-name">{customerName(s.customer, s.walkInName)}</strong>
                  {s.customer?.isMember && <span className="badge gold">Thành viên</span>}
                </div>
                <span className="muted small">
                  {s.appointment ? `${s.appointment.code} · lịch ${time(s.appointment.startAt)}–${time(s.appointment.endAt)}` : 'Walk-in'}
                  {s.startedAt ? ` · bắt đầu ${time(s.startedAt)}` : ''}
                  {s.finishedAt ? ` · xong ${time(s.finishedAt)}` : ''}
                </span>
              </div>
              {editable ? (
                <label className="row small" style={{ gap: 8, alignItems: 'center' }}>
                  <span className="muted">Ghế</span>
                  <select className="input" style={{ width: 'auto' }} value={s.chair ?? ''} disabled={act.busy} onChange={(e) => setChair(s, e.target.value)}>
                    <option value="">Chưa xếp ghế</option>
                    {[...new Set([...(s.chair ? [s.chair] : []), ...(freeChairs.data ?? [])])].sort().map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {!s.chair && freeChairs.data?.length === 0 && <span className="badge warn">Hết ghế trống</span>}
                </label>
              ) : (
                s.chair && <span className="muted small">Ghế {s.chair}</span>
              )}
              <div className="line-list">
                {items.map((i) => (
                  <div key={i.id} className="line line-item">
                    <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span>{i.service.name}</span>
                        <StatusBadge map={ITEM_STATUS} value={i.status} />
                      </div>
                      <span className="muted small">{assignmentText(i)}</span>
                      {i.confirmationNote && <span className="muted small">Khách đồng ý: {i.confirmationNote}</span>}
                      {editable && (
                        <div className="row" style={{ gap: 6 }}>
                          {i.status === 'PROPOSED' && (
                            <button type="button" className="btn btn-gold btn-sm" onClick={() => setDialog({ kind: 'confirm', item: i })}>
                              Khách đồng ý
                            </button>
                          )}
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setDialog({ kind: 'assign', item: i })}>
                            Phân công
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'remove', item: i })}>
                            Bỏ dịch vụ
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="num">{vnd(i.agreedPrice)}</span>
                  </div>
                ))}
                {removed.map((i) => (
                  <div key={i.id} className="line muted small">
                    <s>{i.service.name}</s>
                    <span>Đã bỏ</span>
                  </div>
                ))}
                <div className="line total">
                  <span>Tạm tính</span>
                  <span className="num">{vnd(total)}</span>
                </div>
              </div>
              <div className="row">
                {s.status === 'OPEN' && (
                  <button type="button" className="btn btn-outline btn-sm" disabled={act.busy} onClick={() => sessionAction(s, 'start')}>
                    Bắt đầu phục vụ
                  </button>
                )}
                {editable && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setDialog({ kind: 'add', session: s })}>
                    + Thêm dịch vụ
                  </button>
                )}
                {editable && (
                  <button type="button" className="btn btn-dark btn-sm" disabled={act.busy} onClick={() => sessionAction(s, 'complete')}>
                    Hoàn tất phục vụ
                  </button>
                )}
                {s.status === 'AWAITING_PAYMENT' && (
                  <button type="button" className="btn btn-gold btn-sm" disabled={act.busy} onClick={() => invoice(s)}>
                    Lập hóa đơn
                  </button>
                )}
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setDialog({ kind: 'cancel', session: s })}>
                  Hủy phiên
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {dialog?.kind === 'confirm' && <ConfirmItemDialog item={dialog.item} onClose={() => setDialog(null)} onDone={() => { setDialog(null); sessions.reload(); }} />}
      {dialog?.kind === 'remove' && <RemoveItemDialog item={dialog.item} onClose={() => setDialog(null)} onDone={() => { setDialog(null); sessions.reload(); }} />}
      {dialog?.kind === 'assign' && <AssignDialog item={dialog.item} employees={emps.data ?? []} onClose={() => setDialog(null)} onDone={() => { setDialog(null); sessions.reload(); }} />}
      {dialog?.kind === 'cancel' && (
        <CancelSessionDialog session={dialog.session} onClose={() => setDialog(null)} onDone={() => { setDialog(null); act.setMessage(`Đã hủy phiên ${dialog.session.code}`); sessions.reload(); }} />
      )}
      {dialog?.kind === 'add' && (
        <AddItemDialog session={dialog.session} services={services.data ?? []} employees={emps.data ?? []} onClose={() => setDialog(null)} onDone={() => { setDialog(null); sessions.reload(); }} />
      )}
    </div>
  );
}

function ConfirmItemDialog({ item, onClose, onDone }: { item: SessionItem; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [price, setPrice] = useState(String(item.agreedPrice));
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return act.setError('Cần ghi nhận khách đã đồng ý (BR-12)');
    const r = await act.run(() => api(`/sessions/items/${item.id}/confirm`, { body: { confirmationNote: note.trim(), agreedPrice: Number(price) || 0 } }));
    if (r) onDone();
  }
  return (
    <Modal
      title={`Khách đồng ý "${item.service.name}"`}
      eyebrow="Dịch vụ phát sinh"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button>
          <button type="submit" form="confirm-item" className="btn btn-gold" disabled={act.busy}>Ghi nhận</button>
        </>
      }
    >
      <form id="confirm-item" className="stack" onSubmit={submit}>
        <label className="field">
          <span>Giá khách đồng ý (₫)</span>
          <input className="input" type="number" min={0} step={1000} value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field">
          <span>Ghi nhận xác nhận của khách (bắt buộc)</span>
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Khách đồng ý tại quầy, đã báo giá" />
        </label>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}

function RemoveItemDialog({ item, onClose, onDone }: { item: SessionItem; onClose: () => void; onDone: () => void }) {
  const act = useAction();
  return (
    <Modal
      title={`Bỏ "${item.service.name}" khỏi phiên?`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Giữ lại</button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={act.busy}
            onClick={async () => {
              if (await act.run(() => api(`/sessions/items/${item.id}/remove`, { method: 'POST' }))) onDone();
            }}
          >
            Bỏ dịch vụ
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>Dịch vụ sẽ không được tính vào hóa đơn. Thao tác được ghi vào nhật ký.</p>
      <ErrorAlert error={act.error} />
    </Modal>
  );
}

function AssignDialog({ item, employees, onClose, onDone }: { item: SessionItem; employees: Employee[]; onClose: () => void; onDone: () => void }) {
  const lead0 = item.assignments.find((a) => a.role === 'LEAD_STYLIST')?.employee.id ?? null;
  const [lead, setLead] = useState<number | null>(lead0);
  const [assistants, setAssistants] = useState<number[]>(item.assignments.filter((a) => a.role === 'ASSISTANT').map((a) => a.employee.id));
  const act = useAction();
  const stylists = employees.filter((e) => e.position === 'STYLIST' && e.status === 'ACTIVE');
  const helpers = employees.filter((e) => (e.position === 'ASSISTANT' || e.position === 'STYLIST') && e.status === 'ACTIVE' && e.id !== lead);
  const canDo = (e: Employee) => (e.skills ?? []).some((s) => s.id === item.service.id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!lead) return act.setError('Chọn thợ chính');
    const r = await act.run(() =>
      api(`/sessions/items/${item.id}/assignments`, {
        method: 'PATCH',
        body: { assignments: [{ employeeId: lead, role: 'LEAD_STYLIST' }, ...assistants.filter((a) => a !== lead).map((id) => ({ employeeId: id, role: 'ASSISTANT' }))] },
      }),
    );
    if (r) onDone();
  }
  return (
    <Modal
      title={`Phân công "${item.service.name}"`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button>
          <button type="submit" form="assign-form" className="btn btn-gold" disabled={act.busy}>Lưu phân công</button>
        </>
      }
    >
      <form id="assign-form" className="stack" onSubmit={submit}>
        <label className="field">
          <span>Thợ chính</span>
          <select className="input" value={lead ?? ''} onChange={(e) => setLead(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— Chọn thợ chính —</option>
            {stylists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
                {canDo(s) ? '' : ' (chưa có chuyên môn)'}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="plain-fieldset">
          <legend className="lbl">Thợ phụ</legend>
          <div className="check-list">
            {helpers.map((h) => (
              <label key={h.id} className="check">
                <input type="checkbox" checked={assistants.includes(h.id)} onChange={(e) => setAssistants(e.target.checked ? [...assistants, h.id] : assistants.filter((x) => x !== h.id))} />
                <span>
                  {h.fullName} <span className="muted small">· {h.position === 'ASSISTANT' ? 'thợ phụ' : 'stylist'}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="muted small" style={{ margin: 0 }}>Hoa hồng chia theo cấu hình dịch vụ; chốt khi hóa đơn thanh toán.</p>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}

function AddItemDialog({ session, services, employees, onClose, onDone }: { session: Session; services: Service[]; employees: Employee[]; onClose: () => void; onDone: () => void }) {
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [lead, setLead] = useState<number | null>(null);
  const [assistant, setAssistant] = useState<number | null>(null);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const act = useAction();
  const svc = services.find((s) => s.id === serviceId);
  const needNote = session.status === 'IN_SERVICE';
  const stylists = employees.filter((e) => e.position === 'STYLIST' && e.status === 'ACTIVE' && (!svc || (e.skills ?? []).some((s) => s.id === svc.id)));
  const assistants = employees.filter((e) => e.position === 'ASSISTANT' && e.status === 'ACTIVE');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!serviceId) return act.setError('Chọn dịch vụ');
    if (needNote && !note.trim()) return act.setError('Phiên đang phục vụ: cần ghi nhận khách đồng ý dịch vụ và giá phát sinh');
    const r = await act.run(() =>
      api(`/sessions/${session.id}/items`, {
        body: {
          serviceId,
          agreedPrice: price ? Number(price) : undefined,
          leadId: lead ?? undefined,
          assistantIds: assistant ? [assistant] : undefined,
          confirmationNote: note.trim() || undefined,
        },
      }),
    );
    if (r) onDone();
  }
  return (
    <Modal
      title="Thêm dịch vụ vào phiên"
      eyebrow={`Phiên ${session.code}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button>
          <button type="submit" form="add-item" className="btn btn-gold" disabled={act.busy}>Thêm dịch vụ</button>
        </>
      }
    >
      <form id="add-item" className="stack" onSubmit={submit}>
        <label className="field">
          <span>Dịch vụ</span>
          <select
            className="input"
            value={serviceId ?? ''}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              setServiceId(id);
              setPrice(String(services.find((s) => s.id === id)?.basePrice ?? ''));
              setLead(null);
            }}
          >
            <option value="">— Chọn dịch vụ —</option>
            {services.filter((s) => s.status === 'ACTIVE').map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {vnd(s.basePrice)}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Thợ chính</span>
            <select className="input" value={lead ?? ''} onChange={(e) => setLead(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Giữ thợ chính hiện tại</option>
              {stylists.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Thợ phụ</span>
            <select className="input" value={assistant ?? ''} onChange={(e) => setAssistant(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Không cần</option>
              {assistants.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Giá báo khách (₫)</span>
          <input className="input" type="number" min={0} step={1000} value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field">
          <span>Ghi nhận khách đồng ý{needNote ? ' (bắt buộc khi đang phục vụ)' : ''}</span>
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}

function CancelSessionDialog({ session, onClose, onDone }: { session: Session; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return act.setError('Cần ghi lý do hủy phiên');
    if (!confirming) return setConfirming(true);
    if (await act.run(() => api(`/sessions/${session.id}/cancel`, { body: { reason: reason.trim() } }))) onDone();
  }
  return (
    <Modal
      title={`Hủy phiên ${session.code}`}
      eyebrow={customerName(session.customer, session.walkInName)}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={confirming ? () => setConfirming(false) : onClose}>{confirming ? 'Quay lại' : 'Giữ phiên'}</button>
          <button type="submit" form="cancel-session" className="btn btn-danger" disabled={act.busy}>{confirming ? 'Xác nhận hủy phiên' : 'Tiếp tục'}</button>
        </>
      }
    >
      <form id="cancel-session" className="stack" onSubmit={submit}>
        <label className="field">
          <span>Lý do hủy (bắt buộc, được ghi nhật ký)</span>
          <textarea className="input" rows={2} value={reason} readOnly={confirming} onChange={(e) => setReason(e.target.value)} placeholder="VD: Check-in nhầm khách" />
        </label>
        {confirming && <div className="alert warn" role="alert">Phiên và lịch hẹn liên kết sẽ bị hủy, không lập hóa đơn được nữa. Bấm “Xác nhận hủy phiên” để tiếp tục.</div>}
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}
