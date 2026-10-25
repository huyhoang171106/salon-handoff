import { ReactNode, useEffect, useId, useRef } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** modal: hộp giữa màn hình; drawer: ngăn kéo bên phải */
  kind?: 'modal' | 'drawer';
  wide?: boolean;
  eyebrow?: ReactNode;
}

/** Hộp thoại / ngăn kéo dùng chung: Esc để đóng, khóa cuộn nền, trả lại focus khi đóng. */
export function Overlay({ title, onClose, children, footer, kind = 'modal', wide, eyebrow }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  return (
    <div className={`overlay overlay-${kind}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`dialog dialog-${kind}${wide ? ' dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <div className="dialog-head">
          <div className="stack" style={{ gap: 4 }}>
            {eyebrow && <div className="label">{eyebrow}</div>}
            <h2 id={id} className="dialog-title">{title}</h2>
          </div>
          <button type="button" className="btn btn-ghost btn-sm icon-btn" onClick={onClose} aria-label="Đóng">
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Modal = (p: Omit<Props, 'kind'>) => <Overlay {...p} kind="modal" />;
export const Drawer = (p: Omit<Props, 'kind'>) => <Overlay {...p} kind="drawer" />;
