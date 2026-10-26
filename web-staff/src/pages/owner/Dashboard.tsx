import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { APPOINTMENT_STATUS, COMPLAINT_STATUS, dateTime, shortDay, todayVN, vnd } from '../../lib/format';
import { EQUIPMENT_STATUS, POSITION_LABEL } from '../../lib/labels';
import { addDays, useLoad } from '../../lib/util';
import type { Summary } from '../../lib/types';
import { Empty, ErrorAlert, Kpi, Loading, PageHead, Section, Segmented, StatusBadge } from '../../components/ui';

type Preset = 'today' | 'month' | 'custom';

const million = (n: number) => `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;

function niceMax(v: number): number {
  if (v <= 0) return 1_000_000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

export function Dashboard() {
  const today = todayVN();
  const [preset, setPreset] = useState<Preset>('month');
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const range = preset === 'today' ? { from: today, to: today } : preset === 'month' ? { from: today.slice(0, 8) + '01', to: today } : { from, to };
  const sum = useLoad(() => api<Summary>('/reports/summary', { query: range }), [range.from, range.to]);
  const cancels = useLoad(() => api<Cancellation[]>('/reports/cancellations', { query: range }), [range.from, range.to]);
  const s = sum.data;
  const label = preset === 'today' ? 'hôm nay' : preset === 'month' ? `tháng ${Number(today.slice(5, 7))}` : `${range.from.split('-').reverse().join('/')} – ${range.to.split('-').reverse().join('/')}`;

  return (
    <div className="page stack">
      <PageHead
        eyebrow={`${shortDay(today)} · Dữ liệu ${label}`}
        title="Tổng quan kinh doanh"
        actions={
          <Segmented<Preset>
            label="Khoảng thời gian"
            value={preset}
            onChange={setPreset}
            options={[
              { value: 'today', label: 'Hôm nay' },
              { value: 'month', label: 'Tháng này' },
              { value: 'custom', label: 'Tùy chọn' },
            ]}
          />
        }
      />
      {preset === 'custom' && (
        <div className="row">
          <label className="row" style={{ gap: 8 }}>
            <span className="small">Từ</span>
            <input className="input date-input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="row" style={{ gap: 8 }}>
            <span className="small">Đến</span>
            <input className="input date-input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      )}
      <ErrorAlert error={sum.error} />
      {sum.loading && !s && <Loading />}
      {s && (
        <>
          <div className="kpi-grid">
            <Kpi label="Doanh thu" value={vnd(s.revenue)} sub={s.discounts ? `Đã giảm giá ${vnd(s.discounts)}` : 'Hóa đơn đã thanh toán'} tone="gold" />
            <Kpi label="Số hóa đơn" value={s.invoices} sub={s.invoices ? `TB ${vnd(Math.round(s.revenue / s.invoices))}/hóa đơn` : 'Chưa có hóa đơn'} />
            <Kpi label="Lượt lịch / walk-in" value={`${s.appointments.booked} / ${s.appointments.walkIn}`} sub={`${s.appointments.completed} hoàn thành · ${s.appointments.pending} chờ xác nhận`} />
            <Kpi label="Hủy / vắng mặt" value={`${s.appointments.cancelled} / ${s.appointments.noShow}`} sub={`Trên ${s.appointments.total} lịch`} tone={s.appointments.noShow ? 'bad' : undefined} />
            <Kpi label="Chi phí" value={vnd(s.expenses)} sub="Chi phí vận hành đã ghi" />
            <Kpi label="Lợi nhuận ước tính" value={vnd(s.profitEstimate)} sub="Doanh thu − chi phí (chưa gồm hoa hồng)" tone={s.profitEstimate < 0 ? 'bad' : undefined} />
          </div>

          <div className="two-col wide-left">
            <RevenueChart s={s} />
            <Section title="Dịch vụ tạo doanh thu">
              {s.byService.length === 0 ? (
                <p className="muted small">Chưa có dữ liệu.</p>
              ) : (
                <div className="stack" style={{ gap: 14 }}>
                  {s.byService.slice(0, 6).map((x) => (
                    <div key={x.name} className="stack" style={{ gap: 6 }}>
                      <div className="spread small">
                        <span>{x.name}</span>
                        <strong className="num">{million(x.revenue)}</strong>
                      </div>
                      <div className="hbar" aria-hidden="true">
                        <div style={{ width: `${(x.revenue / s.byService[0].revenue) * 100}%` }} />
                      </div>
                      <div className="muted small">{x.count} lượt</div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <Section title={`Doanh thu & hoa hồng theo nhân viên · ${label}`} actions={<Link to="/hoa-hong">Đối soát hoa hồng</Link>}>
            {s.byEmployee.length === 0 ? (
              <p className="muted small">Chưa có hoa hồng nào được chốt trong khoảng này.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Nhân viên</th><th>Vai trò</th><th className="num">Lượt thợ chính</th><th className="num">Lượt thợ phụ</th><th className="num">Doanh thu</th><th className="num">Hoa hồng</th></tr>
                  </thead>
                  <tbody>
                    {s.byEmployee.map((e) => (
                      <tr key={e.id}>
                        <td>{e.fullName} <span className="muted small">{e.code}</span></td>
                        <td><span className="badge neutral">{POSITION_LABEL[e.position]}</span></td>
                        <td className="num">{e.leadCount}</td>
                        <td className="num">{e.assistCount}</td>
                        <td className="num">{e.revenue ? vnd(e.revenue) : '—'}</td>
                        <td className="num">{vnd(e.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <div className="grid" style={{ ['--min' as string]: '300px' }}>
            <Section title="Khung giờ đông khách">
              <BusyHours s={s} />
            </Section>
            <Section title="Cảnh báo tồn kho" actions={<Link to="/kho">Nhập kho</Link>}>
              {s.lowStock.length === 0 ? (
                <p className="muted small">Không có mặt hàng nào dưới mức tối thiểu.</p>
              ) : (
                <ul className="plain-list stack" style={{ gap: 10 }}>
                  {s.lowStock.map((p) => (
                    <li key={p.id} className="spread" style={{ flexWrap: 'nowrap' }}>
                      <span className="stack" style={{ gap: 0 }}>
                        <span>{p.name}</span>
                        <span className="muted small">Còn {p.stock} {p.unit} · tối thiểu {p.minStock}</span>
                      </span>
                      <span className="badge warn">Sắp hết</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Khiếu nại & thiết bị">
              <ul className="plain-list stack" style={{ gap: 10 }}>
                {s.complaints.map((c) => (
                  <li key={c.status} className="spread">
                    <StatusBadge map={COMPLAINT_STATUS} value={c.status} />
                    <span className="num">{c.count} khiếu nại</span>
                  </li>
                ))}
                {s.complaints.length === 0 && <li className="muted small">Chưa có khiếu nại.</li>}
                {s.equipmentIssues.map((e) => (
                  <li key={e.id} className="spread" style={{ flexWrap: 'nowrap' }}>
                    <span>{e.code} · {e.name}</span>
                    <StatusBadge map={EQUIPMENT_STATUS} value={e.status} />
                  </li>
                ))}
                {s.equipmentIssues.length === 0 && <li className="muted small">Thiết bị đều hoạt động bình thường.</li>}
              </ul>
            </Section>
          </div>
          <Section title={`Lịch hủy / vắng mặt · ${label}`}>
            {!cancels.data?.length ? (
              <p className="muted small">Không có lịch hủy hay vắng mặt.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Mã</th><th>Giờ hẹn</th><th>Khách</th><th>Trạng thái</th><th>Lý do</th><th className="num">Số lần vắng</th></tr></thead>
                  <tbody>
                    {cancels.data.map((c) => (
                      <tr key={c.id}>
                        <td>{c.code}</td>
                        <td className="small">{dateTime(c.startAt)}</td>
                        <td>{c.fullName} <span className="muted small">{c.phone}</span></td>
                        <td><StatusBadge map={APPOINTMENT_STATUS} value={c.status} /></td>
                        <td className="small">{c.statusReason ?? '—'}</td>
                        <td className="num">{c.noShowCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

interface Cancellation { id: number; code: string; startAt: string; status: string; statusReason: string | null; fullName: string; phone: string; noShowCount: number }

function RevenueChart({ s }: { s: Summary }) {
  // Điền đủ các ngày trong khoảng (tối đa 62 ngày) để trục X liên tục
  const days: { date: string; revenue: number; invoices: number }[] = [];
  const span = Math.round((Date.parse(s.to) - Date.parse(s.from)) / 86400000) + 1;
  if (span <= 62) {
    for (let d = s.from; d <= s.to; d = addDays(d, 1)) days.push(s.byDay.find((x) => x.date === d) ?? { date: d, revenue: 0, invoices: 0 });
  } else days.push(...s.byDay);
  const max = niceMax(Math.max(0, ...days.map((d) => d.revenue)));
  const best = days.reduce((b, d) => (d.revenue > (b?.revenue ?? -1) ? d : b), days[0]);
  const summary = days.length
    ? `Biểu đồ cột doanh thu theo ngày từ ${s.from.split('-').reverse().join('/')} đến ${s.to.split('-').reverse().join('/')}. Tổng ${vnd(s.revenue)}. Cao nhất ${best?.date.split('-').reverse().join('/')} với ${vnd(best?.revenue ?? 0)}.`
    : 'Chưa có doanh thu';
  const every = days.length > 10 ? Math.ceil(days.length / 8) : 1;
  const ticks = [max, max / 2, 0];
  const unit = max >= 1e6 ? { div: 1e6, name: 'triệu ₫' } : { div: 1e3, name: 'nghìn ₫' };

  return (
    <Section title="Doanh thu theo ngày" actions={<span className="muted small">{unit.name} · đã thanh toán</span>}>
      {days.length === 0 ? (
        <Empty>Chưa có doanh thu trong khoảng này.</Empty>
      ) : (
        <figure className="chart" style={{ margin: 0 }}>
          <div className="chart-body">
            <div className="chart-y" aria-hidden="true">
              {ticks.map((t) => (
                <span key={t}>{(t / unit.div).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</span>
              ))}
            </div>
            <div className="chart-plot" role="img" aria-label={summary}>
              <div className="chart-grid" aria-hidden="true"><span /><span /><span /></div>
              {days.map((d) => {
                const dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
                return (
                  <div key={d.date} className="chart-col" title={`${d.date.split('-').reverse().join('/')}: ${vnd(d.revenue)} · ${d.invoices} hóa đơn`}>
                    <div className={`chart-bar${dow === 0 || dow === 6 ? ' weekend' : ''}${d.revenue > 0 ? ' has' : ''}`} style={{ height: `${(d.revenue / max) * 100}%` }} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="chart-x" aria-hidden="true">
            {days.map((d, i) => (
              <span key={d.date}>{i % every === 0 ? Number(d.date.slice(8)) : ''}</span>
            ))}
          </div>
          <figcaption className="row small muted" style={{ gap: 16 }}>
            <span className="legend-item"><span className="dot" style={{ background: 'var(--gold)' }} aria-hidden="true" />Cuối tuần</span>
            <span className="legend-item"><span className="dot" style={{ background: 'var(--bar)' }} aria-hidden="true" />Ngày thường</span>
            <span>Trục ngang: ngày · trục dọc: {unit.name}</span>
          </figcaption>
        </figure>
      )}
    </Section>
  );
}

function BusyHours({ s }: { s: Summary }) {
  const hours = Array.from({ length: 12 }, (_, i) => 8 + i);
  const max = Math.max(1, ...s.busyHours.map((h) => h.count));
  const total = s.busyHours.reduce((t, h) => t + h.count, 0);
  if (!total) return <p className="muted small">Chưa có lượt phục vụ trong khoảng này.</p>;
  const peak = s.busyHours.reduce((b, h) => (h.count > b.count ? h : b), s.busyHours[0]);
  return (
    <div className="stack" style={{ gap: 6 }} role="img" aria-label={`Khung giờ đông nhất ${peak.hour}:00 với ${peak.count} lượt`}>
      {hours.map((h) => {
        const c = s.busyHours.find((x) => x.hour === h)?.count ?? 0;
        return (
          <div key={h} className="busy-row" aria-hidden="true">
            <span className="small muted">{String(h).padStart(2, '0')}:00</span>
            <div className="hbar thin"><div style={{ width: `${(c / max) * 100}%` }} /></div>
            <span className="small num">{c}</span>
          </div>
        );
      })}
    </div>
  );
}
