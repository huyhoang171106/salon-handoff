import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'salon_theme';

function readStored(fallback: Theme): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

/** Chế độ sáng/tối: lưu lựa chọn theo trình duyệt, đặt data-theme lên <html>. */
export function useTheme(defaultTheme: Theme) {
  const [theme, setTheme] = useState<Theme>(() => readStored(defaultTheme));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button type="button" className="btn btn-outline btn-sm" onClick={onToggle} aria-label="Chuyển chế độ sáng/tối">
      {theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
    </button>
  );
}
