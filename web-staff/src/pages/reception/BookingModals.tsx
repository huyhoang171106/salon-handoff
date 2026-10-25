import { FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { todayVN } from '../../lib/format';
import { useAction } from '../../lib/util';
import { isStylist, useEmployees, useServices } from '../../lib/data';
import type { Appointment, Session } from '../../lib/types';
import { Modal } from '../../components/Overlay';
import { ErrorAlert, Loading } from '../../components/ui';
import { SlotPicker } from '../../components/SlotPicker';
import { ServicePicker } from '../../components/ServicePicker';
import { Contact, CustomerPicker } from '../../components/CustomerPicker';

function StylistSelect({ value, onChange, label = 'Stylist' }: { value: number | null; onChange: (v: number | null) => void; label?: string }) {
  const emps = useEmployees();
  return (
    <label className="field">
      <span>{label}</span>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Để salon tự xếp thợ phù hợp</option>
        {(emps.data ?? []).filter(isStylist).map((e) => (
          <option key={e.id} value={e.id}>
            {e.fullName} · {e.level ?? 'Stylist'}
          </option>
        ))}
      </select>
    </label>
  );
}

export { StylistSelect };

/** "+ Đặt lịch": lễ tân đặt cho khách (lịch được xác nhận ngay). */
export function BookingModal({ defaultDate, onClose, onDone }: { defaultDate: string; onClose: () => void; onDone: (a: Appointment) => void }) {
  const services = useServices();
  const [contact, setContact] = useState<Contact>({ fullName: '', phone: '' });
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [stylistId, setStylistId] = useState<number | null>(null);
  const [date, setDate] = useState(defaultDate < todayVN() ? todayVN() : defaultDate);
  const [time, setTime] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const act = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!contact.fullName.trim() || !contact.phone.trim()) return act.setError('Cần họ tên và số điện thoại của khách');
    if (!serviceIds.length) return act.setError('Chọn ít nhất một dịch vụ');
    if (!time) return act.setError('Chọn khung giờ');
    const r = await act.run(() =>
      api<Appointment>('/appointments', {
        body: { date, time, serviceIds, stylistId: stylistId ?? undefined, note: note.trim() || undefined, customer: { fullName: contact.fullName.trim(), phone: contact.phone.trim() } },
      }),
    );
    if (r) onDone(r);
  }

  return (
    <Modal
      title="Đặt lịch cho khách"
      eyebrow="Lễ tân đặt · xác nhận ngay"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Hủy bỏ
          </button>
          <button type="submit" form="booking-form" className="btn btn-gold" disabled={act.busy}>
            {act.busy ? 'Đang đặt…' : time ? `Đặt lịch ${time}` : 'Đặt lịch'}
          </button>
        </>
      }
    >
      <form id="booking-form" className="stack" onSubmit={submit}>
        <h3 className="step-title">1 · Khách hàng</h3>
        <CustomerPicker value={contact} onChange={setContact} />
        <h3 className="step-title">2 · Dịch vụ</h3>
        {services.loading ? <Loading /> : <ServicePicker services={services.data ?? []} value={serviceIds} onChange={(v) => { setServiceIds(v); setTime(null); }} />}
        <h3 className="step-title">3 · Thợ & ngày</h3>
        <div className="form-grid">
          <StylistSelect value={stylistId} onChange={(v) => { setStylistId(v); setTime(null); }} />
          <label className="field">
            <span>Ngày hẹn</span>
            <input className="input" type="date" min={todayVN()} value={date} onChange={(e) => { setDate(e.target.value); setTime(null); }} />
          </label>
        </div>
        <h3 className="step-title">4 · Giờ trống</h3>
        <SlotPicker date={date} serviceIds={serviceIds} stylistId={stylistId} value={time} onChange={setTime} />
        <label className="field">
          <span>Ghi chú (không bắt buộc)</span>
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}

/** "+ Khách walk-in": kiểm tra phục vụ ngay; nếu không được API trả 422 kèm giờ trống gần nhất. */
export function WalkInModal({ onClose, onDone }: { onClose: () => void; onDone: (s: Session) => void }) {
  const services = useServices();
  const [contact, setContact] = useState<Contact>({ fullName: '', phone: '' });
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [stylistId, setStylistId] = useState<number | null>(null);
  const [walkInName, setWalkInName] = useState('');
  const act = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!serviceIds.length) return act.setError('Chọn ít nhất một dịch vụ');
    const hasContact = contact.fullName.trim() && contact.phone.trim();
    if (!hasContact && (contact.fullName.trim() || contact.phone.trim())) return act.setError('Nhập đủ cả họ tên và số điện thoại, hoặc để trống cả hai');
    const r = await act.run(() =>
      api<Session>('/walk-ins', {
        body: {
          serviceIds,
          stylistId: stylistId ?? undefined,
          customer: hasContact ? { fullName: contact.fullName.trim(), phone: contact.phone.trim() } : undefined,
          walkInName: !hasContact ? walkInName.trim() || undefined : undefined,
        },
      }),
    );
    if (r) onDone(r);
  }

  return (
    <Modal
      title="Tiếp nhận khách walk-in"
      eyebrow="Phục vụ ngay nếu còn thợ trống"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Hủy bỏ
          </button>
          <button type="submit" form="walkin-form" className="btn btn-gold" disabled={act.busy}>
            {act.busy ? 'Đang kiểm tra…' : 'Tiếp nhận & tạo phiên'}
          </button>
        </>
      }
    >
      <form id="walkin-form" className="stack" onSubmit={submit}>
        <h3 className="step-title">Dịch vụ khách muốn làm</h3>
        {services.loading ? <Loading /> : <ServicePicker services={services.data ?? []} value={serviceIds} onChange={setServiceIds} />}
        <StylistSelect value={stylistId} onChange={setStylistId} label="Stylist khách chọn (nếu có)" />
        <h3 className="step-title">Thông tin khách</h3>
        <CustomerPicker value={contact} onChange={setContact} optional />
        {!(contact.fullName && contact.phone) && (
          <label className="field">
            <span>Tên gọi tạm (khi khách không để lại SĐT)</span>
            <input className="input" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="VD: Chị áo xanh" />
          </label>
        )}
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}
