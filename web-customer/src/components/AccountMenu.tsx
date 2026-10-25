import { KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/** Menu tài khoản trên header: nút + danh sách lựa chọn, Esc / bấm ra ngoài để đóng. */
export default function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const firstName = (user?.name ?? '').trim().split(/\s+/).slice(-1)[0] || 'Tài khoản';

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    // Đưa focus vào mục đầu tiên khi mở
    wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    const items = [...(wrapRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div className="acct-menu" ref={wrapRef} onKeyDown={onKeyDown}>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-outline"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="acct-menu__avatar" aria-hidden="true">
          {firstName[0]?.toUpperCase()}
        </span>
        <span>Tài khoản</span>
        <span className="sr-only">của {user?.name}</span>
        <span className={`acct-menu__caret${open ? ' is-open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Tài khoản" className="acct-menu__list sheet">
          <div className="acct-menu__who small muted" role="presentation">
            {user?.name}
            {user?.username && <span className="acct-menu__user">{user.username}</span>}
          </div>
          <Link role="menuitem" to="/tai-khoan" className="acct-menu__item">
            Tài khoản của tôi
          </Link>
          <Link role="menuitem" to="/doi-mat-khau" className="acct-menu__item">
            Đổi mật khẩu
          </Link>
          <button
            role="menuitem"
            type="button"
            className="acct-menu__item acct-menu__item--danger"
            onClick={() => {
              navigate('/');
              // Đăng xuất sau khi rời trang cần đăng nhập, tránh bị chuyển sang /dang-nhap
              window.setTimeout(logout, 0);
            }}
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
