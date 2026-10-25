import { ReactNode } from 'react';
import type { LabelMap } from '../lib/labels';

/** Nhãn trạng thái: màu luôn đi kèm chữ. */
export function StatusBadge({ map, value }: { map: LabelMap; value: string }) {
  const s = map[value] ?? { label: value, tone: 'neutral' };
  return <span className={`badge ${s.tone}`}>{s.label}</span>;
}

export function ErrorAlert({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <div className="alert bad" role="alert">
      {error}
    </div>
  );
}

export function OkAlert({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="alert ok" role="status">
      {message}
    </div>
  );
}

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="muted small" role="status" aria-live="polite">
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function PageHead({ eyebrow, title, actions, sub }: { eyebrow?: ReactNode; title: ReactNode; actions?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="stack" style={{ gap: 4 }}>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="muted small" style={{ margin: 0 }}>{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted small">{hint}</small>}
    </label>
  );
}

export function Section({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="section-head">
          {title && <h2 className="section-title">{title}</h2>}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Ô KPI. */
export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'gold' | 'bad' }) {
  return (
    <div className="card kpi">
      <div className="eyebrow">{label}</div>
      <div className={`kpi-value${tone ? ' kpi-' + tone : ''}`}>{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

/** Nhóm nút chọn một (radio dạng nút). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className="seg" onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
