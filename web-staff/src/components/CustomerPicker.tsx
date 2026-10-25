import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Customer } from '../lib/types';

export interface Contact {
  id?: number;
  fullName: string;
  phone: string;
}

/** Tìm khách cũ theo tên/SĐT hoặc nhập khách mới (họ tên + SĐT). */
export function CustomerPicker({ value, onChange, optional }: { value: Contact; onChange: (c: Contact) => void; optional?: boolean }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api<Customer[]>('/customers', { query: { q: q.trim() } })
        .then((r) => setResults(r.filter((c) => c.phone !== '0000000000').slice(0, 6)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <label className="field">
        <span>Tìm khách cũ (tên hoặc số điện thoại)</span>
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="VD: 0988 hoặc Lan" />
      </label>
      {results.length > 0 && (
        <ul className="pick-list" aria-label="Kết quả tìm khách">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="pick pick-sm"
                aria-pressed={value.id === c.id}
                onClick={() => {
                  onChange({ id: c.id, fullName: c.fullName, phone: c.phone });
                  setQ('');
                  setResults([]);
                }}
              >
                <span className="row" style={{ gap: 8 }}>
                  <strong className="small">{c.fullName}</strong>
                  {c.isMember && <span className="badge gold">Thành viên</span>}
                  {c.noShowCount > 0 && <span className="badge bad">Vắng {c.noShowCount} lần</span>}
                </span>
                <span className="muted small">
                  {c.phone} · {c.code}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="form-grid">
        <label className="field">
          <span>Họ tên khách{optional ? ' (không bắt buộc)' : ''}</span>
          <input className="input" value={value.fullName} onChange={(e) => onChange({ fullName: e.target.value, phone: value.phone })} autoComplete="off" />
        </label>
        <label className="field">
          <span>Số điện thoại{optional ? ' (không bắt buộc)' : ''}</span>
          <input className="input" inputMode="tel" value={value.phone} onChange={(e) => onChange({ fullName: value.fullName, phone: e.target.value })} placeholder="0988…" autoComplete="off" />
        </label>
      </div>
      {value.id && <p className="small muted" style={{ margin: 0 }}>Đang chọn hồ sơ khách cũ. Sửa họ tên/SĐT sẽ dùng như khách mới.</p>}
    </div>
  );
}
