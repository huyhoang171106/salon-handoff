import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Note {
  key: string;
  tone: 'ok' | 'bad' | 'warn' | 'info';
  title: string;
  body: string;
  invoiceId?: number;
}

const POLL_MS = 15_000;
const SHOW_MS = 10_000;

/** Popup cho khách đã đăng nhập: salon xác nhận / hủy lịch, trạng thái giao dịch thanh toán. */
export default function Notifier() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const since = useRef<string | null>(null);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (user?.role !== 'CUSTOMER') return;
    since.current = null; // lần gọi đầu chỉ lấy mốc, không hiện chuyện cũ
    let alive = true;
    const tick = async () => {
      try {
        const r = await api<{ now: string; items: Note[] }>('/notifications', { query: { since: since.current } });
        if (!alive) return;
        since.current = r.now;
        const fresh = r.items.filter((n) => !seen.current.has(n.key));
        fresh.forEach((n) => seen.current.add(n.key));
        if (fresh.length) setNotes((xs) => [...xs, ...fresh].slice(-5));
      } catch {
        /* mất kết nối: thử lại ở lượt sau */
      }
    };
    tick();
    const t = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [user?.accountId]);

  if (user?.role !== 'CUSTOMER') return null;
  const close = (key: string) => setNotes((xs) => xs.filter((n) => n.key !== key));

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {notes.map((n) => (
        <Toast key={n.key} note={n} to={n.invoiceId ? '/tai-khoan#lich-su' : '/tai-khoan#lich-hen'} onClose={() => close(n.key)} />
      ))}
    </div>
  );
}

function Toast({ note, to, onClose }: { note: Note; to: string; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, SHOW_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={`toast ${note.tone}`}>
      <div className="toast-body">
        <strong>{note.title}</strong>
        <span>{note.body}</span>
        <Link to={to} onClick={onClose}>Xem chi tiết</Link>
      </div>
      <button type="button" className="toast-close" aria-label="Đóng thông báo" onClick={onClose}>
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
