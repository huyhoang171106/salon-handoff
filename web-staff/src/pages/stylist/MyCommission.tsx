import { useState } from 'react';
import { api } from '../../lib/api';
import { date, vnd } from '../../lib/format';
import { ASSIGN_ROLE } from '../../lib/labels';
import { monthNow, useLoad } from '../../lib/util';
import type { CommissionResult } from '../../lib/types';
import { ErrorAlert, Loading, PageHead } from '../../components/ui';

export function CommissionTable({ data, title }: { data: CommissionResult; title: string }) {
  return (
    <section className="card stack" aria-label={title}>
      <div className="spread">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="section-title">{title}</h2>
          <span className="muted small">Đã chốt theo hóa đơn đã thanh toán; không đổi khi chính sách thay đổi.</span>
        </div>
        <div className="big-money" aria-label={`Tổng ${vnd(data.total)}`}>{vnd(data.total)}</div>
      </div>
      {data.lines.length === 0 ? (
        <p className="muted small">Chưa có dòng hoa hồng nào trong tháng.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Ngày · hóa đơn</th><th>Dịch vụ</th><th>Vai trò</th><th>Cách tính</th><th className="num">Số tiền</th></tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.id}>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>{date(l.earnedAt).slice(0, 5)} · {l.invoiceCode}</td>
                  <td>{l.serviceName} <span className="muted small">— {vnd(l.baseAmount)}</span></td>
                  <td className="small">{ASSIGN_ROLE[l.role]}</td>
                  <td className="small">{l.formula}</td>
                  <td className="num">{vnd(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function MyCommission() {
  const [month, setMonth] = useState(monthNow());
  const data = useLoad(() => api<CommissionResult>('/commissions/mine', { query: { month } }), [month]);
  return (
    <div className="page stack">
      <PageHead
        title="Hoa hồng của tôi"
        actions={
          <label className="row" style={{ gap: 8 }}>
            <span className="small">Tháng</span>
            <input className="input date-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        }
      />
      <ErrorAlert error={data.error} />
      {data.loading && !data.data && <Loading />}
      {data.data && <CommissionTable data={data.data} title={`Tháng ${Number(month.slice(5))}/${month.slice(0, 4)} · ${data.data.lines.length} dòng`} />}
    </div>
  );
}
