import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dateTime } from '../../lib/format';
import { POSITION_LABEL } from '../../lib/labels';
import { PASSWORD_HINT, passwordError } from '../../lib/password';
import { useAction, useLoad } from '../../lib/util';
import { Modal } from '../../components/Overlay';
import { CredentialsDialog } from '../../components/CredentialsDialog';
import { PasswordInput } from '../../components/PasswordInput';
import { ErrorAlert, Field, Loading, OkAlert, PageHead } from '../../components/ui';

export interface AccountRow {
  employee: { id: number; code: string; fullName: string; position: string; level: string | null; status: string; phone: string | null };
  account: { id: number; username: string; role: string; active: boolean; mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string } | null;
}

type Dialog = { kind: 'create'; row: AccountRow } | { kind: 'lock'; row: AccountRow } | { kind: 'reset'; row: AccountRow } | null;

export function accountState(a: AccountRow['account']): { label: string; tone: string } {
  if (!a) return { label: 'Chưa có tài khoản', tone: 'neutral' };
  if (!a.active) return { label: 'Đã khóa', tone: 'bad' };
  if (a.mustChangePassword) return { label: 'Chờ đổi mật khẩu', tone: 'warn' };
  return { label: 'Hoạt động', tone: 'ok' };
}

export function AccountsPage() {
  const { user } = useAuth();
  const list = useLoad(() => api<AccountRow[]>('/accounts'));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [creds, setCreds] = useState<{ name: string; username: string; password: string } | null>(null);
  const act = useAction();
  const rows = list.data ?? [];

  return (
    <div className="page stack">
      <PageHead
        eyebrow={`${rows.filter((r) => r.account?.active).length} đang hoạt động · ${rows.filter((r) => !r.account).length} chưa có tài khoản`}
        title="Tài khoản nhân viên"
        sub="Tạo, khóa / mở khóa tài khoản và cấp lại mật khẩu tạm. Nhân viên phải đổi mật khẩu tạm ở lần đăng nhập đầu."
        actions={<Link className="btn btn-gold" to="/nhan-vien/tao-moi">+ Thêm nhân viên</Link>}
      />
      <ErrorAlert error={list.error} />
      <OkAlert message={act.message} />
      {list.loading && !list.data && <Loading />}
      {rows.length > 0 && (
        <div className="card flush table-wrap">
          <table className="table">
            <thead>
              <tr><th>Mã</th><th>Họ tên</th><th>Vai trò</th><th>Tên đăng nhập</th><th>Trạng thái</th><th>Đăng nhập cuối</th><th><span className="sr-only">Thao tác</span></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = accountState(r.account);
                const self = r.account?.id === user?.accountId;
                return (
                  <tr key={r.employee.id}>
                    <td className="small">{r.employee.code}</td>
                    <td>{r.employee.fullName}{r.employee.status === 'INACTIVE' && <div className="muted small">Đã nghỉ việc</div>}</td>
                    <td className="small">{POSITION_LABEL[r.employee.position] ?? r.employee.position}</td>
                    <td className="mono small">{r.account?.username ?? '—'}</td>
                    <td><span className={`badge ${st.tone}`}>{st.label}</span></td>
                    <td className="small">{r.account?.lastLoginAt ? dateTime(r.account.lastLoginAt) : '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        {!r.account ? (
                          <button type="button" className="btn btn-gold btn-sm" onClick={() => setDialog({ kind: 'create', row: r })}>Tạo tài khoản</button>
                        ) : (
                          <>
                            <button type="button" className="btn btn-outline btn-sm" disabled={self} title={self ? 'Không thể tự khóa tài khoản của mình' : undefined} onClick={() => setDialog({ kind: 'lock', row: r })}>
                              {r.account.active ? 'Khóa' : 'Mở khóa'}
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'reset', row: r })}>Cấp lại mật khẩu</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === 'create' && (
        <CreateAccountDialog
          row={dialog.row}
          onClose={() => setDialog(null)}
          onDone={(username, password) => {
            setDialog(null);
            list.reload();
            setCreds({ name: dialog.row.employee.fullName, username, password });
          }}
        />
      )}
      {dialog?.kind === 'lock' && dialog.row.account && (
        <Modal
          title={`${dialog.row.account.active ? 'Khóa' : 'Mở khóa'} tài khoản ${dialog.row.account.username}?`}
          eyebrow={dialog.row.employee.fullName}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline" onClick={() => setDialog(null)}>Hủy bỏ</button>
              <button
                type="button"
                className={dialog.row.account.active ? 'btn btn-danger' : 'btn btn-gold'}
                disabled={act.busy}
                onClick={async () => {
                  const a = dialog.row.account!;
                  const r = await act.run(() => api(`/accounts/${a.id}`, { method: 'PATCH', body: { active: !a.active } }), `${a.active ? 'Đã khóa' : 'Đã mở khóa'} tài khoản ${a.username}`);
                  if (r) { setDialog(null); list.reload(); }
                }}
              >
                {dialog.row.account.active ? 'Khóa tài khoản' : 'Mở khóa'}
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            {dialog.row.account.active ? 'Nhân viên sẽ không đăng nhập được cho tới khi được mở khóa. Phiên đang đăng nhập cũng hết hiệu lực.' : 'Nhân viên có thể đăng nhập lại bằng mật khẩu hiện tại.'}
          </p>
          <ErrorAlert error={act.error} />
        </Modal>
      )}
      {dialog?.kind === 'reset' && dialog.row.account && (
        <Modal
          title={`Cấp lại mật khẩu cho ${dialog.row.account.username}?`}
          eyebrow={dialog.row.employee.fullName}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline" onClick={() => setDialog(null)}>Hủy bỏ</button>
              <button
                type="button"
                className="btn btn-gold"
                disabled={act.busy}
                onClick={async () => {
                  const r = await act.run(() => api<{ username: string; temporaryPassword: string }>(`/accounts/${dialog.row.account!.id}/reset-password`, { body: {} }));
                  if (r) {
                    setCreds({ name: dialog.row.employee.fullName, username: r.username, password: r.temporaryPassword });
                    setDialog(null);
                    list.reload();
                  }
                }}
              >
                Cấp mật khẩu tạm
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>Mật khẩu hiện tại sẽ không dùng được nữa. Hệ thống tạo mật khẩu tạm; nhân viên phải đổi ở lần đăng nhập kế tiếp.</p>
          <ErrorAlert error={act.error} />
        </Modal>
      )}
      {creds && <CredentialsDialog name={creds.name} username={creds.username} password={creds.password} onClose={() => setCreds(null)} />}
    </div>
  );
}

