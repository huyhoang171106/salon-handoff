import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message === 'Failed to fetch' ? 'Không kết nối được máy chủ' : e.message;
  return 'Đã có lỗi xảy ra';
}

/** Tải dữ liệu bất đồng bộ, tự tải lại khi deps đổi. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(() => {
    const my = ++seq.current;
    setLoading(true);
    return fn()
      .then((d) => {
        if (my === seq.current) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => my === seq.current && setError(errMsg(e)))
      .finally(() => my === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Chạy một thao tác (gọi API) với trạng thái bận / lỗi / thông báo. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = useCallback(async <R,>(fn: () => Promise<R>, success?: string | ((r: R) => string)): Promise<R | undefined> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await fn();
      if (success) setMessage(typeof success === 'function' ? success(r) : success);
      return r;
    } catch (e) {
      setError(errMsg(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  const reset = useCallback(() => {
    setError(null);
    setMessage(null);
  }, []);
  return { busy, error, message, run, reset, setError, setMessage };
}

/** "YYYY-MM-DD" cộng n ngày. */
export function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Thứ Hai của tuần chứa ngày ymd. */
export function mondayOf(ymd: string): string {
  const dow = new Date(ymd + 'T00:00:00Z').getUTCDay();
  return addDays(ymd, dow === 0 ? -6 : 1 - dow);
}

export function monthNow(): string {
  return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
}

/** Số phút trong ngày (giờ VN) của một mốc ISO. */
export function vnMinutes(iso: string): number {
  const d = new Date(new Date(iso).getTime() + 7 * 3600000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function nowMinutesVN(): number {
  return vnMinutes(new Date().toISOString());
}

export function customerName(c: { fullName: string } | null | undefined, fallback?: string | null): string {
  return c?.fullName ?? fallback ?? 'Khách lẻ';
}

/** Ẩn bớt số điện thoại: 0988 ••• 571 */
export function maskPhone(p: string): string {
  if (!p || p.length < 7) return p;
  return `${p.slice(0, 4)} ••• ${p.slice(-3)}`;
}

export const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
