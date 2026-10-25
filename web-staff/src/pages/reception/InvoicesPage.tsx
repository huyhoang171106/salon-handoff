import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { INVOICE_STATUS, time, todayVN, vnd } from '../../lib/format';
import { customerName, useLoad } from '../../lib/util';
import type { Invoice } from '../../lib/types';
import { Empty, ErrorAlert, Loading, PageHead, Segmented, StatusBadge } from '../../components/ui';

type Filter = '' | 'DRAFT' | 'PENDING' | 'PAID' | 'CANCELLED';

export function InvoicesPage() {
  const [day, setDay] = useState(todayVN());
  const [status, setStatus] = useState<Filter>('');
  const inv = useLoad(() => api<Invoice[]>('/invoices', { query: { date: day, status: status || undefined } }), [day, status]);
  const list = inv.data ?? [];
  const paid = list.filter((i) => i.status === 'PAID').reduce((t, i) => t + i.total, 0);

  return (
    <div className="page stack">
      <PageHead eyebrow={`${list.length} hóa đơn · đã thu ${vnd(paid)}`} title="Hóa đơn" sub="Hóa đơn được lập từ phiên phục vụ đã hoàn tất (màn Đang phục vụ)." />
      <div className="spread">
        <Segmented<Filter>
          label="Lọc theo trạng thái"
          value={status}
          onChange={setStatus}
          options={[{ value: '', label: 'Tất cả' }, ...(['DRAFT', 'PENDING', 'PAID', 'CANCELLED'] as const).map((s) => ({ value: s, label: INVOICE_STATUS[s].label }))]}
        />
        <label className="row" style={{ gap: 8 }}>
          <span className="small">Ngày lập</span>
          <input className="input date-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
      </div>
      <ErrorAlert error={inv.error} />
      {inv.loading && !inv.data && <Loading />}
      {inv.data && list.length === 0 && <Empty>Không có hóa đơn nào trong ngày với bộ lọc này.</Empty>}
      {list.length > 0 && (
        <div className="card flush table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Khách</th>
                <th>Giờ lập</th>
                <th>Khuyến mãi</th>
                <th className="num">Tổng</th>
                <th>Trạng thái</th>
                <th><span className="sr-only">Mở</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id}>
                  <td><Link to={`/hoa-don/${i.id}`}>{i.code}</Link></td>
                  <td>{customerName(i.customer, i.session?.walkInName)}</td>
                  <td>{time(i.createdAt)}</td>
                  <td className="muted small">{i.promotionName ?? '—'}</td>
                  <td className="num">{vnd(i.total)}</td>
                  <td><StatusBadge map={INVOICE_STATUS} value={i.status} /></td>
                  <td><Link className="btn btn-outline btn-sm" to={`/hoa-don/${i.id}`}>Mở</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
