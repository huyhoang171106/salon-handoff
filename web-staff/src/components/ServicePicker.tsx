import { vnd } from '../lib/format';
import type { Service } from '../lib/types';

/** Chọn nhiều dịch vụ, nhóm theo danh mục. */
export function ServicePicker({ services, value, onChange }: { services: Service[]; value: number[]; onChange: (ids: number[]) => void }) {
  const active = services.filter((s) => s.status === 'ACTIVE');
  const cats = [...new Set(active.map((s) => s.category))];
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="stack" style={{ gap: 12 }}>
      {cats.map((c) => (
        <fieldset key={c} className="plain-fieldset">
          <legend className="eyebrow">{c}</legend>
          <div className="grid" style={{ ['--min' as string]: '200px', gap: 8 }}>
            {active
              .filter((s) => s.category === c)
              .map((s) => (
                <button key={s.id} type="button" className="pick pick-sm" aria-pressed={value.includes(s.id)} onClick={() => toggle(s.id)}>
                  <strong className="small">{s.name}</strong>
                  <span className="muted small">
                    {s.priceFrom ? 'Từ ' : ''}
                    {vnd(s.basePrice)} · {s.durationMinutes} phút
                  </span>
                </button>
              ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
