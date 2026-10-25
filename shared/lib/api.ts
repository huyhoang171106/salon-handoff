/** Gọi API backend. Token lưu trong localStorage theo từng app. */
const TOKEN_KEY = import.meta.env.VITE_TOKEN_KEY ?? 'salon_token';

export class ApiError extends Error {
  constructor(public status: number, message: string, public rule?: string) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* trình duyệt chặn storage */
  }
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown; query?: Record<string, unknown> } = {}): Promise<T> {
  const qs = options.query
    ? '?' + Object.entries(options.query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}${qs}`, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join('. ') : data?.message ?? `Lỗi ${res.status}`;
    if (res.status === 401 && token) setToken(null);
    throw new ApiError(res.status, msg, data?.rule);
  }
  return data as T;
}