function CreateAccountDialog({ row, onClose, onDone }: { row: AccountRow; onClose: () => void; onDone: (username: string, password: string) => void }) {
  const [username, setUsername] = useState(row.employee.code);
  const [password, setPassword] = useState('');
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) return act.setError('Tên đăng nhập 3–40 ký tự, không dấu, không khoảng trắng');
    if (password) {
      const pe = passwordError(password);
      if (pe) return act.setError(pe);
    }
    const r = await act.run(() => api<{ account: { username: string }; temporaryPassword: string }>('/accounts', { body: { employeeId: row.employee.id, username, password: password || undefined } }));
    if (r) onDone(r.account.username, r.temporaryPassword);
  }
  return (
    <Modal
      title="Tạo tài khoản đăng nhập"
      eyebrow={`${row.employee.code} · ${row.employee.fullName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Hủy bỏ</button>
          <button type="submit" form="create-acc" className="btn btn-gold" disabled={act.busy}>Tạo tài khoản</button>
        </>
      }
    >
      <form id="create-acc" className="stack" onSubmit={submit}>
        <Field label="Tên đăng nhập" hint="Mặc định là mã nhân viên"><input className="input mono" value={username} onChange={(e) => setUsername(e.target.value.trim())} /></Field>
        <PasswordInput label="Mật khẩu (để trống = hệ thống tạo mật khẩu tạm)" value={password} onChange={setPassword} autoComplete="new-password" hint={PASSWORD_HINT} />
        <ErrorAlert error={act.error} />
      </form>
    </Modal>
  );
}
