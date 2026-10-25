import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { EMPLOYEE_STATUS, POSITION_LABEL } from '../../lib/labels';
import { useAction } from '../../lib/util';
import { useEmployees, useServices } from '../../lib/data';
import type { Employee, Position, Service } from '../../lib/types';
import { Modal } from '../../components/Overlay';
import { ErrorAlert, Field, Loading, PageHead, StatusBadge } from '../../components/ui';

export function EmployeesPage() {
  const emps = useEmployees();
  const services = useServices(true);
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);

  return (
    <div className="page stack">
      <PageHead
        title="Nhân viên"
        sub="Chuyên môn (kỹ năng) quyết định nhân viên nào được xếp làm thợ chính cho dịch vụ."
        actions={<><Link className="btn btn-outline" to="/tai-khoan">Tài khoản đăng nhập</Link><Link className="btn btn-gold" to="/nhan-vien/tao-moi">+ Thêm nhân viên</Link></>}
      />
      <ErrorAlert error={emps.error} />
      {emps.loading && !emps.data && <Loading />}
      {emps.data && (
        <div className="card flush table-wrap">
          <table className="table">
            <thead>
              <tr><th>Mã</th><th>Họ tên</th><th>Chức danh</th><th>Cấp bậc</th><th>Chuyên môn</th><th>Tài khoản</th><th>Trạng thái</th><th><span className="sr-only">Sửa</span></th></tr>
            </thead>
            <tbody>
              {emps.data.map((e) => (
                <tr key={e.id}>
                  <td className="small">{e.code}</td>
                  <td>{e.fullName}<div className="muted small">{e.phone ?? ''}</div></td>
                  <td>{POSITION_LABEL[e.position]}</td>
                  <td className="small">{e.level ?? '—'}</td>
                  <td className="small">{e.skills?.length ? `${e.skills.length} dịch vụ` : '—'}</td>
                  <td className="small">{e.username ?? <span className="muted">Chưa có</span>}</td>
                  <td><StatusBadge map={EMPLOYEE_STATUS} value={e.status} /></td>
                  <td><button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(e)}>Sửa</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && editing !== 'new' && (
        <EmployeeForm
          emp={editing}
          services={services.data ?? []}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            emps.reload();
          }}
        />
      )}
    </div>
  );
}

function EmployeeForm({ emp, services, onClose, onDone }: { emp: Employee | null; services: Service[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    fullName: emp?.fullName ?? '',
    phone: emp?.phone ?? '',
    position: (emp?.position ?? 'STYLIST') as Position,
    level: emp?.level ?? '',
    bio: emp?.bio ?? '',
    status: emp?.status ?? 'ACTIVE',
    publicProfile: emp?.publicProfile ?? true,
    skillIds: (emp?.skills ?? []).map((s) => s.id),
  });
  const act = useAction();
  const cats = [...new Set(services.map((s) => s.category))];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.fullName.trim()) return act.setError('Nhập họ tên');
    const body = { ...f, phone: f.phone || undefined, level: f.level || undefined, bio: f.bio || undefined };
    const r = await act.run(() => (emp ? api(`/employees/${emp.id}`, { method: 'PATCH', body }) : api('/employees', { body })));
    if (r) onDone();
  }

  return (
    <Modal
      title={emp ? `Sửa ${emp.code} · ${emp.fullName}` : 'Thêm nhân viên'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button>
          <button type="submit" form="emp-form" className="btn btn-gold" disabled={act.busy}>Lưu</button>
        </>
      }
    >
      <form id="emp-form" className="stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Họ tên"><input className="input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
          <Field label="Số điện thoại"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Chức danh">
            <select className="input" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value as Position })}>
              {Object.entries(POSITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Cấp bậc"><input className="input" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} placeholder="VD: SENIOR STYLIST" /></Field>
          <Field label="Trạng thái">
            <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Employee['status'] })}>
              {Object.entries(EMPLOYEE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Giới thiệu"><textarea className="input" rows={2} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
        <label className="check">
          <input type="checkbox" checked={f.publicProfile} onChange={(e) => setF({ ...f, publicProfile: e.target.checked })} />
          <span>Hiển thị trên website khách hàng</span>
        </label>
        <fieldset className="plain-fieldset">
          <legend className="lbl">Chuyên môn ({f.skillIds.length} dịch vụ)</legend>
          {cats.map((c) => (
            <div key={c} className="stack" style={{ gap: 6, marginTop: 8 }}>
              <span className="eyebrow">{c}</span>
              <div className="check-grid">
                {services.filter((s) => s.category === c).map((s) => (
                  <label key={s.id} className="check">
                    <input
                      type="checkbox"
                      checked={f.skillIds.includes(s.id)}
                      onChange={(e) => setF({ ...f, skillIds: e.target.checked ? [...f.skillIds, s.id] : f.skillIds.filter((x) => x !== s.id) })}
                    />
                    <span className="small">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
        <p className="muted small" style={{ margin: 0 }}>Tài khoản đăng nhập và mật khẩu được quản lý ở trang <Link to="/tai-khoan">Tài khoản nhân viên</Link>.</p>
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}
