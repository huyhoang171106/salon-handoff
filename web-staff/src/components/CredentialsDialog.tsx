import { useState } from 'react';
import { Modal } from './Overlay';

/** Hiển thị tên đăng nhập + mật khẩu tạm đúng một lần. */
export function CredentialsDialog({ title = 'Thông tin đăng nhập', name, username, password, onClose, who = 'nhân viên' }: { title?: string; name?: string; username: string; password: string; onClose: () => void; who?: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Tên đăng nhập: ${username}\nMật khẩu tạm: ${password}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Modal
      title={title}
      eyebrow={name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={copy}>{copied ? 'Đã sao chép' : 'Sao chép'}</button>
          <button type="button" className="btn btn-gold" onClick={onClose}>Đã ghi lại</button>
        </>
      }
    >
      <div className="stack">
        <CredentialBox username={username} password={password} />
        <div className="alert warn" role="note">Chỉ hiển thị một lần, {who} phải đổi ở lần đăng nhập đầu.</div>
        <span className="sr-only" aria-live="polite">{copied ? 'Đã sao chép vào bộ nhớ tạm' : ''}</span>
      </div>
    </Modal>
  );
}

export function CredentialBox({ username, password }: { username: string; password: string }) {
  return (
    <dl className="cred-box">
      <div><dt>Tên đăng nhập</dt><dd className="mono">{username}</dd></div>
      <div><dt>Mật khẩu tạm</dt><dd className="mono" data-testid="temp-password">{password}</dd></div>
    </dl>
  );
}
