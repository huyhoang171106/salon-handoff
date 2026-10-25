import { useState } from 'react';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { useLoad } from '../../lib/util';
import type { AuditLog } from '../../lib/types';
import { ErrorAlert, Loading, PageHead } from '../../components/ui';

const ENTITIES = ['', 'Appointment', 'Invoice', 'Payment', 'SalonService', 'Employee', 'WorkShift', 'ServiceSessionItem', 'ServiceSession', 'Promotion', 'ExpenseRecord', 'Product'];
const ENTITY_LABEL: Record<string, string> = {
  '': 'Tất cả', Appointment: 'Lịch hẹn', Invoice: 'Hóa đơn', Payment: 'Thanh toán', SalonService: 'Dịch vụ', Employee: 'Nhân viên', WorkShift: 'Ca làm',
  ServiceSessionItem: 'Dịch vụ trong phiên', ServiceSession: 'Phiên phục vụ', Promotion: 'Khuyến mãi', ExpenseRecord: 'Chi phí', Product: 'Kho',
};

export function AuditPage() {
  const [entity, setEntity] = useState('');
  const logs = useLoad(() => api<AuditLog[]>('/audit-logs', { query: { entity: entity || undefined } }), [entity]);
  return (
    <div className="page stack">
      <PageHead title="Nhật ký thao tác" sub="200 thao tác quan trọng gần nhất: đổi giá, hủy hóa đơn, no-show, phân công, thanh toán…" />
      <label className="row" style={{ gap: 8 }}>
        <span className="small">Đối tượng</span>
        <select className="input" style={{ width: 220 }} value={entity} onChange={(e) => setEntity(e.target.value)}>
          {ENTITIES.map((e) => <option key={e} value={e}>{ENTITY_LABEL[e]}</option>)}
        </select>
      </label>
      <ErrorAlert error={logs.error} />
      {logs.loading && !logs.data && <Loading />}
      {logs.data && (
        <div className="card flush table-wrap">
          <table className="table">
            <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Nội dung</th></tr></thead>
            <tbody>
              {logs.data.map((l) => (
                <tr key={l.id}>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>{dateTime(l.createdAt)}</td>
                  <td>{l.actorName}</td>
                  <td><span className="badge neutral">{l.action}</span></td>
                  <td>{l.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
