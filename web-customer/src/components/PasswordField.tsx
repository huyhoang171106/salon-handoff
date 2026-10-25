import { useId, useState } from 'react';
import { passwordChecks } from '../lib/password';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  error?: string | null;
  /** Hiện danh sách tiêu chí mật khẩu (dùng cho mật khẩu mới) */
  showRules?: boolean;
  name?: string;
}

/** Ô mật khẩu có nút hiện/ẩn, lỗi tại chỗ và gợi ý quy tắc. */
export default function PasswordField({ label, value, onChange, autoComplete, error, showRules, name }: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const describedBy = [error ? `${id}-err` : '', showRules ? `${id}-rules` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id} className="lbl">
        {label}
      </label>
      <div className="pw-wrap">
        <input
          id={id}
          name={name}
          className="input"
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className="pw-toggle"
          aria-label={visible ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? 'Ẩn' : 'Hiện'}
        </button>
      </div>
      {showRules && (
        <ul id={`${id}-rules`} className="pw-rules" aria-label="Yêu cầu mật khẩu">
          {passwordChecks(value).map((c) => (
            <li key={c.label} className={c.ok ? 'is-ok' : undefined}>
              <span className="pw-rules__mark" aria-hidden="true" />
              {c.label}
              <span className="sr-only">{c.ok ? ' — đạt' : ' — chưa đạt'}</span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <span id={`${id}-err`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
