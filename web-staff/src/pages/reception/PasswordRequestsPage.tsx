import { useState } from 'react';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { useAction, useLoad } from '../../lib/util';
import { Modal } from '../../components/Overlay';
import { CredentialsDialog } from '../../components/CredentialsDialog';
import { Empty, ErrorAlert, Loading, OkAlert, PageHead, Segmented } from '../../components/ui';

export interface PwRequest {
  id: number;
  phone: string;
  fullName: string;
  note: string | null;
  status: 'PENDING' | 'DONE' | 'REJECTED';
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
  account: { id: number; username: string; active: boolean; customerName: string | null } | null;
}

type Tab = 'PENDING' | 'HANDLED';

/** Yêu cầu cấp lại mật khẩu của khách: lễ tân gọi lại xác minh rồi cấp mật khẩu tạm. */
export function PasswordRequestsPage() {
  const [tab, setTab] = useState<Tab>('PENDING');
  const list = useLoad(() => api<PwRequest[]>('/password-requests', { query: { status: tab === 'PENDING' ? 'PENDING' : undefined } }), [tab]);
  const [confirm, setConfirm] = useState<{ r: PwRequest; status: 'DONE' | 'REJECTED' } | null>(null);
  const [creds, setCreds] = useState<{ name: string; username: string; password: string } | null>(null);
  const act = useAction();
  const rows = (list.data ?? []).filter((r) => (tab === 'PENDING' ? r.status === 'PENDING' : r.status !== 'PENDING'));

  async function handle() {
    if (!confirm) return;
    const { r, status } = confirm;
    const res = await act.run(
      () => api<{ username?: string; temporaryPassword?: string }>(`/password-requests/${r.id}`, { body: { status } }),
      status === 'DONE' ? `Đã cấp mật khẩu tạm cho ${r.fullName}` : `Đã từ chối yêu cầu của ${r.fullName}`,
    );
    setConfirm(null);
    if (res) {
      if (res.username && res.temporaryPassword) setCreds({ name: r.fullName, username: res.username, password: res.temporaryPassword });
      list.reload();
      window.dispatchEvent(new Event('pw-requests-changed'));
    }
  }

  return (
    <div className="page stack">
      <PageHead title="Yêu cầu cấp lại mật khẩu" sub="Khách gửi từ trang “Quên mật khẩu”. Gọi lại đúng số điện thoại để xác minh trước khi cấp mật khẩu tạm." />
      <Segmented<Tab> label="Lọc yêu cầu" value={tab} onChange={setTab} options={[{ value: 'PENDING', label: 'Chờ xử lý' }, { value: 'HANDLED', label: 'Đã xử lý' }]} />
      <ErrorAlert error={list.error ?? act.error} />
      <OkAlert message={act.message} />
      {list.loading && !list.data && <Loading />}
      {list.data && rows.length === 0 && <Empty>{tab === 'PENDING' ? 'Không có yêu cầu nào đang chờ.' : 'Chưa có yêu cầu đã xử lý.'}</Empty>}
      <div className="grid" style={{ ['--min' as string]: '320px' }}>
        {rows.map((r) => (
          <article key={r.id} className="card stack request-card" aria-label={`Yêu cầu của ${r.fullName}`}>
            <div className="spread">
              <strong className="display big-name">{r.fullName}</strong>
              {r.status === 'PENDING' ? <span className="badge warn">Chờ xử lý</span> : r.status === 'DONE' ? <span className="badge ok">Đã cấp</span> : <span className="badge neutral">Đã từ chối</span>}
            </div>
            <dl className="info-list compact">
              <div><dt>Số điện thoại</dt><dd className="mono">{r.phone}</dd></div>
              <div><dt>Gửi lúc</dt><dd>{dateTime(r.createdAt)}</dd></div>
              <div><dt>Tài khoản khớp</dt><dd>{r.account ? <>{r.account.username}{r.account.customerName ? ` · ${r.account.customerName}` : ''}{!r.account.active && <span className="badge bad" style={{ marginLeft: 6 }}>Đã khóa</span>}</> : <span className="tone-warn">Không tìm thấy tài khoản</span>}</dd></div>
              {r.note && <div><dt>Ghi chú</dt><dd>{r.note}</dd></div>}
              {r.handledBy && <div><dt>Xử lý</dt><dd>{r.handledBy} · {r.handledAt ? dateTime(r.handledAt) : ''}</dd></div>}
            </dl>
            {r.account && r.account.customerName && r.account.customerName !== r.fullName && (
              <div className="alert warn">Tên khai báo khác tên trong hồ sơ ({r.account.customerName}) — xác minh kỹ khi gọi lại.</div>
            )}
            {r.status === 'PENDING' && (
              <div className="row">
                <button type="button" className="btn btn-gold btn-sm" disabled={!r.account || act.busy} onClick={() => setConfirm({ r, status: 'DONE' })}>Đã xác minh — cấp mật khẩu tạm</button>
                <button type="button" className="btn btn-danger btn-sm" disabled={act.busy} onClick={() => setConfirm({ r, status: 'REJECTED' })}>Từ chối</button>
              </div>
            )}
          </article>
        ))}
      </div>
      {confirm && (
        <Modal
          title={confirm.status === 'DONE' ? `Cấp mật khẩu tạm cho ${confirm.r.fullName}?` : `Từ chối yêu cầu của ${confirm.r.fullName}?`}
          eyebrow={confirm.r.phone}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline" onClick={() => setConfirm(null)}>Hủy bỏ</button>
              <button type="button" className={confirm.status === 'DONE' ? 'btn btn-gold' : 'btn btn-danger'} disabled={act.busy} onClick={handle}>
                {confirm.status === 'DONE' ? 'Cấp mật khẩu tạm' : 'Từ chối'}
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            {confirm.status === 'DONE' ? 'Chỉ cấp khi đã gọi lại đúng số điện thoại và khách xác nhận thông tin. Mật khẩu cũ sẽ không dùng được nữa.' : 'Yêu cầu được đánh dấu đã từ chối; khách có thể gửi yêu cầu mới.'}
          </p>
        </Modal>
      )}
      {creds && <CredentialsDialog title="Mật khẩu tạm cho khách" name={creds.name} username={creds.username} password={creds.password} onClose={() => setCreds(null)} who="khách" />}
    </div>
  );
}
