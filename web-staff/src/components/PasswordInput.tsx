import { useId, useState } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  hint?: string;
  placeholder?: string;
  name?: string;
}

/** Ô mật khẩu có nút hiện/ẩn. */
export function PasswordInput({ label, value, onChange, autoComplete, hint, placeholder, name }: Props) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="lbl">{label}</label>
      <div className="pw-wrap">
        <input
          id={id}
          name={name}
          className="input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button type="button" className="pw-toggle" aria-pressed={show} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShow(!show)}>
          {show ? 'Ẩn' : 'Hiện'}
        </button>
      </div>
      {hint && <small id={`${id}-hint`} className="muted small">{hint}</small>}
    </div>
  );
}
