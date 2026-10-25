import { useState } from 'react';
import { api } from '../../lib/api';
import { vnd } from '../../lib/format';
import { POSITION_LABEL } from '../../lib/labels';
import { monthNow, useLoad } from '../../lib/util';
import { useEmployees } from '../../lib/data';
import type { CommissionResult } from '../../lib/types';
import { ErrorAlert, Field, Loading, PageHead } from '../../components/ui';
import { CommissionTable } from '../stylist/MyCommission';

export function CommissionsPage() {
  const emps = useEmployees();
  const [month, setMonth] = useState(monthNow());
  const [empId, setEmpId] = useState<number | null>(null);
  const staff = (emps.data ?? []).filter((e) => e.position === 'STYLIST' || e.position === 'ASSISTANT');
  const id = empId ?? staff[0]?.id ?? null;
  const data = useLoad(() => (id ? api<CommissionResult>(`/commissions/${id}`, { query: { month } }) : Promise.resolve(null)), [id, month]);
  const emp = staff.find((e) => e.id === id);

  return (
    <div className="page stack">
      <PageHead title="Hoa hồng nhân viên" sub="Dòng hoa hồng được chốt khi hóa đơn thanh toán thành công và không đổi khi chính sách thay đổi." />
      <div className="row">
        <Field label="Nhân viên">
          <select className="input" value={id ?? ''} onChange={(e) => setEmpId(Number(e.target.value))}>
            {staff.map((e) => <option key={e.id} value={e.id}>{e.fullName} · {POSITION_LABEL[e.position]}</option>)}
          </select>
        </Field>
        <Field label="Tháng">
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
      </div>
      <ErrorAlert error={data.error ?? emps.error} />
      {data.loading && !data.data && <Loading />}
      {data.data && <CommissionTable data={data.data} title={`${emp?.fullName ?? ''} · tháng ${month.slice(5)}/${month.slice(0, 4)}`} />}
      {data.data && <p className="muted small" style={{ margin: 0 }}>Tổng hoa hồng: {vnd(data.data.total)}</p>}
    </div>
  );
}
