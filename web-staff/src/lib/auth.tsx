import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

export type Role = 'OWNER' | 'RECEPTIONIST' | 'STYLIST' | 'ASSISTANT' | 'CUSTOMER';
export interface User {
  accountId: number;
  role: Role;
  employeeId: number | null;
  customerId: number | null;
  name: string;
  username?: string;
  /** true: tài khoản mới tạo / vừa được cấp lại mật khẩu — phải đổi mật khẩu trước khi dùng tiếp. */
  mustChangePassword?: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (data: { fullName: string; phone: string; password: string; birthDate?: string }) => Promise<User>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<User>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api<{ accessToken: string; user: User }>('/auth/login', { body: { username, password } });
    setToken(r.accessToken);
    setUser(r.user);
    return r.user;
  }, []);

  const register = useCallback(async (data: { fullName: string; phone: string; password: string; birthDate?: string }) => {
    const r = await api<{ accessToken: string; user: User }>('/auth/register', { body: data });
    setToken(r.accessToken);
    setUser(r.user);
    return r.user;
  }, []);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    const r = await api<{ accessToken: string; user: User }>('/auth/change-password', { body: { oldPassword, newPassword } });
    setToken(r.accessToken);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, login, register, changePassword, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth phải nằm trong AuthProvider');
  return c;
}
