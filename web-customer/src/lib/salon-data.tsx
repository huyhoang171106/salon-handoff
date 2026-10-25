import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api } from './api';
import type { SalonInfo, Service, Stylist } from './types';

/** Dữ liệu công khai dùng chung (thông tin salon, dịch vụ, stylist) — tải một lần. */
interface SalonData {
  info: SalonInfo | null;
  services: Service[];
  stylists: Stylist[];
  loading: boolean;
  error: string | null;
}

const Ctx = createContext<SalonData>({ info: null, services: [], stylists: [], loading: true, error: null });

export function SalonDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SalonData>({ info: null, services: [], stylists: [], loading: true, error: null });

  useEffect(() => {
    Promise.all([api<SalonInfo>('/salon-info'), api<Service[]>('/services'), api<Stylist[]>('/stylists')])
      .then(([info, services, stylists]) =>
        setState({ info, services: services.filter((s) => s.status === 'ACTIVE'), stylists, loading: false, error: null }),
      )
      .catch((e: Error) => setState((s) => ({ ...s, loading: false, error: e.message || 'Không tải được dữ liệu salon' })));
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useSalonData = () => useContext(Ctx);

/** Giá hiển thị: "Từ 500.000 ₫" khi giá khởi điểm. */
export function priceText(s: Pick<Service, 'basePrice' | 'priceFrom'>, vnd: (n: number) => string) {
  return (s.priceFrom ? 'Từ ' : '') + vnd(s.basePrice);
}
